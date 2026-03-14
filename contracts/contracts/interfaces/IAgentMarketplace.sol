// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/DataTypes.sol";

/**
 * @title IAgentMarketplace
 * @author Hey Elsa & The AI Council
 * @notice Interface for the On-Chain Agent Marketplace — the Smart Contract Hub
 *         at Tier 4 of the agentic workflow architecture.
 *
 *         Responsibilities:
 *           • Accept task blueprints from ElsaOrchestrator (Tier 3)
 *           • Run the Evaluation Engine to score and select the best provider
 *           • Orchestrate the full task lifecycle (OPEN → ASSIGNED → COMPLETED/FAILED)
 *           • Coordinate with ReputationEngine and TaskEscrow
 *           • Trigger Web2Oracle verification for off-chain tasks
 */
interface IAgentMarketplace {
    // =========================================================================
    // EVENTS
    // =========================================================================

    /**
     * @notice Emitted when Hey Elsa posts a new task to the marketplace.
     * @param taskId      Unique task identifier.
     * @param requester   Address of the ElsaOrchestrator that posted the task.
     * @param taskType    Agent type key required to service this task.
     * @param category    CRYPTO or WEB2 execution pathway.
     * @param maxBudget   Maximum wei the requester will pay.
     */
    event TaskPosted(
        uint256 indexed taskId,
        address indexed requester,
        string taskType,
        DataTypes.AgentCategory category,
        uint256 maxBudget
    );

    /**
     * @notice Emitted when the Evaluation Engine selects the best provider.
     * @param taskId          The task that was evaluated.
     * @param agentId         The winning provider agent.
     * @param compositeScore  The agent's winning composite score (0–1000).
     */
    event AgentSelected(
        uint256 indexed taskId,
        uint256 indexed agentId,
        uint256 compositeScore
    );

    /**
     * @notice Emitted when a task is successfully completed and verified.
     * @param taskId     The completed task.
     * @param agentId    The provider agent that executed the task.
     * @param proofHash  keccak256 of the execution proof anchored on-chain.
     */
    event TaskCompleted(
        uint256 indexed taskId,
        uint256 indexed agentId,
        bytes32 proofHash
    );

    /**
     * @notice Emitted when a task execution fails.
     * @param taskId   The failed task.
     * @param agentId  The provider agent that failed.
     * @param reason   Human-readable failure reason string.
     */
    event TaskFailed(
        uint256 indexed taskId,
        uint256 indexed agentId,
        string reason
    );

    /**
     * @notice Emitted when a task is cancelled before an agent is assigned.
     * @param taskId  The cancelled task.
     */
    event TaskCancelled(uint256 indexed taskId);

    // =========================================================================
    // EXTERNAL — WRITE
    // =========================================================================

    /**
     * @notice Post a new task to the marketplace on behalf of Hey Elsa.
     *         Locks msg.value into TaskEscrow as payment for the provider.
     *
     * @dev Only callable by an authorised ElsaOrchestrator address.
     *      The caller MUST send exactly `maxBudget` wei with this call.
     *
     * @param blueprintHash  keccak256 of the AI Council's Strategic Blueprint JSON.
     *                       Provides an immutable on-chain fingerprint of the
     *                       instruction set that generated this task.
     * @param taskType       Agent type key that must match a registered provider
     *                       (e.g., "DEX_SWAP", "NEWSLETTER_GEN", "PDF_REPORT").
     * @param category       CRYPTO for on-chain execution, WEB2 for off-chain.
     * @param maxBudget      Maximum wei willing to pay. Agents with costPerTask
     *                       above this value are excluded from selection.
     *
     * @return taskId        The newly created task's unique identifier.
     */
    function postTask(
        bytes32 blueprintHash,
        string calldata taskType,
        DataTypes.AgentCategory category,
        uint256 maxBudget
    ) external payable returns (uint256 taskId);

    /**
     * @notice Run the Evaluation Engine to select the highest-scoring provider
     *         agent for a given OPEN task.
     *
     *         Composite score breakdown (0 – 1000):
     *           Reputation  50%  →  0 – 500 pts  (from ReputationEngine)
     *           Cost        30%  →  0 – 300 pts  (lower cost = higher pts)
     *           Speed       20%  →  0 – 200 pts  (lower avgSpeedMs = higher pts)
     *
     *         The agent with the highest composite score is selected.
     *         Task status advances from OPEN → ASSIGNED.
     *
     * @dev Callable by any authorised party after postTask(). In practice
     *      ElsaOrchestrator calls this immediately after postTask().
     *
     * @param taskId  The OPEN task to evaluate providers for.
     * @return agentId  The ID of the selected provider agent.
     */
    function selectBestAgent(uint256 taskId) external returns (uint256 agentId);

    /**
     * @notice Mark an ASSIGNED task as successfully completed.
     *         Triggers escrow release to the provider and reputation update.
     *
     *         For CRYPTO tasks: callable by the assigned provider agent's owner
     *         once the on-chain transaction has been broadcast and confirmed.
     *
     *         For WEB2 tasks: callable only by the Web2Oracle contract after
     *         the cryptographic proof of execution has been verified.
     *
     * @param taskId          The ASSIGNED task being completed.
     * @param proofHash       keccak256 of the execution proof.
     *                        CRYPTO → transaction hash.
     *                        WEB2   → TLSNotary / API receipt hash.
     * @param responseTimeMs  Actual wall-clock execution time in milliseconds.
     *                        Used to update the agent's avgSpeedMs on-chain.
     */
    function completeTask(
        uint256 taskId,
        bytes32 proofHash,
        uint256 responseTimeMs
    ) external;

    /**
     * @notice Mark an ASSIGNED task as failed.
     *         Triggers escrow refund to the requester and reputation penalty.
     *
     * @dev Callable by the assigned agent's owner or a marketplace admin.
     *
     * @param taskId   The ASSIGNED task that failed.
     * @param reason   Short human-readable description of the failure cause.
     */
    function failTask(uint256 taskId, string calldata reason) external;

    /**
     * @notice Cancel an OPEN task before an agent has been assigned.
     *         The locked escrow is fully refunded to the requester.
     *
     * @dev Only the original requester (ElsaOrchestrator) can cancel a task.
     *      Tasks in ASSIGNED, COMPLETED, or FAILED state cannot be cancelled.
     *
     * @param taskId  The OPEN task to cancel.
     */
    function cancelTask(uint256 taskId) external;

    // =========================================================================
    // EXTERNAL — READ
    // =========================================================================

    /**
     * @notice Fetch the full on-chain record of a task.
     * @param taskId  The task to query.
     * @return        The complete Task struct.
     */
    function getTask(
        uint256 taskId
    ) external view returns (DataTypes.Task memory);

    /**
     * @notice Run the Evaluation Engine in read-only mode and return scored
     *         provider candidates for a given task type and category.
     *
     *         Useful for Hey Elsa to preview available agents and their
     *         composite scores before committing to postTask().
     *
     * @param taskType   Agent type key to filter providers by.
     * @param category   CRYPTO or WEB2 execution category.
     * @param maxBudget  Budget ceiling — agents above this cost are excluded.
     *
     * @return scores  Array of ProviderScore structs sorted descending by
     *                 compositeScore. The first element is the current best pick.
     */
    function queryProviders(
        string calldata taskType,
        DataTypes.AgentCategory category,
        uint256 maxBudget
    ) external view returns (DataTypes.ProviderScore[] memory scores);

    /**
     * @notice Returns the total number of tasks ever posted to the marketplace.
     * @return Total task count (the last issued taskId).
     */
    function getTotalTasks() external view returns (uint256);
}
