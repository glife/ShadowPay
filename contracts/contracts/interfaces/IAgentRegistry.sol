// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/DataTypes.sol";

/**
 * @title IAgentRegistry
 * @author Hey Elsa & The AI Council
 * @notice Interface for the permissionless provider agent registry.
 *         Third-party developers register, manage, and price their
 *         specialised execution agents here. The AgentMarketplace
 *         queries this registry to build its candidate pool when
 *         selecting the best provider for a given task.
 */
interface IAgentRegistry {
    // =========================================================================
    // EVENTS
    // =========================================================================

    /**
     * @notice Emitted when a new provider agent is registered.
     * @param agentId   Newly assigned unique agent ID.
     * @param owner     Address of the developer who registered the agent.
     * @param name      Human-readable agent name.
     * @param agentType Task-type key (e.g., "DEX_SWAP", "NEWSLETTER_GEN").
     * @param category  CRYPTO or WEB2 execution pathway.
     */
    event AgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        string name,
        string agentType,
        DataTypes.AgentCategory category
    );

    /**
     * @notice Emitted when an agent is deactivated and stops receiving tasks.
     * @param agentId  The deactivated agent's ID.
     */
    event AgentDeactivated(uint256 indexed agentId);

    /**
     * @notice Emitted when a previously deactivated agent is re-activated.
     * @param agentId  The re-activated agent's ID.
     */
    event AgentActivated(uint256 indexed agentId);

    /**
     * @notice Emitted when an agent owner updates their cost per task.
     * @param agentId  The agent whose cost was updated.
     * @param newCost  Updated cost in wei.
     */
    event AgentCostUpdated(uint256 indexed agentId, uint256 newCost);

    /**
     * @notice Emitted when the rolling average speed of an agent is updated
     *         on-chain after a completed task.
     * @param agentId      The agent whose speed metric was refreshed.
     * @param newAvgSpeedMs Updated average execution time in milliseconds.
     */
    event AgentSpeedUpdated(uint256 indexed agentId, uint256 newAvgSpeedMs);

    // =========================================================================
    // WRITE FUNCTIONS
    // =========================================================================

    /**
     * @notice Register a new provider agent in the marketplace.
     *
     * @dev The caller becomes the agent owner and is the only address that
     *      can later deactivate the agent or update its pricing.
     *      The AgentMarketplace should call `ReputationEngine.initializeAgent`
     *      immediately after a successful registration.
     *
     * @param name         Human-readable display name (must be non-empty).
     * @param agentType    Task-type key — must exactly match the taskType
     *                     strings used when posting tasks via ElsaOrchestrator
     *                     (e.g., "DEX_SWAP", "YIELD_FARM", "NEWSLETTER_GEN",
     *                     "PDF_REPORT", "SMART_AUDIT").
     * @param category     CRYPTO for on-chain agents, WEB2 for off-chain agents.
     * @param costPerTask  Wei charged per task. Agents whose cost exceeds
     *                     Task.maxBudget are automatically excluded from
     *                     the evaluation engine's candidate list.
     * @param avgSpeedMs   Initial self-reported average execution time in
     *                     milliseconds. Updated on-chain after each task.
     *
     * @return agentId     The newly assigned unique agent ID (starts at 1).
     */
    function registerAgent(
        string calldata name,
        string calldata agentType,
        DataTypes.AgentCategory category,
        uint256 costPerTask,
        uint256 avgSpeedMs
    ) external returns (uint256 agentId);

    /**
     * @notice Register a new provider agent on behalf of a specific owner address.
     *         Called by the AgentMarketplace gateway so that the real developer
     *         wallet (msg.sender on the marketplace) becomes the agent owner,
     *         rather than the marketplace contract itself.
     *
     * @dev Only the registered marketplace address may call this function.
     *
     * @param owner        Address that will be set as the agent owner.
     * @param name         Human-readable display name (must be non-empty).
     * @param agentType    Task-type key.
     * @param category     CRYPTO or WEB2 execution pathway.
     * @param costPerTask  Wei charged per task.
     * @param avgSpeedMs   Initial self-reported average execution time in ms.
     *
     * @return agentId     The newly assigned unique agent ID.
     */
    function registerAgentFor(
        address owner,
        string calldata name,
        string calldata agentType,
        DataTypes.AgentCategory category,
        uint256 costPerTask,
        uint256 avgSpeedMs
    ) external returns (uint256 agentId);

    /**
     * @notice Deactivate an agent so it is excluded from future task assignments.
     *         Reputation data and historical records are preserved.
     *         Only the agent owner or the contract admin may call this.
     *
     * @param agentId  ID of the agent to deactivate.
     */
    function deactivateAgent(uint256 agentId) external;

    /**
     * @notice Re-activate a previously deactivated agent, making it eligible
     *         for new task assignments again.
     *         Only the agent owner or the contract admin may call this.
     *
     * @param agentId  ID of the agent to re-activate.
     */
    function activateAgent(uint256 agentId) external;

    /**
     * @notice Update the per-task cost for an agent.
     *         Only the agent owner may call this.
     *
     * @param agentId        ID of the agent to update.
     * @param newCostPerTask New cost in wei per task execution.
     */
    function updateCost(uint256 agentId, uint256 newCostPerTask) external;

    /**
     * @notice Update the rolling average execution speed for an agent.
     *         Called by the AgentMarketplace after each completed task so
     *         that the on-chain speed metric stays current.
     *         Only the marketplace contract may call this.
     *
     * @param agentId      ID of the agent to update.
     * @param newAvgSpeedMs New rolling average in milliseconds.
     */
    function updateSpeed(uint256 agentId, uint256 newAvgSpeedMs) external;

    // =========================================================================
    // READ FUNCTIONS
    // =========================================================================

    /**
     * @notice Fetch the full Agent struct for a given ID.
     * @param agentId  The agent to look up.
     * @return         The Agent struct (reverts if the agent does not exist).
     */
    function getAgent(
        uint256 agentId
    ) external view returns (DataTypes.Agent memory);

    /**
     * @notice Return the IDs of all currently *active* agents that match
     *         the requested task type. Used by the evaluation engine inside
     *         AgentMarketplace to build the candidate pool.
     *
     * @param agentType  Task-type key to filter by.
     * @return           Array of active agent IDs for that type.
     */
    function getActiveAgentsByType(
        string calldata agentType
    ) external view returns (uint256[] memory);

    /**
     * @notice Return all agent IDs registered by a specific owner address.
     * @param ownerAddress  The developer address to query.
     * @return              Array of agent IDs owned by that address.
     */
    function getAgentsByOwner(
        address ownerAddress
    ) external view returns (uint256[] memory);

    /**
     * @notice Check whether a specific agent is currently active.
     * @param agentId  The agent to check.
     * @return         True if active, false if deactivated or non-existent.
     */
    function isAgentActive(uint256 agentId) external view returns (bool);

    /**
     * @notice Return the total number of agents ever registered (including
     *         inactive ones). The latest live ID is equal to this value.
     * @return  Total registered agent count.
     */
    function getTotalAgents() external view returns (uint256);
}
