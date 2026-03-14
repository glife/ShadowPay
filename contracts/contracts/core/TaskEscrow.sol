// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/ITaskEscrow.sol";
import "../libraries/DataTypes.sol";

/**
 * @title TaskEscrow
 * @author Hey Elsa & The AI Council
 * @notice Holds ETH payment on behalf of Hey Elsa for every task posted to the
 *         marketplace. Funds follow a strict one-way state machine:
 *
 *                     ┌─────────┐
 *         lockFunds() │  LOCKED │
 *                     └────┬────┘
 *                          │
 *               ┌──────────┴──────────┐
 *               │                     │
 *         releaseFunds()         refundFunds()
 *               │                     │
 *          ┌────▼────┐          ┌──────▼──────┐
 *          │RELEASED │          │  REFUNDED   │
 *          └─────────┘          └─────────────┘
 *
 *  LOCKED   → funds are held here, task in progress.
 *  RELEASED → task completed; payment sent to the provider agent owner.
 *  REFUNDED → task failed or cancelled; payment returned to the requester.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ACCESS CONTROL
 * ─────────────────────────────────────────────────────────────────────────────
 *   DEFAULT_ADMIN_ROLE  – Deployer / multisig. Can grant/revoke MARKETPLACE_ROLE.
 *   MARKETPLACE_ROLE    – AgentMarketplace contract only. The sole caller
 *                         authorised to lock, release, refund, and assign agents.
 *                         This ensures no funds can move outside the verified
 *                         task lifecycle managed by the marketplace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SECURITY NOTES
 * ─────────────────────────────────────────────────────────────────────────────
 *   • ReentrancyGuard on all ETH-moving functions (releaseFunds, refundFunds).
 *   • Checks-Effects-Interactions pattern enforced throughout.
 *   • No ERC-20 support in this version — native ETH only. A token-based
 *     variant can extend this contract by overriding lockFunds / releaseFunds.
 *   • Zero-value escrow entries are rejected at lock time.
 *   • Duplicate locks for the same taskId are rejected.
 */
contract TaskEscrow is ITaskEscrow, AccessControl, ReentrancyGuard {
    // =========================================================================
    // ROLES
    // =========================================================================

    /// @notice Role granted exclusively to the AgentMarketplace contract.
    ///         All state-mutating calls (lock / assign / release / refund)
    ///         require this role.
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    // =========================================================================
    // STATE
    // =========================================================================

    /// @notice taskId → EscrowEntry.
    ///         A zero lockedAt timestamp indicates no escrow exists for that taskId.
    mapping(uint256 => DataTypes.EscrowEntry) private _escrows;

    /// @notice Running total of ETH currently locked in this contract (wei).
    ///         Useful for accounting / invariant checks.
    uint256 private _totalLocked;

    // =========================================================================
    // CUSTOM ERRORS
    // =========================================================================

    /// @notice Thrown when lockFunds is called for a taskId that already has
    ///         an escrow entry (duplicate lock attempt).
    error EscrowAlreadyExists(uint256 taskId);

    /// @notice Thrown when operating on a taskId that has no escrow entry.
    error EscrowNotFound(uint256 taskId);

    /// @notice Thrown when an operation requires LOCKED status but the escrow
    ///         is already RELEASED or REFUNDED.
    error EscrowNotLocked(uint256 taskId, DataTypes.EscrowStatus current);

    /// @notice Thrown when lockFunds is called with msg.value == 0.
    error ZeroDepositAmount();

    /// @notice Thrown when a native ETH transfer fails at the low level.
    error ETHTransferFailed(address recipient, uint256 amount);

    /// @notice Thrown when assignAgent is called with agentId == 0.
    error InvalidAgentId();

    /// @notice Thrown when assignAgent is called after the escrow is no longer LOCKED.
    error CannotReassignAgent(uint256 taskId, DataTypes.EscrowStatus current);

    // =========================================================================
    // EVENTS (supplementing those declared in ITaskEscrow)
    // =========================================================================

    /**
     * @notice Emitted when the escrow's agentId is updated post-selection.
     * @param taskId   The task whose escrow was updated.
     * @param agentId  The newly assigned provider agent ID.
     */
    // EscrowAgentAssigned is inherited from ITaskEscrow — not redeclared here.

    /**
     * @notice Emitted for accounting — tracks cumulative locked balance changes.
     * @param newTotalLocked  Updated total wei currently held in escrow.
     */
    event TotalLockedUpdated(uint256 newTotalLocked);

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    /**
     * @dev Ensures an escrow entry exists for the given taskId.
     *      Uses the lockedAt timestamp as the existence sentinel.
     */
    modifier escrowMustExist(uint256 taskId) {
        if (_escrows[taskId].lockedAt == 0) revert EscrowNotFound(taskId);
        _;
    }

    /**
     * @dev Ensures the escrow is currently in LOCKED status before allowing
     *      any state-changing operation that moves funds.
     */
    modifier mustBeLocked(uint256 taskId) {
        DataTypes.EscrowEntry storage entry = _escrows[taskId];
        if (entry.lockedAt == 0) revert EscrowNotFound(taskId);
        if (entry.status != DataTypes.EscrowStatus.LOCKED)
            revert EscrowNotLocked(taskId, entry.status);
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * @param admin  Address that receives DEFAULT_ADMIN_ROLE.
     *               This address can later grant MARKETPLACE_ROLE to the
     *               AgentMarketplace contract once it is deployed.
     */
    constructor(address admin) {
        require(admin != address(0), "TaskEscrow: zero admin address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // =========================================================================
    // EXTERNAL WRITE — MARKETPLACE_ROLE ONLY
    // =========================================================================

    /**
     * @inheritdoc ITaskEscrow
     *
     * @dev Called by AgentMarketplace.postTask() at task creation time.
     *      The ETH sent with this call (msg.value) is held in this contract
     *      until the task reaches a terminal state.
     *
     *      The agentId parameter may be 0 at lock time if agent selection has
     *      not yet occurred. The marketplace must call assignAgent() once
     *      selectBestAgent() resolves.
     *
     *      Checks-Effects-Interactions order:
     *        1. Validate inputs (Checks)
     *        2. Write _escrows entry and increment _totalLocked (Effects)
     *        3. Emit events (no external calls — no Interactions needed here)
     */
    function lockFunds(
        uint256 taskId,
        uint256 agentId
    ) external payable override onlyRole(MARKETPLACE_ROLE) {
        // --- Checks ---
        if (msg.value == 0) revert ZeroDepositAmount();
        if (_escrows[taskId].lockedAt != 0) revert EscrowAlreadyExists(taskId);

        // --- Effects ---
        _escrows[taskId] = DataTypes.EscrowEntry({
            taskId: taskId,
            agentId: agentId,
            depositor: tx.origin, // Hey Elsa's EOA / ElsaOrchestrator
            amount: msg.value,
            status: DataTypes.EscrowStatus.LOCKED,
            lockedAt: block.timestamp
        });

        unchecked {
            _totalLocked += msg.value;
        }

        // --- Events ---
        emit FundsLocked(taskId, agentId, msg.value);
        emit TotalLockedUpdated(_totalLocked);
    }

    /**
     * @inheritdoc ITaskEscrow
     *
     * @dev Called by AgentMarketplace.selectBestAgent() after the evaluation
     *      engine resolves the winning provider. Updates the agentId on an
     *      existing LOCKED escrow so that releaseFunds() knows who to pay.
     *
     *      Only valid while the escrow is still LOCKED — if the escrow has
     *      already been released or refunded there is nothing to assign to.
     */
    function assignAgent(
        uint256 taskId,
        uint256 agentId
    ) external override onlyRole(MARKETPLACE_ROLE) escrowMustExist(taskId) {
        // --- Checks ---
        if (agentId == 0) revert InvalidAgentId();

        DataTypes.EscrowEntry storage entry = _escrows[taskId];
        if (entry.status != DataTypes.EscrowStatus.LOCKED)
            revert CannotReassignAgent(taskId, entry.status);

        // --- Effects ---
        entry.agentId = agentId;

        // --- Events ---
        emit EscrowAgentAssigned(taskId, agentId);
    }

    /**
     * @inheritdoc ITaskEscrow
     *
     * @dev Called by AgentMarketplace.completeTask() once a task is verified
     *      as successfully executed (on-chain tx confirmed for CRYPTO tasks,
     *      or Web2Oracle proof verified for WEB2 tasks).
     *
     *      Transfers the full locked amount to `recipient` (the provider agent
     *      owner's address as stored in AgentRegistry).
     *
     *      Checks-Effects-Interactions order strictly followed to guard against
     *      reentrancy (though ReentrancyGuard also protects this function):
     *        1. Checks  — escrow exists, is LOCKED, recipient non-zero
     *        2. Effects — update status, decrement _totalLocked, cache amount
     *        3. Interactions — external ETH transfer
     */
    function releaseFunds(
        uint256 taskId,
        address recipient
    )
        external
        override
        nonReentrant
        onlyRole(MARKETPLACE_ROLE)
        mustBeLocked(taskId)
    {
        // --- Checks ---
        require(recipient != address(0), "TaskEscrow: zero recipient");

        DataTypes.EscrowEntry storage entry = _escrows[taskId];
        uint256 amount = entry.amount;

        // --- Effects (before external call) ---
        entry.status = DataTypes.EscrowStatus.RELEASED;

        unchecked {
            // _totalLocked >= amount is guaranteed by lockFunds invariant
            _totalLocked -= amount;
        }

        // --- Interactions ---
        _safeTransferETH(recipient, amount);

        // --- Events ---
        emit FundsReleased(taskId, recipient, amount);
        emit TotalLockedUpdated(_totalLocked);
    }

    /**
     * @inheritdoc ITaskEscrow
     *
     * @dev Called by AgentMarketplace when a task is FAILED or CANCELLED.
     *      Returns the full locked amount to the original depositor (the
     *      ElsaOrchestrator / Hey Elsa wallet that posted the task).
     *
     *      If the task was cancelled before agent selection (agentId == 0)
     *      or failed after assignment, the depositor is always refunded in full.
     *      There are no partial refunds in this version.
     *
     *      Checks-Effects-Interactions order strictly followed.
     */
    function refundFunds(
        uint256 taskId
    )
        external
        override
        nonReentrant
        onlyRole(MARKETPLACE_ROLE)
        mustBeLocked(taskId)
    {
        DataTypes.EscrowEntry storage entry = _escrows[taskId];
        address depositor = entry.depositor;
        uint256 amount = entry.amount;

        // --- Effects (before external call) ---
        entry.status = DataTypes.EscrowStatus.REFUNDED;

        unchecked {
            _totalLocked -= amount;
        }

        // --- Interactions ---
        _safeTransferETH(depositor, amount);

        // --- Events ---
        emit FundsRefunded(taskId, depositor, amount);
        emit TotalLockedUpdated(_totalLocked);
    }

    // =========================================================================
    // EXTERNAL READ
    // =========================================================================

    /**
     * @inheritdoc ITaskEscrow
     */
    function getEscrow(
        uint256 taskId
    )
        external
        view
        override
        escrowMustExist(taskId)
        returns (DataTypes.EscrowEntry memory)
    {
        return _escrows[taskId];
    }

    /**
     * @inheritdoc ITaskEscrow
     *
     * @dev Returns 0 for tasks with no escrow or for entries that are no
     *      longer in LOCKED status. This allows callers to safely check
     *      without needing to inspect the full struct.
     */
    function getLockedAmount(
        uint256 taskId
    ) external view override returns (uint256) {
        DataTypes.EscrowEntry storage entry = _escrows[taskId];
        if (
            entry.lockedAt == 0 || entry.status != DataTypes.EscrowStatus.LOCKED
        ) {
            return 0;
        }
        return entry.amount;
    }

    /**
     * @inheritdoc ITaskEscrow
     */
    function escrowExists(
        uint256 taskId
    ) external view override returns (bool) {
        return _escrows[taskId].lockedAt != 0;
    }

    /**
     * @notice Returns the total amount of ETH currently locked across all
     *         active escrow entries. Useful for accounting and invariant checks.
     *
     * @return Total locked wei held by this contract.
     */
    function getTotalLocked() external view returns (uint256) {
        return _totalLocked;
    }

    /**
     * @notice Returns the current status of an escrow entry without fetching
     *         the full struct. Reverts if no escrow exists for the taskId.
     *
     * @param taskId  The task to query.
     * @return        The current EscrowStatus (LOCKED / RELEASED / REFUNDED).
     */
    function getEscrowStatus(
        uint256 taskId
    ) external view escrowMustExist(taskId) returns (DataTypes.EscrowStatus) {
        return _escrows[taskId].status;
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /**
     * @dev Transfers `amount` wei to `recipient` using a low-level call to
     *      support both EOAs and smart contract wallets (which may have receive()
     *      logic that consumes more than the 2300 gas stipend from transfer()).
     *
     *      Reverts with ETHTransferFailed if the call returns false, preventing
     *      silent loss of funds.
     *
     * @param recipient  Address to send ETH to.
     * @param amount     Amount in wei.
     */
    function _safeTransferETH(address recipient, uint256 amount) internal {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert ETHTransferFailed(recipient, amount);
    }

    // =========================================================================
    // FALLBACK — REJECT DIRECT ETH SENDS
    // =========================================================================

    /**
     * @dev Rejects any ETH sent directly to the contract outside of lockFunds().
     *      All ETH entering this contract must go through the controlled
     *      lockFunds() path to maintain the accounting invariant
     *      (_totalLocked == address(this).balance).
     */
    receive() external payable {
        revert("TaskEscrow: use lockFunds()");
    }
}
