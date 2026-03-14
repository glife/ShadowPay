// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "../interfaces/IAgentMarketplace.sol";
import "../libraries/DataTypes.sol";

/**
 * @title ElsaOrchestrator
 * @author Hey Elsa & The AI Council
 * @notice Hey Elsa's secure on-chain identity — the Tier 3 Middleware Orchestrator
 *         and Broker. This contract is the exclusive gateway between the AI
 *         Council's reasoning output (Strategic Blueprint) and the On-Chain
 *         Agent Marketplace (Tier 4).
 *
 *         Elsa is NOT the user-facing chat interface. She is purely functional
 *         middleware that translates verified, signed strategic instructions into
 *         on-chain marketplace actions.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ARCHITECTURE POSITION
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   ┌─────────────────────────────────────────────────────────────────────┐
 *   │                                                                     │
 *   │  Tier 2: AI Council produces STANDARDIZED STRATEGIC BLUEPRINT       │
 *   │          (JSON payload, keccak256-hashed off-chain)                 │
 *   │                    │                                                │
 *   │                    ▼                                                │
 *   │  Tier 3: ElsaOrchestrator (this contract)                          │
 *   │          1. Blueprint Interpretation  → validates & decodes intent  │
 *   │          2. Marketspace Interface     → queries & posts to Tier 4   │
 *   │          3. Secure MPC Wallet Mgmt   → records signed tx hashes     │
 *   │                    │                                                │
 *   │                    ▼                                                │
 *   │  Tier 4: AgentMarketplace.postTask()                               │
 *   │                                                                     │
 *   └─────────────────────────────────────────────────────────────────────┘
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  MPC WALLET & SIGNING RECORD
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   In the full production system, Hey Elsa controls funds through a
 *   Multi-Party Computation (MPC) wallet — no single key ever holds the
 *   private key in full. This contract acts as the on-chain record layer for
 *   that MPC system:
 *
 *   • Only addresses enrolled as ELSA_SIGNER may submit blueprints that
 *     move funds (i.e., call postTask with ETH). This maps to the MPC
 *     co-signers in the off-chain MPC wallet cluster.
 *   • Every authorised transaction is logged immutably via SignedTransaction
 *     events with a unique nonce, providing a tamper-evident audit trail of
 *     every action Elsa has taken on behalf of users.
 *   • A per-blueprint spending cap (maxBudget) enforced on-chain prevents
 *     any single compromised MPC shard from draining the wallet in one call.
 *   • Emergency pause (PAUSER_ROLE) halts all outbound task posting without
 *     blocking ongoing task completions on the marketplace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ACCESS CONTROL
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   DEFAULT_ADMIN_ROLE  – Deployer multisig. Grants/revokes all other roles.
 *                         Can update the marketplace address and global budget cap.
 *   ELSA_SIGNER_ROLE    – Authorised Elsa backend instances / MPC co-signers.
 *                         May call executeBlueprint() and cancelTask().
 *   PAUSER_ROLE         – Emergency pause operators. May call pause()/unpause()
 *                         without full admin privileges (faster incident response).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  BLUEPRINT PAYLOAD FORMAT (off-chain convention, validated on-chain by hash)
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   The AI Council produces a JSON Strategic Blueprint. The off-chain Elsa
 *   backend parses it and extracts the fields needed to call executeBlueprint().
 *   The full JSON is hashed off-chain to produce blueprintHash, which is
 *   anchored permanently on-chain in the BlueprintExecuted event.
 *
 *   Example parsed fields passed to executeBlueprint():
 *   {
 *     "blueprintHash":  "0xabc...",     // keccak256 of the full JSON
 *     "taskType":       "DEX_SWAP",     // agent type to select from registry
 *     "category":       0,              // 0 = CRYPTO, 1 = WEB2
 *     "maxBudget":      500000000000000 // wei (e.g. 0.0005 ETH for gas/fees)
 *   }
 */
contract ElsaOrchestrator is AccessControl, ReentrancyGuard, Pausable {
    // =========================================================================
    // ROLES
    // =========================================================================

    /// @notice Granted to authorised Elsa backend instances / MPC co-signers.
    ///         Required to call executeBlueprint() and cancelTask().
    bytes32 public constant ELSA_SIGNER_ROLE = keccak256("ELSA_SIGNER_ROLE");

    /// @notice Granted to emergency pause operators.
    ///         May call pause() and unpause() without full admin access.
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // =========================================================================
    // CONSTANTS
    // =========================================================================

    /// @notice Hard upper bound on the ETH that can be committed in a single
    ///         blueprint execution. Acts as a circuit-breaker against a
    ///         compromised MPC shard attempting a large unauthorised withdrawal.
    ///         Default: 1 ETH. Adjustable by admin within a reasonable range.
    uint256 public constant ABSOLUTE_MAX_BUDGET = 10 ether;

    // =========================================================================
    // STATE
    // =========================================================================

    /// @notice The AgentMarketplace contract that Elsa posts tasks to.
    ///         Updatable by admin to support marketplace upgrades.
    IAgentMarketplace public marketplace;

    /// @notice Global per-execution spending cap enforced by this contract.
    ///         Admin may lower this for added safety; cannot exceed ABSOLUTE_MAX_BUDGET.
    uint256 public maxBudgetCap;

    /// @notice Monotonically increasing nonce for every signed transaction.
    ///         Provides a sequential audit trail and prevents replay attacks.
    uint256 private _nonce;

    /// @notice Tracks which blueprint hashes have already been submitted to
    ///         prevent the same Council decision from being executed twice.
    ///         blueprintHash → taskId (0 if not yet submitted).
    mapping(bytes32 => uint256) private _blueprintToTask;

    /// @notice Tracks all task IDs ever created by this orchestrator.
    ///         taskId → BlueprintRecord
    mapping(uint256 => BlueprintRecord) private _taskRecords;

    /// @notice Canonical list of all task IDs posted by this orchestrator,
    ///         in creation order. Used for pagination in dashboards.
    uint256[] private _allTaskIds;

    // =========================================================================
    // STRUCTS
    // =========================================================================

    /**
     * @notice On-chain record linking a marketplace task back to its originating
     *         AI Council blueprint and the Elsa signer that authorised it.
     *
     * @param blueprintHash  keccak256 of the original Strategic Blueprint JSON.
     * @param taskType       Agent type key (e.g. "DEX_SWAP", "NEWSLETTER_GEN").
     * @param category       CRYPTO or WEB2 execution pathway.
     * @param maxBudget      Wei committed for this task.
     * @param taskId         Marketplace task ID assigned by AgentMarketplace.
     * @param signer         ELSA_SIGNER address that authorised this execution.
     * @param nonce          Sequential nonce at time of execution.
     * @param executedAt     Block timestamp of execution.
     * @param cancelled      True if Elsa later cancelled the task (OPEN→CANCELLED).
     */
    struct BlueprintRecord {
        bytes32 blueprintHash;
        string taskType;
        DataTypes.AgentCategory category;
        uint256 maxBudget;
        uint256 taskId;
        address signer;
        uint256 nonce;
        uint256 executedAt;
        bool cancelled;
    }

    // =========================================================================
    // CUSTOM ERRORS
    // =========================================================================

    /// @notice Thrown when the marketplace address is set to zero.
    error ZeroMarketplaceAddress();

    /// @notice Thrown when a zero budget is supplied.
    error ZeroBudget();

    /// @notice Thrown when the requested budget exceeds the admin-configured cap.
    error BudgetExceedsCap(uint256 requested, uint256 cap);

    /// @notice Thrown when msg.value does not equal the declared maxBudget.
    error IncorrectPayment(uint256 sent, uint256 required);

    /// @notice Thrown when the same blueprintHash is submitted a second time.
    error BlueprintAlreadyExecuted(
        bytes32 blueprintHash,
        uint256 existingTaskId
    );

    /// @notice Thrown when a task ID is not found in this orchestrator's records.
    error TaskRecordNotFound(uint256 taskId);

    /// @notice Thrown when the new maxBudgetCap exceeds ABSOLUTE_MAX_BUDGET.
    error ExceedsAbsoluteMax(uint256 requested, uint256 absoluteMax);

    /// @notice Thrown when taskType is an empty string.
    error EmptyTaskType();

    /// @notice Thrown when attempting to withdraw from an empty balance.
    error NoBalanceToWithdraw();

    /// @notice Thrown when the ETH withdrawal transfer fails.
    error WithdrawTransferFailed();

    // =========================================================================
    // EVENTS
    // =========================================================================

    /**
     * @notice Emitted when Elsa successfully translates a blueprint into a
     *         marketplace task. This is the primary audit log entry for every
     *         AI Council decision that results in on-chain action.
     *
     * @param taskId         Marketplace task ID assigned by AgentMarketplace.
     * @param blueprintHash  keccak256 of the originating Strategic Blueprint JSON.
     * @param taskType       Agent type key used to select the provider.
     * @param category       CRYPTO or WEB2 execution pathway.
     * @param maxBudget      Wei locked in escrow for this task.
     * @param signer         ELSA_SIGNER address that authorised this execution.
     * @param nonce          Sequential nonce for this signed transaction.
     */
    event BlueprintExecuted(
        uint256 indexed taskId,
        bytes32 indexed blueprintHash,
        string taskType,
        DataTypes.AgentCategory category,
        uint256 maxBudget,
        address indexed signer,
        uint256 nonce
    );

    /**
     * @notice Emitted when Elsa cancels an OPEN task on the marketplace and
     *         the escrowed funds are returned to this contract.
     *
     * @param taskId         The cancelled marketplace task ID.
     * @param blueprintHash  The blueprint hash of the cancelled task.
     * @param signer         The ELSA_SIGNER that initiated the cancellation.
     */
    event TaskCancelledByElsa(
        uint256 indexed taskId,
        bytes32 indexed blueprintHash,
        address indexed signer
    );

    /**
     * @notice Emitted when the marketplace address is updated by the admin.
     *
     * @param oldMarketplace  Previous marketplace address.
     * @param newMarketplace  New marketplace address.
     */
    event MarketplaceUpdated(
        address indexed oldMarketplace,
        address indexed newMarketplace
    );

    /**
     * @notice Emitted when the admin updates the global per-execution budget cap.
     *
     * @param oldCap  Previous cap in wei.
     * @param newCap  New cap in wei.
     */
    event BudgetCapUpdated(uint256 oldCap, uint256 newCap);

    /**
     * @notice Emitted whenever a signed transaction is recorded on-chain.
     *         Every outbound task posting generates one of these events,
     *         creating a sequential, tamper-evident MPC signing log.
     *
     * @param nonce      Monotonically increasing transaction sequence number.
     * @param signer     The ELSA_SIGNER address that authorised this action.
     * @param action     Human-readable action descriptor (e.g. "EXECUTE_BLUEPRINT").
     * @param taskId     The marketplace task ID this signing event relates to.
     * @param timestamp  Block timestamp of the signing event.
     */
    event SignedTransaction(
        uint256 indexed nonce,
        address indexed signer,
        string action,
        uint256 indexed taskId,
        uint256 timestamp
    );

    /**
     * @notice Emitted when ETH is received by this contract (e.g. task refunds
     *         from the marketplace after cancellation or failure).
     *
     * @param sender  Address that sent the ETH.
     * @param amount  Amount received in wei.
     */
    event FundsReceived(address indexed sender, uint256 amount);

    /**
     * @notice Emitted when the admin withdraws ETH from this contract.
     *
     * @param recipient  Address that received the withdrawn ETH.
     * @param amount     Amount withdrawn in wei.
     */
    event FundsWithdrawn(address indexed recipient, uint256 amount);

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * @param admin_        Address that receives DEFAULT_ADMIN_ROLE and PAUSER_ROLE.
     *                      Should be the deployer multisig or governance contract.
     * @param marketplace_  Address of the deployed AgentMarketplace contract.
     * @param initialCap    Initial maxBudgetCap in wei. Must be > 0 and
     *                      <= ABSOLUTE_MAX_BUDGET.
     */
    constructor(address admin_, address marketplace_, uint256 initialCap) {
        if (admin_ == address(0)) revert ZeroMarketplaceAddress();
        if (marketplace_ == address(0)) revert ZeroMarketplaceAddress();
        if (initialCap == 0) revert ZeroBudget();
        if (initialCap > ABSOLUTE_MAX_BUDGET)
            revert ExceedsAbsoluteMax(initialCap, ABSOLUTE_MAX_BUDGET);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(PAUSER_ROLE, admin_);

        marketplace = IAgentMarketplace(marketplace_);
        maxBudgetCap = initialCap;
        _nonce = 0;
    }

    // =========================================================================
    // EXTERNAL WRITE — ELSA_SIGNER_ROLE
    // =========================================================================

    /**
     * @notice Translate an AI Council Strategic Blueprint into a live marketplace
     *         task. This is Hey Elsa's core orchestration action.
     *
     *         Off-chain flow that leads to this call:
     *           1. User submits natural language intent (Tier 1).
     *           2. AI Council deliberates and produces the Strategic Blueprint (Tier 2).
     *           3. Elsa backend parses the blueprint, extracts task parameters,
     *              and calls this function with msg.value == maxBudget (Tier 3).
     *           4. This function locks funds and posts the task to the marketplace.
     *           5. The marketplace's Evaluation Engine selects the best provider (Tier 4).
     *           6. The provider executes the task on-chain or off-chain (Tier 5).
     *
     * @dev The caller must send exactly `maxBudget` wei with this call.
     *      The wei is forwarded directly to AgentMarketplace.postTask() which
     *      passes it to TaskEscrow. Funds never rest idle in this contract
     *      during normal operation — they flow atomically to the escrow.
     *
     *      Blueprint deduplication: the same blueprintHash cannot be executed
     *      twice. This prevents the AI Council from issuing duplicate orders
     *      due to network issues or retry logic.
     *
     *      The function is nonReentrant to guard against a malicious marketplace
     *      implementation calling back into Elsa during the postTask() call,
     *      even though the marketplace is trusted in the canonical deployment.
     *
     * @param blueprintHash  keccak256 of the full AI Council Strategic Blueprint
     *                       JSON. Used as a deduplication key and audit anchor.
     * @param taskType       Agent type key required to service this blueprint
     *                       (e.g. "DEX_SWAP", "NEWSLETTER_GEN", "PDF_REPORT").
     *                       Must exactly match a registered provider's agentType.
     * @param category       CRYPTO for on-chain execution, WEB2 for off-chain.
     * @param maxBudget      Maximum wei willing to pay the provider agent.
     *                       msg.value must equal this value exactly.
     *                       Must be > 0 and <= maxBudgetCap.
     *
     * @return taskId        The marketplace task ID for the newly posted task.
     */
    function executeBlueprint(
        bytes32 blueprintHash,
        string calldata taskType,
        DataTypes.AgentCategory category,
        uint256 maxBudget
    )
        external
        payable
        nonReentrant
        whenNotPaused
        onlyRole(ELSA_SIGNER_ROLE)
        returns (uint256 taskId)
    {
        // ── Checks ───────────────────────────────────────────────────────────

        if (bytes(taskType).length == 0) revert EmptyTaskType();
        if (maxBudget == 0) revert ZeroBudget();
        if (maxBudget > maxBudgetCap)
            revert BudgetExceedsCap(maxBudget, maxBudgetCap);
        if (msg.value != maxBudget)
            revert IncorrectPayment(msg.value, maxBudget);

        // Deduplication — each Strategic Blueprint can only be executed once
        if (_blueprintToTask[blueprintHash] != 0)
            revert BlueprintAlreadyExecuted(
                blueprintHash,
                _blueprintToTask[blueprintHash]
            );

        // ── Effects ───────────────────────────────────────────────────────────

        uint256 currentNonce = ++_nonce;

        // ── Interactions: post task to marketplace ────────────────────────────
        // Forwards msg.value to AgentMarketplace which forwards it to TaskEscrow.
        // AgentMarketplace atomically posts and selects the best agent.
        taskId = marketplace.postTask{value: msg.value}(
            blueprintHash,
            taskType,
            category,
            maxBudget
        );

        // ── Record keeping (after external call, protected by nonReentrant) ───

        _blueprintToTask[blueprintHash] = taskId;

        _taskRecords[taskId] = BlueprintRecord({
            blueprintHash: blueprintHash,
            taskType: taskType,
            category: category,
            maxBudget: maxBudget,
            taskId: taskId,
            signer: msg.sender,
            nonce: currentNonce,
            executedAt: block.timestamp,
            cancelled: false
        });

        _allTaskIds.push(taskId);

        // ── Events ────────────────────────────────────────────────────────────

        emit BlueprintExecuted(
            taskId,
            blueprintHash,
            taskType,
            category,
            maxBudget,
            msg.sender,
            currentNonce
        );

        // MPC signing audit log — sequential, tamper-evident record
        emit SignedTransaction(
            currentNonce,
            msg.sender,
            "EXECUTE_BLUEPRINT",
            taskId,
            block.timestamp
        );
    }

    /**
     * @notice Cancel an OPEN marketplace task and reclaim the escrowed funds.
     *
     *         Use case: The AI Council issues a revised decision before the
     *         provider has started execution, or no eligible provider was found
     *         and the task remains in OPEN status.
     *
     * @dev Only the ELSA_SIGNER_ROLE may cancel. Cancelled tasks refund ETH
     *      back to this contract via TaskEscrow → AgentMarketplace → this
     *      contract's receive() function. The admin can later withdraw
     *      recovered funds via withdrawFunds().
     *
     *      Marks the BlueprintRecord as cancelled for audit purposes.
     *      Does NOT clear _blueprintToTask — the blueprint remains "used"
     *      to prevent re-execution of the same Council decision.
     *
     * @param taskId  The marketplace task ID to cancel. Must have been
     *                posted by this orchestrator and still be in OPEN status.
     */
    function cancelTask(
        uint256 taskId
    ) external nonReentrant whenNotPaused onlyRole(ELSA_SIGNER_ROLE) {
        // ── Checks ───────────────────────────────────────────────────────────

        BlueprintRecord storage record = _requireRecord(taskId);

        // ── Effects ───────────────────────────────────────────────────────────

        record.cancelled = true;
        uint256 currentNonce = ++_nonce;

        // ── Interactions ──────────────────────────────────────────────────────

        marketplace.cancelTask(taskId);

        // ── Events ────────────────────────────────────────────────────────────

        emit TaskCancelledByElsa(taskId, record.blueprintHash, msg.sender);

        emit SignedTransaction(
            currentNonce,
            msg.sender,
            "CANCEL_TASK",
            taskId,
            block.timestamp
        );
    }

    // =========================================================================
    // EXTERNAL WRITE — DEFAULT_ADMIN_ROLE
    // =========================================================================

    /**
     * @notice Update the marketplace address that Elsa posts tasks to.
     *         Used when the AgentMarketplace is upgraded to a new deployment.
     *
     *         IMPORTANT: After updating, the admin must also:
     *           1. Grant ELSA_ROLE on the new marketplace to this contract's address.
     *           2. Revoke ELSA_ROLE on the old marketplace if applicable.
     *
     * @param newMarketplace  Address of the new AgentMarketplace contract.
     */
    function setMarketplace(
        address newMarketplace
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newMarketplace == address(0)) revert ZeroMarketplaceAddress();

        address old = address(marketplace);
        marketplace = IAgentMarketplace(newMarketplace);

        emit MarketplaceUpdated(old, newMarketplace);
    }

    /**
     * @notice Update the per-execution ETH budget cap.
     *         Lowering the cap increases safety; raising it allows larger tasks.
     *         Cannot exceed ABSOLUTE_MAX_BUDGET (hard-coded 10 ETH ceiling).
     *
     * @param newCap  New cap in wei.
     */
    function setBudgetCap(
        uint256 newCap
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (newCap == 0) revert ZeroBudget();
        if (newCap > ABSOLUTE_MAX_BUDGET)
            revert ExceedsAbsoluteMax(newCap, ABSOLUTE_MAX_BUDGET);

        uint256 old = maxBudgetCap;
        maxBudgetCap = newCap;

        emit BudgetCapUpdated(old, newCap);
    }

    /**
     * @notice Withdraw ETH that has accumulated in this contract.
     *         Funds can accumulate via:
     *           • Task escrow refunds (failed or cancelled tasks).
     *           • Direct sends (should not happen in normal operation but
     *             the receive() function accepts them gracefully).
     *
     * @dev Only the admin may withdraw. Sends to the admin address.
     *      Uses Checks-Effects-Interactions; ETH balance is read before transfer.
     *
     * @param recipient  Address to send the withdrawn ETH to.
     *                   Must be non-zero.
     */
    function withdrawFunds(
        address payable recipient
    ) external nonReentrant onlyRole(DEFAULT_ADMIN_ROLE) {
        require(recipient != address(0), "ElsaOrchestrator: zero recipient");

        uint256 balance = address(this).balance;
        if (balance == 0) revert NoBalanceToWithdraw();

        // Transfer via low-level call to support smart contract recipients
        (bool ok, ) = recipient.call{value: balance}("");
        if (!ok) revert WithdrawTransferFailed();

        emit FundsWithdrawn(recipient, balance);
    }

    // =========================================================================
    // EXTERNAL WRITE — PAUSER_ROLE
    // =========================================================================

    /**
     * @notice Pause all outbound task execution.
     *         Blocks executeBlueprint() and cancelTask() immediately.
     *         Used for emergency incident response or planned maintenance.
     *
     *         Ongoing tasks on the marketplace are NOT affected — providers
     *         can still complete tasks and collect payment while Elsa is paused.
     *
     * @dev Requires PAUSER_ROLE. Emits a Paused event (from OpenZeppelin Pausable).
     */
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /**
     * @notice Unpause Elsa and resume normal blueprint execution.
     * @dev Requires PAUSER_ROLE. Emits an Unpaused event.
     */
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // =========================================================================
    // EXTERNAL READ
    // =========================================================================

    /**
     * @notice Returns the full BlueprintRecord for a given marketplace task ID.
     *         Provides a complete on-chain audit trail: which blueprint hash,
     *         which signer, which nonce, and at what timestamp.
     *
     * @param taskId  The marketplace task ID to look up.
     * @return record The associated BlueprintRecord struct.
     */
    function getTaskRecord(
        uint256 taskId
    ) external view returns (BlueprintRecord memory record) {
        return _requireRecord(taskId);
    }

    /**
     * @notice Looks up the marketplace task ID associated with a given blueprint
     *         hash. Returns 0 if the blueprint has never been executed.
     *
     * @param blueprintHash  keccak256 of the Strategic Blueprint JSON to query.
     * @return taskId        Corresponding marketplace task ID, or 0 if not found.
     */
    function getTaskByBlueprint(
        bytes32 blueprintHash
    ) external view returns (uint256 taskId) {
        return _blueprintToTask[blueprintHash];
    }

    /**
     * @notice Returns true if the given blueprint hash has already been executed
     *         (prevents re-execution of the same Council decision).
     *
     * @param blueprintHash  keccak256 of the Strategic Blueprint JSON to check.
     * @return               True if executeBlueprint() has been called with this hash.
     */
    function isBlueprintExecuted(
        bytes32 blueprintHash
    ) external view returns (bool) {
        return _blueprintToTask[blueprintHash] != 0;
    }

    /**
     * @notice Returns the total number of tasks ever posted by this orchestrator.
     * @return Total posted task count.
     */
    function getTotalTasksPosted() external view returns (uint256) {
        return _allTaskIds.length;
    }

    /**
     * @notice Returns a paginated slice of task IDs posted by this orchestrator,
     *         in creation order. Useful for dashboard / history UIs.
     *
     * @param offset  Start index (0-based) in the full task ID list.
     * @param limit   Maximum number of task IDs to return.
     *
     * @return ids    Array of task IDs of length min(limit, available).
     */
    function getTaskIds(
        uint256 offset,
        uint256 limit
    ) external view returns (uint256[] memory ids) {
        uint256 total = _allTaskIds.length;
        if (offset >= total || limit == 0) return ids; // empty array

        uint256 end = offset + limit;
        if (end > total) end = total;
        uint256 length = end - offset;

        ids = new uint256[](length);
        for (uint256 i = 0; i < length; ) {
            ids[i] = _allTaskIds[offset + i];
            unchecked {
                i++;
            }
        }
    }

    /**
     * @notice Returns the current MPC signing nonce.
     *         The nonce is incremented on every executeBlueprint() and cancelTask()
     *         call, providing a sequential count of all outbound signed actions.
     *
     * @return Current nonce value.
     */
    function getCurrentNonce() external view returns (uint256) {
        return _nonce;
    }

    /**
     * @notice Returns the current ETH balance held in this contract.
     *         In normal operation this should be near zero; non-zero balances
     *         indicate pending refunds that the admin should withdraw.
     *
     * @return Balance in wei.
     */
    function getBalance() external view returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Convenience function to preview all scoring data for candidate
     *         providers before committing a blueprint execution. Delegates to
     *         AgentMarketplace.queryProviders() and returns the result.
     *
     * @param taskType   Agent type key to evaluate providers for.
     * @param category   CRYPTO or WEB2 execution category.
     * @param maxBudget  Budget ceiling for the preview.
     *
     * @return scores    Array of ProviderScore structs sorted descending by
     *                   compositeScore. The first element is the current best pick.
     */
    function previewProviders(
        string calldata taskType,
        DataTypes.AgentCategory category,
        uint256 maxBudget
    ) external view returns (DataTypes.ProviderScore[] memory scores) {
        return marketplace.queryProviders(taskType, category, maxBudget);
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /**
     * @dev Returns a storage pointer to the BlueprintRecord for `taskId`,
     *      reverting with TaskRecordNotFound if the record does not exist.
     *      Uses executedAt == 0 as the non-existence sentinel.
     *
     * @param taskId  The marketplace task ID to look up.
     * @return record Storage reference to the BlueprintRecord struct.
     */
    function _requireRecord(
        uint256 taskId
    ) internal view returns (BlueprintRecord storage record) {
        record = _taskRecords[taskId];
        if (record.executedAt == 0) revert TaskRecordNotFound(taskId);
    }

    // =========================================================================
    // RECEIVE — ACCEPT REFUNDS FROM MARKETPLACE / ESCROW
    // =========================================================================

    /**
     * @dev Accepts incoming ETH. In normal operation this is triggered by the
     *      TaskEscrow refunding this contract after a task is FAILED or CANCELLED.
     *      The admin must call withdrawFunds() to move recovered ETH onward.
     *
     *      Direct ETH sends from arbitrary addresses are also accepted here so
     *      Elsa can be topped up by the operating multisig without a dedicated
     *      deposit function. All incoming ETH is logged via FundsReceived.
     */
    receive() external payable {
        emit FundsReceived(msg.sender, msg.value);
    }
}
