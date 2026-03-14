// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/DataTypes.sol";

/**
 * @title ITaskEscrow
 * @author Hey Elsa & The AI Council
 * @notice Interface for the TaskEscrow contract which holds payment funds on
 *         behalf of Hey Elsa for a given task. Funds are locked when a task
 *         is posted, released to the provider on success, or refunded to the
 *         requester on failure or cancellation.
 */
interface ITaskEscrow {
    // =========================================================================
    // EVENTS
    // =========================================================================

    /**
     * @notice Emitted when ETH is locked into escrow for a task.
     * @param taskId   The task the funds are locked for.
     * @param agentId  The provider agent assigned to this task (0 if not yet selected).
     * @param amount   The exact wei amount locked.
     */
    event FundsLocked(
        uint256 indexed taskId,
        uint256 indexed agentId,
        uint256 amount
    );

    /**
     * @notice Emitted when locked funds are released to the provider agent owner.
     * @param taskId     The task whose escrow is being released.
     * @param recipient  The agent owner address receiving payment.
     * @param amount     The wei amount transferred.
     */
    event FundsReleased(
        uint256 indexed taskId,
        address indexed recipient,
        uint256 amount
    );

    /**
     * @notice Emitted when locked funds are returned to the original depositor.
     * @param taskId    The task whose escrow is being refunded.
     * @param depositor The requester address receiving the refund.
     * @param amount    The wei amount returned.
     */
    event FundsRefunded(
        uint256 indexed taskId,
        address indexed depositor,
        uint256 amount
    );

    /**
     * @notice Emitted when the agentId on an escrow entry is updated after
     *         agent selection.
     * @param taskId   The task whose escrow is being updated.
     * @param agentId  The newly selected agent ID.
     */
    event EscrowAgentAssigned(uint256 indexed taskId, uint256 indexed agentId);

    // =========================================================================
    // EXTERNAL — WRITE
    // =========================================================================

    /**
     * @notice Lock ETH for a specific task. Must be called by the marketplace
     *         at the time the task is posted. The sent ETH (msg.value) is held
     *         in the contract until the task reaches a terminal state.
     *
     * @param taskId   The task ID this escrow is associated with.
     * @param agentId  The agent ID assigned to this task. Pass 0 if the agent
     *                 has not yet been selected (assignment can be updated later
     *                 via assignAgent).
     */
    function lockFunds(uint256 taskId, uint256 agentId) external payable;

    /**
     * @notice Assign or update the agent on an existing LOCKED escrow entry.
     *         Called by the marketplace after selectBestAgent resolves.
     *
     * @param taskId   The task whose escrow agent is being set.
     * @param agentId  The selected provider agent ID.
     */
    function assignAgent(uint256 taskId, uint256 agentId) external;

    /**
     * @notice Release locked funds to the provider agent owner upon successful
     *         task completion. Only callable by the marketplace.
     *
     * @param taskId     The task whose escrow is being released.
     * @param recipient  The agent owner address to send payment to.
     */
    function releaseFunds(uint256 taskId, address recipient) external;

    /**
     * @notice Refund locked funds to the original depositor when a task fails
     *         or is cancelled. Only callable by the marketplace.
     *
     * @param taskId  The task whose escrow is being refunded.
     */
    function refundFunds(uint256 taskId) external;

    // =========================================================================
    // EXTERNAL — READ
    // =========================================================================

    /**
     * @notice Returns the full escrow record for a given task.
     * @param taskId  The task to query.
     * @return        The EscrowEntry struct for this task.
     */
    function getEscrow(
        uint256 taskId
    ) external view returns (DataTypes.EscrowEntry memory);

    /**
     * @notice Returns the wei amount currently locked for a task.
     *         Returns 0 if no escrow exists or if already released/refunded.
     *
     * @param taskId  The task to query.
     * @return        Locked amount in wei.
     */
    function getLockedAmount(uint256 taskId) external view returns (uint256);

    /**
     * @notice Returns true if an escrow entry exists for the given task ID,
     *         regardless of its current status.
     *
     * @param taskId  The task to check.
     * @return        True if an escrow entry was ever created for this task.
     */
    function escrowExists(uint256 taskId) external view returns (bool);
}
