// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IAgentRegistry.sol";
import "../libraries/DataTypes.sol";

/**
 * @title AgentRegistry
 * @author Hey Elsa & The AI Council
 * @notice Permissionless registry where third-party developers list their
 *         specialised provider agents (e.g. "DEX Swap Bot", "Newsletter Gen",
 *         "PDF Report Bot"). The AgentMarketplace queries this contract to
 *         build the candidate pool for the Evaluation Engine.
 *
 *         Key design decisions:
 *         • Any address can register an agent — fully permissionless.
 *         • Agent owners (or the contract admin) may deactivate / reactivate
 *           an agent at any time without losing its reputation history.
 *         • The marketplace holds MARKETPLACE_ROLE and is the only caller
 *           allowed to update the rolling avgSpeedMs metric on-chain.
 *         • Agent IDs start at 1; ID 0 is reserved as a sentinel "no agent".
 *
 *         Supported agentType keys (non-exhaustive):
 *           "DEX_SWAP"       – On-chain DEX trade execution
 *           "YIELD_FARM"     – On-chain yield/liquidity management
 *           "SMART_AUDIT"    – Smart contract security audit
 *           "NEWSLETTER_GEN" – Off-chain newsletter / content drafting
 *           "PDF_REPORT"     – Off-chain PDF report generation
 */
contract AgentRegistry is IAgentRegistry, Ownable {
    // =========================================================================
    // ROLES
    // =========================================================================

    /// @notice Role identifier for the AgentMarketplace contract.
    ///         Only this address may call updateSpeed().
    address public marketplace;

    // =========================================================================
    // STATE
    // =========================================================================

    /// @dev Auto-incrementing ID counter. Starts at 1 so that 0 == "none".
    uint256 private _nextAgentId;

    /// @notice Primary agent storage: agentId → Agent struct.
    mapping(uint256 => DataTypes.Agent) private _agents;

    /// @notice Index for fast type-based lookups: agentType → list of agentIds.
    ///         Includes inactive agents; callers must filter with isActive.
    mapping(string => uint256[]) private _agentsByType;

    /// @notice Index for owner-based lookups: ownerAddress → list of agentIds.
    mapping(address => uint256[]) private _agentsByOwner;

    // =========================================================================
    // CUSTOM ERRORS
    // =========================================================================

    error AgentNotFound(uint256 agentId);
    error NotAgentOwnerOrAdmin(uint256 agentId, address caller);
    error AgentAlreadyActive(uint256 agentId);
    error AgentAlreadyInactive(uint256 agentId);
    error NotMarketplace(address caller);
    error EmptyName();
    error EmptyAgentType();

    // =========================================================================
    // MODIFIERS
    // =========================================================================

    /// @dev Restricts speed updates to the registered marketplace address.
    modifier onlyMarketplace() {
        if (msg.sender != marketplace) revert NotMarketplace(msg.sender);
        _;
    }

    /// @dev Ensures the agent exists (was ever registered).
    modifier agentExists(uint256 agentId) {
        if (_agents[agentId].registeredAt == 0) revert AgentNotFound(agentId);
        _;
    }

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * @param admin  Initial owner of the registry (typically the deployer
     *               multisig / ElsaOrchestrator admin).
     */
    constructor(address admin) Ownable(admin) {
        _nextAgentId = 1;
    }

    // =========================================================================
    // ADMIN FUNCTIONS
    // =========================================================================

    /**
     * @notice Set or update the authorised AgentMarketplace address.
     *         Must be called after the marketplace is deployed so it can
     *         update avgSpeedMs post-task-completion.
     * @param marketplaceAddress  Address of the deployed AgentMarketplace.
     */
    function setMarketplace(address marketplaceAddress) external onlyOwner {
        require(
            marketplaceAddress != address(0),
            "AgentRegistry: zero address"
        );
        marketplace = marketplaceAddress;
    }

    // =========================================================================
    // EXTERNAL WRITE — AGENT OWNERS
    // =========================================================================

    /**
     * @inheritdoc IAgentRegistry
     *
     * @dev Assigns the next available ID, writes the full Agent struct, and
     *      indexes the agent by both type and owner for O(n) filtered lookups.
     *      Does NOT call ReputationEngine — the marketplace does that step
     *      after verifying the agent ID in its own registerAgent wrapper.
     *
     *      The caller (msg.sender) becomes the agent owner. When registering
     *      directly through this function (not via the marketplace gateway),
     *      the developer is responsible for separately initialising reputation
     *      in the ReputationEngine.
     */
    function registerAgent(
        string calldata name,
        string calldata agentType,
        DataTypes.AgentCategory category,
        uint256 costPerTask,
        uint256 avgSpeedMs
    ) external override returns (uint256 agentId) {
        return
            _registerAgent(
                msg.sender,
                name,
                agentType,
                category,
                costPerTask,
                avgSpeedMs
            );
    }

    /**
     * @inheritdoc IAgentRegistry
     *
     * @dev Called exclusively by the AgentMarketplace gateway so that the real
     *      developer wallet (msg.sender on the marketplace call) is recorded as
     *      the agent owner rather than the marketplace contract address.
     *
     *      This solves the msg.sender forwarding problem: when the marketplace
     *      calls registerAgent() on behalf of a developer, msg.sender inside
     *      the registry would be the marketplace address. By routing through
     *      registerAgentFor(), the marketplace explicitly passes the developer's
     *      address and the ownership is set correctly.
     *
     *      Only the registered marketplace address may call this function
     *      (enforced by the onlyMarketplace modifier).
     */
    function registerAgentFor(
        address owner,
        string calldata name,
        string calldata agentType,
        DataTypes.AgentCategory category,
        uint256 costPerTask,
        uint256 avgSpeedMs
    ) external override onlyMarketplace returns (uint256 agentId) {
        require(owner != address(0), "AgentRegistry: zero owner address");
        return
            _registerAgent(
                owner,
                name,
                agentType,
                category,
                costPerTask,
                avgSpeedMs
            );
    }

    /**
     * @inheritdoc IAgentRegistry
     *
     * @dev The agent's reputation history is preserved — deactivation simply
     *      removes it from the evaluation engine's candidate pool.
     */
    function deactivateAgent(
        uint256 agentId
    ) external override agentExists(agentId) {
        DataTypes.Agent storage agent = _agents[agentId];
        _requireOwnerOrAdmin(agent, agentId);

        if (!agent.isActive) revert AgentAlreadyInactive(agentId);

        agent.isActive = false;
        emit AgentDeactivated(agentId);
    }

    /// @inheritdoc IAgentRegistry
    function activateAgent(
        uint256 agentId
    ) external override agentExists(agentId) {
        DataTypes.Agent storage agent = _agents[agentId];
        _requireOwnerOrAdmin(agent, agentId);

        if (agent.isActive) revert AgentAlreadyActive(agentId);

        agent.isActive = true;
        emit AgentActivated(agentId);
    }

    /**
     * @inheritdoc IAgentRegistry
     *
     * @dev Only the agent owner (not the admin) may reprice their agent.
     *      Setting cost to zero is allowed — free agents can exist.
     */
    function updateCost(
        uint256 agentId,
        uint256 newCostPerTask
    ) external override agentExists(agentId) {
        DataTypes.Agent storage agent = _agents[agentId];
        if (agent.owner != msg.sender)
            revert NotAgentOwnerOrAdmin(agentId, msg.sender);

        agent.costPerTask = newCostPerTask;
        emit AgentCostUpdated(agentId, newCostPerTask);
    }

    // =========================================================================
    // EXTERNAL WRITE — MARKETPLACE ONLY
    // =========================================================================

    /**
     * @inheritdoc IAgentRegistry
     *
     * @dev Called by AgentMarketplace.completeTask() with the actual measured
     *      execution time so the on-chain speed metric stays accurate.
     *      Uses a simple rolling average: newAvg = (oldAvg × n + newTime) / (n+1)
     *      capped at the agent's total successful tasks (passed in as newAvgSpeedMs
     *      already computed by the marketplace to save gas).
     */
    function updateSpeed(
        uint256 agentId,
        uint256 newAvgSpeedMs
    ) external override onlyMarketplace agentExists(agentId) {
        _agents[agentId].avgSpeedMs = newAvgSpeedMs;
        emit AgentSpeedUpdated(agentId, newAvgSpeedMs);
    }

    // =========================================================================
    // EXTERNAL READ
    // =========================================================================

    /// @inheritdoc IAgentRegistry
    function getAgent(
        uint256 agentId
    )
        external
        view
        override
        agentExists(agentId)
        returns (DataTypes.Agent memory)
    {
        return _agents[agentId];
    }

    /**
     * @inheritdoc IAgentRegistry
     *
     * @dev Iterates the full type index twice: once to count active agents
     *      (to size the output array), once to populate it.
     *      Gas cost is O(n) in the number of agents of that type.
     *      Acceptable at current scale; a Merkle-tree index can replace this
     *      if the registry grows to thousands of agents per type.
     */
    function getActiveAgentsByType(
        string calldata agentType
    ) external view override returns (uint256[] memory) {
        uint256[] storage allIds = _agentsByType[agentType];
        uint256 total = allIds.length;

        // First pass: count active agents
        uint256 activeCount = 0;
        for (uint256 i = 0; i < total; ) {
            if (_agents[allIds[i]].isActive) {
                unchecked {
                    activeCount++;
                }
            }
            unchecked {
                i++;
            }
        }

        // Second pass: populate output array
        uint256[] memory activeIds = new uint256[](activeCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < total; ) {
            if (_agents[allIds[i]].isActive) {
                activeIds[idx] = allIds[i];
                unchecked {
                    idx++;
                }
            }
            unchecked {
                i++;
            }
        }

        return activeIds;
    }

    /// @inheritdoc IAgentRegistry
    function getAgentsByOwner(
        address ownerAddress
    ) external view override returns (uint256[] memory) {
        return _agentsByOwner[ownerAddress];
    }

    /// @inheritdoc IAgentRegistry
    function isAgentActive(
        uint256 agentId
    ) external view override returns (bool) {
        return _agents[agentId].isActive;
    }

    /// @inheritdoc IAgentRegistry
    function getTotalAgents() external view override returns (uint256) {
        // _nextAgentId starts at 1, so subtract 1 for the true count
        return _nextAgentId - 1;
    }

    /**
     * @notice Convenience view — returns all registered agentIds for a given
     *         type, including inactive ones. Useful for admin dashboards.
     * @param agentType  Task-type key to look up.
     * @return           All agentIds (active + inactive) for this type.
     */
    function getAllAgentsByType(
        string calldata agentType
    ) external view returns (uint256[] memory) {
        return _agentsByType[agentType];
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /**
     * @dev Core registration logic shared by registerAgent() and registerAgentFor().
     *      Assigns the next available ID, writes the Agent struct, and populates
     *      both the type-index and owner-index mappings.
     *
     * @param owner        Address to set as the agent owner.
     * @param name         Human-readable agent name (must be non-empty).
     * @param agentType    Task-type key (must be non-empty).
     * @param category     CRYPTO or WEB2 execution pathway.
     * @param costPerTask  Wei charged per task.
     * @param avgSpeedMs   Initial self-reported average execution time in ms.
     *
     * @return agentId     The newly assigned unique agent ID.
     */
    function _registerAgent(
        address owner,
        string calldata name,
        string calldata agentType,
        DataTypes.AgentCategory category,
        uint256 costPerTask,
        uint256 avgSpeedMs
    ) internal returns (uint256 agentId) {
        if (bytes(name).length == 0) revert EmptyName();
        if (bytes(agentType).length == 0) revert EmptyAgentType();

        agentId = _nextAgentId++;

        _agents[agentId] = DataTypes.Agent({
            id: agentId,
            owner: owner,
            name: name,
            agentType: agentType,
            category: category,
            costPerTask: costPerTask,
            avgSpeedMs: avgSpeedMs,
            isActive: true,
            registeredAt: block.timestamp
        });

        // Update lookup indexes
        _agentsByType[agentType].push(agentId);
        _agentsByOwner[owner].push(agentId);

        emit AgentRegistered(agentId, owner, name, agentType, category);
    }

    /**
     * @dev Reverts if the caller is neither the agent owner nor the contract admin.
     */
    function _requireOwnerOrAdmin(
        DataTypes.Agent storage agent,
        uint256 agentId
    ) internal view {
        if (agent.owner != msg.sender && owner() != msg.sender) {
            revert NotAgentOwnerOrAdmin(agentId, msg.sender);
        }
    }
}
