// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/DataTypes.sol";

/**
 * @title IWeb2Oracle
 * @author Hey Elsa & The AI Council
 * @notice Interface for the Web2 Verification Oracle — the critical bridge that
 *         brings off-chain execution integrity into the on-chain reputation system.
 *
 *         Problem it solves:
 *         A smart contract cannot natively verify that an email was sent, a
 *         Notion report was written, or a Slack message was posted. Without
 *         verification, a malicious WEB2 provider could claim success, collect
 *         payment, and pollute the reputation engine with false data.
 *
 *         Solution — Proof of Execution flow:
 *         ┌─────────────────────────────────────────────────────────────────┐
 *         │  1. Web2 agent executes the off-chain task (e.g. sends email).  │
 *         │  2. Agent generates a cryptographic proof:                      │
 *         │       • TLSNotary proof — proves the HTTPS API call succeeded.  │
 *         │       • Or an API receipt / signed callback from the service.   │
 *         │  3. Authorised oracle operator calls submitProof() on-chain,    │
 *         │     anchoring the proof hash and raw data.                      │
 *         │  4. Oracle operator (or automation) calls verifyAndReport()     │
 *         │     after validating the proof off-chain.                       │
 *         │  5. Oracle calls back into AgentMarketplace to mark the task    │
 *         │     COMPLETED and triggers ReputationEngine to update the       │
 *         │     provider's dynamic score.                                   │
 *         └─────────────────────────────────────────────────────────────────┘
 */
interface IWeb2Oracle {
    // =========================================================================
    // EVENTS
    // =========================================================================

    /**
     * @notice Emitted when an oracle operator submits a proof for a WEB2 task.
     * @param taskId     The marketplace task ID this proof belongs to.
     * @param proofHash  keccak256 of the raw proof data (TLSNotary / receipt).
     * @param submitter  Address of the oracle operator who submitted the proof.
     */
    event ProofSubmitted(
        uint256 indexed taskId,
        bytes32 indexed proofHash,
        address indexed submitter
    );

    /**
     * @notice Emitted when the oracle successfully verifies a submitted proof
     *         and reports the result back to the marketplace.
     * @param taskId    The task whose proof was verified.
     * @param verifier  Address of the oracle operator who called verifyAndReport.
     */
    event ProofVerified(uint256 indexed taskId, address indexed verifier);

    /**
     * @notice Emitted when a submitted proof fails verification checks.
     * @param taskId  The task whose proof was rejected.
     * @param reason  Human-readable description of why the proof was rejected.
     */
    event ProofRejected(uint256 indexed taskId, string reason);

    /**
     * @notice Emitted when an oracle operator address is authorised or revoked.
     * @param operator  The address being updated.
     * @param granted   True if access was granted, false if revoked.
     */
    event OracleOperatorUpdated(address indexed operator, bool granted);

    // =========================================================================
    // ERRORS
    // =========================================================================

    /// @notice Thrown when a non-oracle-operator address calls a restricted function.
    error NotOracleOperator(address caller);

    /// @notice Thrown when submitting a proof for a task that already has one.
    error ProofAlreadySubmitted(uint256 taskId);

    /// @notice Thrown when verifying a proof that has not been submitted yet.
    error ProofNotSubmitted(uint256 taskId);

    /// @notice Thrown when attempting to verify a proof that is already verified.
    error ProofAlreadyVerified(uint256 taskId);

    /// @notice Thrown when the task referenced does not exist in the marketplace.
    error TaskNotFound(uint256 taskId);

    /// @notice Thrown when the task is not in ASSIGNED status (wrong lifecycle state).
    error TaskNotAssigned(uint256 taskId);

    /// @notice Thrown when the supplied proof hash is zero.
    error InvalidProofHash();

    /// @notice Thrown when the raw TLS proof data is empty.
    error EmptyProofData();

    // =========================================================================
    // EXTERNAL — WRITE
    // =========================================================================

    /**
     * @notice Submit a cryptographic proof of execution for a completed WEB2 task.
     *
     *         Only authorised oracle operators may call this function.
     *         The proof data is validated for basic integrity (non-empty, correct
     *         hash) and stored on-chain. The task must be in ASSIGNED status.
     *
     * @param taskId       The marketplace task ID for which proof is being submitted.
     * @param proofHash    keccak256 hash of `tlsProofData`. Must equal
     *                     keccak256(tlsProofData) — validated on-chain.
     * @param tlsProofData Raw proof bytes (TLSNotary session data, signed API
     *                     receipt, or equivalent). Stored in an event for
     *                     off-chain indexers; only the hash is kept in state.
     */
    function submitProof(
        uint256 taskId,
        bytes32 proofHash,
        bytes calldata tlsProofData,
        uint256 responseTimeMs
    ) external;

    /**
     * @notice Verify a previously submitted proof and report the outcome to the
     *         AgentMarketplace, triggering task completion and reputation update.
     *
     *         Only authorised oracle operators may call this function.
     *         Once verified:
     *           • AgentMarketplace marks the task COMPLETED.
     *           • ReputationEngine records a success for the provider agent.
     *           • TaskEscrow releases payment to the provider agent owner.
     *
     * @param taskId  The task whose proof should be verified and reported.
     */
    function verifyAndReport(uint256 taskId) external;

    /**
     * @notice Reject a submitted proof that failed off-chain validation and
     *         report the failure to the AgentMarketplace.
     *
     *         Only authorised oracle operators may call this function.
     *         Once rejected:
     *           • AgentMarketplace marks the task FAILED.
     *           • ReputationEngine records a failure for the provider agent.
     *           • TaskEscrow refunds payment to the original requester.
     *
     * @param taskId  The task whose proof is being rejected.
     * @param reason  Human-readable explanation logged in the ProofRejected event.
     */
    function rejectProof(uint256 taskId, string calldata reason) external;

    /**
     * @notice Grant or revoke oracle operator privileges for an address.
     *         Only callable by the contract admin.
     *
     * @param operator  The address to update.
     * @param granted   True to grant access, false to revoke.
     */
    function setOracleOperator(address operator, bool granted) external;

    // =========================================================================
    // EXTERNAL — READ
    // =========================================================================

    /**
     * @notice Check whether a proof for the given task has been verified.
     * @param taskId  The task to query.
     * @return True if verifyAndReport() has been successfully called for this task.
     */
    function isProofVerified(uint256 taskId) external view returns (bool);

    /**
     * @notice Check whether a proof for the given task has been submitted
     *         (regardless of verification status).
     * @param taskId  The task to query.
     * @return True if submitProof() has been called for this task.
     */
    function isProofSubmitted(uint256 taskId) external view returns (bool);

    /**
     * @notice Retrieve the full proof record for a given task.
     * @param taskId  The task to query.
     * @return proof  The ExecutionProof struct containing all proof metadata.
     */
    function getProof(
        uint256 taskId
    ) external view returns (DataTypes.ExecutionProof memory proof);

    /**
     * @notice Check whether an address has oracle operator privileges.
     * @param operator  The address to query.
     * @return True if the address is an authorised oracle operator.
     */
    function isOracleOperator(address operator) external view returns (bool);
}
