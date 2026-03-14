// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IWeb2Oracle.sol";
import "../interfaces/IAgentMarketplace.sol";
import "../libraries/DataTypes.sol";

/**
 * @title Web2Oracle
 * @author Hey Elsa & The AI Council
 * @notice The Web2 Verification Oracle — the critical bridge between off-chain
 *         task execution and the on-chain reputation economy.
 *
 *         Because a smart contract cannot natively verify that an email was
 *         sent, a Notion report was written, or a Slack message was posted,
 *         this contract acts as a trusted intermediary that anchors
 *         cryptographic proofs of off-chain execution on-chain and reports
 *         verified outcomes back to the AgentMarketplace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  THE ORACLE FEEDBACK LOOP
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │                                                                     │
 *   │  1. WEB2 provider agent executes the off-chain task                 │
 *   │     (e.g. drafts a newsletter in Notion via API).                   │
 *   │                                                                     │
 *   │  2. Agent generates a cryptographic proof of execution:             │
 *   │       • TLSNotary proof  — proves the HTTPS API call succeeded      │
 *   │         and the server returned a 2xx response.                     │
 *   │       • Or a signed API receipt / webhook callback from the         │
 *   │         target service (Gmail delivery receipt, Notion page ID,     │
 *   │         Slack message timestamp, etc.).                             │
 *   │                                                                     │
 *   │  3. Authorised oracle operator calls submitProof() on-chain,        │
 *   │     anchoring keccak256(proofData) in contract storage and          │
 *   │     emitting the raw proof bytes in an event for indexers.          │
 *   │                                                                     │
 *   │  4. Oracle operator (or automated keeper) validates the proof       │
 *   │     off-chain (replays the TLS session or verifies the receipt      │
 *   │     signature). If valid → verifyAndReport(). If invalid →          │
 *   │     rejectProof().                                                  │
 *   │                                                                     │
 *   │  5a. verifyAndReport() calls AgentMarketplace.completeTask():       │
 *   │        • Task status → COMPLETED                                    │
 *   │        • ReputationEngine records a SUCCESS for the provider        │
 *   │        • TaskEscrow releases payment to the provider agent owner    │
 *   │                                                                     │
 *   │  5b. rejectProof() calls AgentMarketplace.failTask():               │
 *   │        • Task status → FAILED                                       │
 *   │        • ReputationEngine records a FAILURE for the provider        │
 *   │        • TaskEscrow refunds payment to the requester (Hey Elsa)     │
 *   │                                                                     │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  PROOF INTEGRITY GUARANTEE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   On submitProof(), the contract independently recomputes keccak256 of the
 *   supplied raw tlsProofData and asserts it equals the declared proofHash.
 *   This means:
 *     • The on-chain hash is always consistent with the emitted raw data.
 *     • A malicious oracle operator cannot anchor a fabricated hash while
 *       providing different bytes — the check catches any mismatch.
 *     • The raw proof bytes are emitted in a ProofDataAnchored event so
 *       any off-chain party can independently re-verify against the hash
 *       stored in state.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ACCESS CONTROL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   DEFAULT_ADMIN_ROLE   – Deployer / multisig. Grants and revokes roles.
 *   ORACLE_OPERATOR_ROLE – Trusted addresses authorised to submit and
 *                          verify proofs. In production this is a set of
 *                          geographically distributed oracle nodes running
 *                          TLSNotary verification software. The multisig
 *                          can rotate operators without redeploying.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  STATE MACHINE PER TASK
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   (no proof)
 *       │
 *       │  submitProof()
 *       ▼
 *   SUBMITTED ──► verifyAndReport() ──► VERIFIED  (→ marketplace COMPLETED)
 *             └─► rejectProof()     ──► REJECTED  (→ marketplace FAILED)
 *
 *   Once a proof reaches VERIFIED or REJECTED it is terminal — no further
 *   state changes are permitted for that taskId in this contract.
 */
contract Web2Oracle is IWeb2Oracle, AccessControl, ReentrancyGuard {
    // =========================================================================
    // ROLES
    // =========================================================================

    /// @notice Role granted to trusted oracle operator addresses.
    ///         Holders may call submitProof(), verifyAndReport(), rejectProof().
    bytes32 public constant ORACLE_OPERATOR_ROLE =
        keccak256("ORACLE_OPERATOR_ROLE");

    // =========================================================================
    // PROOF STATE FLAGS
    // =========================================================================

    /// @dev Internal state flags for the per-task proof lifecycle.
    ///      Stored as a uint8 to pack cleanly; values are:
    ///        0 = NONE       — no proof has been submitted yet
    ///        1 = SUBMITTED  — proof submitted, awaiting verification
    ///        2 = VERIFIED   — proof verified, marketplace notified (success)
    ///        3 = REJECTED   — proof rejected, marketplace notified (failure)
    uint8 private constant PROOF_NONE = 0;
    uint8 private constant PROOF_SUBMITTED = 1;
    uint8 private constant PROOF_VERIFIED = 2;
    uint8 private constant PROOF_REJECTED = 3;

    // =========================================================================
    // STATE
    // =========================================================================

    /// @notice Address of the AgentMarketplace contract.
    ///         Called back on verifyAndReport() and rejectProof() to finalise
    ///         the task and update reputation.
    IAgentMarketplace public immutable marketplace;

    /// @notice taskId → ExecutionProof metadata (proofHash, submitter, timestamps).
    ///         proofHash == bytes32(0) means no proof has been submitted.
    mapping(uint256 => DataTypes.ExecutionProof) private _proofs;

    /// @notice taskId → proof state flag (NONE / SUBMITTED / VERIFIED / REJECTED).
    mapping(uint256 => uint8) private _proofState;

    /// @notice taskId → measured response time in milliseconds, captured at
    ///         submitProof() time and forwarded to completeTask() so the
    ///         marketplace can update the agent's rolling speed metric.
    mapping(uint256 => uint256) private _responseTimes;

    // =========================================================================
    // CUSTOM ERRORS
    // =========================================================================

    // Errors NotOracleOperator, ProofAlreadySubmitted, ProofNotSubmitted,
    // ProofAlreadyVerified, InvalidProofHash, and EmptyProofData are inherited
    // from IWeb2Oracle — do not redeclare them here.

    /// @notice The proof has already been rejected — cannot re-verify.
    error ProofAlreadyRejected(uint256 taskId);

    /// @notice The supplied proofHash does not equal keccak256(tlsProofData).
    error ProofHashMismatch(bytes32 declared, bytes32 computed);

    /// @notice The responseTimeMs supplied at proof submission was zero.
    ///         Zero is reserved as "no data"; use 1 ms as the minimum.
    error ZeroResponseTime();

    /// @notice The marketplace address supplied in the constructor was zero.
    error ZeroMarketplaceAddress();

    // =========================================================================
    // EVENTS (supplementing IWeb2Oracle)
    // =========================================================================

    /**
     * @notice Emitted alongside ProofSubmitted to anchor the raw proof bytes
     *         on-chain in an event log. Indexers and auditors can independently
     *         hash this data and confirm it matches the stored proofHash.
     *
     * @param taskId        The task this raw data belongs to.
     * @param proofHash     keccak256 of tlsProofData (also stored in state).
     * @param tlsProofData  Raw proof bytes (TLSNotary session, API receipt, …).
     */
    event ProofDataAnchored(
        uint256 indexed taskId,
        bytes32 indexed proofHash,
        bytes tlsProofData
    );

    /**
     * @notice Emitted when verifyAndReport() successfully calls back into the
     *         AgentMarketplace to mark the task completed.
     *
     * @param taskId         The task that was completed on the marketplace.
     * @param agentId        The provider agent that executed the task.
     * @param proofHash      The proof hash that was verified.
     * @param responseTimeMs The execution time forwarded to the marketplace.
     */
    event MarketplaceNotifiedSuccess(
        uint256 indexed taskId,
        uint256 indexed agentId,
        bytes32 proofHash,
        uint256 responseTimeMs
    );

    /**
     * @notice Emitted when rejectProof() successfully calls back into the
     *         AgentMarketplace to mark the task failed.
     *
     * @param taskId   The task that was failed on the marketplace.
     * @param agentId  The provider agent whose task was rejected.
     * @param reason   Human-readable rejection reason.
     */
    event MarketplaceNotifiedFailure(
        uint256 indexed taskId,
        uint256 indexed agentId,
        string reason
    );

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    /// @dev Restricts a function to authorised oracle operator addresses.
    modifier onlyOracleOperator() {
        if (!hasRole(ORACLE_OPERATOR_ROLE, msg.sender))
            revert NotOracleOperator(msg.sender);
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * @param admin_       Address that receives DEFAULT_ADMIN_ROLE and can
     *                     grant / revoke ORACLE_OPERATOR_ROLE. Should be the
     *                     deployer multisig.
     * @param marketplace_ Address of the deployed AgentMarketplace contract.
     *                     Immutable — a new oracle must be deployed and
     *                     granted ORACLE_ROLE on the marketplace to rotate.
     */
    constructor(address admin_, address marketplace_) {
        if (admin_ == address(0)) revert ZeroMarketplaceAddress(); // reuse error
        if (marketplace_ == address(0)) revert ZeroMarketplaceAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        marketplace = IAgentMarketplace(marketplace_);
    }

    // =========================================================================
    // EXTERNAL WRITE — ORACLE_OPERATOR_ROLE
    // =========================================================================

    /**
     * @inheritdoc IWeb2Oracle
     *
     * @dev Workflow:
     *        1. Validate caller, inputs, and that no proof exists yet.
     *        2. Recompute keccak256(tlsProofData) and assert it equals proofHash.
     *           This binds the on-chain hash irreversibly to the supplied bytes.
     *        3. Write the ExecutionProof record to storage (SUBMITTED state).
     *        4. Store responseTimeMs for use in verifyAndReport().
     *        5. Emit ProofSubmitted (indexed by taskId + proofHash) and
     *           ProofDataAnchored (carries the raw bytes for indexers).
     *
     * @param taskId        The marketplace task this proof belongs to. The task
     *                      must exist and be in ASSIGNED status on the marketplace
     *                      (enforced by the marketplace's completeTask / failTask).
     * @param proofHash     keccak256 of tlsProofData. Must equal the on-chain
     *                      recomputed hash — mismatches revert with ProofHashMismatch.
     * @param tlsProofData  Raw proof bytes. Must be non-empty. The content is
     *                      implementation-defined (TLSNotary session export,
     *                      base64-encoded API receipt, signed webhook payload, …).
     *                      Only the hash is stored in state; the full bytes live
     *                      in the event log for off-chain retrieval.
     * @param responseTimeMs Wall-clock time from task assignment to completion,
     *                       in milliseconds. Forwarded to the marketplace's
     *                       completeTask() call so the reputation engine can
     *                       update the agent's rolling speed metric accurately.
     *                       Must be > 0 (use 1 if genuinely instantaneous).
     */
    function submitProof(
        uint256 taskId,
        bytes32 proofHash,
        bytes calldata tlsProofData,
        uint256 responseTimeMs
    ) external onlyOracleOperator {
        // ── Checks ───────────────────────────────────────────────────────────

        if (_proofState[taskId] != PROOF_NONE)
            revert ProofAlreadySubmitted(taskId);

        if (proofHash == bytes32(0)) revert InvalidProofHash();
        if (tlsProofData.length == 0) revert EmptyProofData();
        if (responseTimeMs == 0) revert ZeroResponseTime();

        // Bind hash to data — the oracle cannot declare a hash for different bytes
        bytes32 computed = keccak256(tlsProofData);
        if (computed != proofHash)
            revert ProofHashMismatch(proofHash, computed);

        // ── Effects ───────────────────────────────────────────────────────────

        _proofs[taskId] = DataTypes.ExecutionProof({
            taskId: taskId,
            proofHash: proofHash,
            submitter: msg.sender,
            verified: false,
            submittedAt: block.timestamp,
            verifiedAt: 0
        });

        _proofState[taskId] = PROOF_SUBMITTED;
        _responseTimes[taskId] = responseTimeMs;

        // ── Events ────────────────────────────────────────────────────────────

        // Primary event — indexed for fast lookup by taskId and proofHash
        emit ProofSubmitted(taskId, proofHash, msg.sender);

        // Secondary event — carries raw bytes for off-chain auditors / indexers
        // emitted AFTER state changes (no reentrancy risk here; no external calls)
        emit ProofDataAnchored(taskId, proofHash, tlsProofData);
    }

    /**
     * @inheritdoc IWeb2Oracle
     *
     * @dev The oracle operator calls this after independently validating the
     *      proof off-chain (replaying the TLS session or verifying the receipt
     *      signature). On success this function:
     *        1. Advances proof state from SUBMITTED → VERIFIED.
     *        2. Records the verifiedAt timestamp.
     *        3. Calls AgentMarketplace.completeTask() with the stored proofHash
     *           and responseTimeMs, triggering:
     *             • Task status COMPLETED
     *             • ReputationEngine success update (EMA score ↑)
     *             • TaskEscrow payment released to the provider agent owner
     *        4. Emits ProofVerified and MarketplaceNotifiedSuccess.
     *
     *      The nonReentrant guard protects against a malicious marketplace
     *      implementation re-entering this function during the callback,
     *      though the marketplace is a trusted contract in this architecture.
     *
     * @param taskId  The task whose proof should be verified and reported.
     */
    function verifyAndReport(
        uint256 taskId
    ) external override onlyOracleOperator nonReentrant {
        // ── Checks ───────────────────────────────────────────────────────────

        uint8 state = _proofState[taskId];
        if (state == PROOF_NONE) revert ProofNotSubmitted(taskId);
        if (state == PROOF_VERIFIED) revert ProofAlreadyVerified(taskId);
        if (state == PROOF_REJECTED) revert ProofAlreadyRejected(taskId);
        // state must be PROOF_SUBMITTED at this point

        // ── Effects ───────────────────────────────────────────────────────────

        DataTypes.ExecutionProof storage proof = _proofs[taskId];
        proof.verified = true;
        proof.verifiedAt = block.timestamp;

        _proofState[taskId] = PROOF_VERIFIED;

        bytes32 proofHash = proof.proofHash;
        uint256 responseTimeMs = _responseTimes[taskId];

        // Retrieve the agentId for the success event (read-only call, safe)
        DataTypes.Task memory task = marketplace.getTask(taskId);
        uint256 agentId = task.selectedAgentId;

        // ── Interactions ──────────────────────────────────────────────────────

        // Notify the marketplace: triggers COMPLETED status + escrow release
        // The marketplace enforces that only ORACLE_ROLE may complete WEB2 tasks.
        marketplace.completeTask(taskId, proofHash, responseTimeMs);

        // ── Events ────────────────────────────────────────────────────────────

        emit ProofVerified(taskId, msg.sender);
        emit MarketplaceNotifiedSuccess(
            taskId,
            agentId,
            proofHash,
            responseTimeMs
        );
    }

    /**
     * @inheritdoc IWeb2Oracle
     *
     * @dev The oracle operator calls this when proof validation fails off-chain
     *      (invalid TLS session, forged receipt, API call actually returned an
     *      error code, etc.). On rejection this function:
     *        1. Advances proof state from SUBMITTED → REJECTED.
     *        2. Calls AgentMarketplace.failTask() with a human-readable reason,
     *           triggering:
     *             • Task status FAILED
     *             • ReputationEngine failure update (EMA score ↓)
     *             • TaskEscrow full refund to the original requester (Hey Elsa)
     *        3. Emits ProofRejected and MarketplaceNotifiedFailure.
     *
     * @param taskId  The task whose proof failed validation.
     * @param reason  Human-readable description of why the proof was rejected.
     *                Logged in ProofRejected and forwarded to the marketplace's
     *                TaskFailed event for full audit trail.
     */
    function rejectProof(
        uint256 taskId,
        string calldata reason
    ) external override onlyOracleOperator nonReentrant {
        // ── Checks ───────────────────────────────────────────────────────────

        uint8 state = _proofState[taskId];
        if (state == PROOF_NONE) revert ProofNotSubmitted(taskId);
        if (state == PROOF_VERIFIED) revert ProofAlreadyVerified(taskId);
        if (state == PROOF_REJECTED) revert ProofAlreadyRejected(taskId);
        // state must be PROOF_SUBMITTED at this point

        // ── Effects ───────────────────────────────────────────────────────────

        _proofState[taskId] = PROOF_REJECTED;

        // Retrieve the agentId for the failure event (read-only call, safe)
        DataTypes.Task memory task = marketplace.getTask(taskId);
        uint256 agentId = task.selectedAgentId;

        // ── Interactions ──────────────────────────────────────────────────────

        // Notify the marketplace: triggers FAILED status + escrow refund
        marketplace.failTask(taskId, reason);

        // ── Events ────────────────────────────────────────────────────────────

        emit ProofRejected(taskId, reason);
        emit MarketplaceNotifiedFailure(taskId, agentId, reason);
    }

    /**
     * @inheritdoc IWeb2Oracle
     *
     * @dev Grants or revokes ORACLE_OPERATOR_ROLE for a single address.
     *      Only the DEFAULT_ADMIN_ROLE holder may call this.
     *      Emits OracleOperatorUpdated for monitoring dashboards.
     *
     * @param operator  The address to update.
     * @param granted   True to grant operator access, false to revoke.
     */
    function setOracleOperator(
        address operator,
        bool granted
    ) external override onlyRole(DEFAULT_ADMIN_ROLE) {
        require(operator != address(0), "Web2Oracle: zero operator address");

        if (granted) {
            _grantRole(ORACLE_OPERATOR_ROLE, operator);
        } else {
            _revokeRole(ORACLE_OPERATOR_ROLE, operator);
        }

        emit OracleOperatorUpdated(operator, granted);
    }

    // =========================================================================
    // EXTERNAL READ
    // =========================================================================

    /**
     * @inheritdoc IWeb2Oracle
     *
     * @dev Returns true only when the proof has completed the full verification
     *      path (verifyAndReport() was called successfully). Returns false for
     *      NONE, SUBMITTED, and REJECTED states.
     */
    function isProofVerified(
        uint256 taskId
    ) external view override returns (bool) {
        return _proofState[taskId] == PROOF_VERIFIED;
    }

    /**
     * @inheritdoc IWeb2Oracle
     *
     * @dev Returns true for SUBMITTED, VERIFIED, and REJECTED states.
     *      Returns false only when no proof has been submitted yet (NONE).
     *      Useful for callers that need to check before calling submitProof().
     */
    function isProofSubmitted(
        uint256 taskId
    ) external view override returns (bool) {
        return _proofState[taskId] != PROOF_NONE;
    }

    /**
     * @inheritdoc IWeb2Oracle
     *
     * @dev Returns the full ExecutionProof struct. All fields are zero-valued
     *      if no proof has been submitted yet (proofHash == bytes32(0) acts
     *      as the existence sentinel alongside isProofSubmitted()).
     */
    function getProof(
        uint256 taskId
    ) external view override returns (DataTypes.ExecutionProof memory) {
        return _proofs[taskId];
    }

    /**
     * @inheritdoc IWeb2Oracle
     */
    function isOracleOperator(
        address operator
    ) external view override returns (bool) {
        return hasRole(ORACLE_OPERATOR_ROLE, operator);
    }

    /**
     * @notice Returns the current state of the proof lifecycle for a given task.
     *         Useful for monitoring dashboards and automated keepers.
     *
     * @param taskId  The task to query.
     * @return state  0 = NONE, 1 = SUBMITTED, 2 = VERIFIED, 3 = REJECTED.
     */
    function getProofState(uint256 taskId) external view returns (uint8 state) {
        return _proofState[taskId];
    }

    /**
     * @notice Returns the measured response time (in ms) that was submitted
     *         alongside the proof. Returns 0 if no proof has been submitted yet.
     *
     * @param taskId  The task to query.
     * @return responseTimeMs  Execution time in milliseconds.
     */
    function getResponseTime(
        uint256 taskId
    ) external view returns (uint256 responseTimeMs) {
        return _responseTimes[taskId];
    }
}
