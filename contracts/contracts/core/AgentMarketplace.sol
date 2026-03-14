// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "../interfaces/IAgentMarketplace.sol";
import "../interfaces/IAgentRegistry.sol";
import "../interfaces/IReputationEngine.sol";
import "../interfaces/ITaskEscrow.sol";
import "../libraries/DataTypes.sol";

/**
 * @title AgentMarketplace
 * @author Hey Elsa & The AI Council
 * @notice The On-Chain Agent Marketplace — Smart Contract Hub at Tier 4.
 *         This is the decentralised economy's coordination layer: it receives
 *         strategic blueprints from Hey Elsa, runs the Evaluation Engine to
 *         select the highest-scoring provider agent, manages the full task
 *         lifecycle, and orchestrates payment through TaskEscrow.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ARCHITECTURE POSITION
 * ─────────────────────────────────────────────────────────────────────────────
 *   Tier 3 (ElsaOrchestrator) → postTask() → [This Contract]
 *   [This Contract] → AgentRegistry  (query candidate providers)
 *   [This Contract] → ReputationEngine (read scores, record outcomes)
 *   [This Contract] → TaskEscrow      (lock, release, refund payments)
 *   [This Contract] ← Web2Oracle      (completeTask callback for WEB2 tasks)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  EVALUATION ENGINE — COMPOSITE SCORE FORMULA
 * ─────────────────────────────────────────────────────────────────────────────
 *   Total composite score: 0 – 1000
 *
 *   ┌───────────────┬────────┬─────────────────────────────────────────────┐
 *   │ Component     │ Weight │ Calculation                                 │
 *   ├───────────────┼────────┼─────────────────────────────────────────────┤
 *   │ Reputation    │  50%   │ repScore / 2                                │
 *   │               │        │ (repScore is 0–1000 from ReputationEngine)  │
 *   │               │        │ → contributes 0–500 points                  │
 *   ├───────────────┼────────┼─────────────────────────────────────────────┤
 *   │ Cost          │  30%   │ (maxBudget – agentCost) × 300 / maxBudget   │
 *   │               │        │ → contributes 0–300 points                  │
 *   │               │        │ (cheaper agent = more points)               │
 *   ├───────────────┼────────┼─────────────────────────────────────────────┤
 *   │ Speed         │  20%   │ (SPEED_CEILING – min(avgSpeedMs,            │
 *   │               │        │  SPEED_CEILING)) × 200 / SPEED_CEILING      │
 *   │               │        │ → contributes 0–200 points                  │
 *   │               │        │ (faster agent = more points)                │
 *   └───────────────┴────────┴─────────────────────────────────────────────┘
 *
 *   SPEED_CEILING = 30_000 ms (30 s). Agents at or above this get 0 speed pts.
 *   Agents with avgSpeedMs == 0 (new/untracked) get the full 200 speed pts
 *   to encourage new providers to enter the market without being penalised.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  TASK LIFECYCLE
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *             postTask()          selectBestAgent()
 *   [OPEN] ─────────────────────► [ASSIGNED] ─────────────┐
 *     │                                                    │
 *     │ cancelTask()                          completeTask() │ failTask()
 *     ▼                                           ▼         ▼
 *  [CANCELLED]                             [COMPLETED]  [FAILED]
 *
 *   CRYPTO tasks:  completeTask() called by the agent owner after on-chain tx.
 *   WEB2 tasks:    completeTask() called only by the Web2Oracle after proof
 *                  verification, ensuring off-chain work is cryptographically
 *                  attested before payment is released.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ACCESS CONTROL
 * ─────────────────────────────────────────────────────────────────────────────
 *   DEFAULT_ADMIN_ROLE  – Deployer / multisig. Grants all other roles.
 *   ELSA_ROLE           – ElsaOrchestrator. May call postTask() and cancelTask().
 *   ORACLE_ROLE         – Web2Oracle. May call completeTask() for WEB2 tasks.
 *
 *   Agent owners (registered in AgentRegistry) may call:
 *     • completeTask() — for CRYPTO tasks only
 *     • failTask()     — for their own assigned tasks
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  REGISTRATION GATEWAY
 * ─────────────────────────────────────────────────────────────────────────────
 *   Third-party developers register their provider agents through this contract
 *   (not directly on AgentRegistry) so that reputation initialisation in the
 *   ReputationEngine happens atomically in the same transaction.
 */
contract AgentMarketplace is IAgentMarketplace, AccessControl, ReentrancyGuard {
    // =========================================================================
    // ROLES
    // =========================================================================

    /// @notice Granted to the ElsaOrchestrator contract.
    ///         Required to call postTask() and cancelTask().
    bytes32 public constant ELSA_ROLE = keccak256("ELSA_ROLE");

    /// @notice Granted to the Web2Oracle contract.
    ///         Required to call completeTask() for WEB2-category tasks.
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // =========================================================================
    // EVALUATION ENGINE CONSTANTS
    // =========================================================================

    /// @notice Maximum composite score (reputation 500 + cost 300 + speed 200).
    uint256 public constant MAX_COMPOSITE_SCORE = 1000;

    /// @notice Weight applied to the reputation component (out of 1000).
    ///         reputationContribution = repScore(0–1000) × REP_WEIGHT / 1000
    ///                                = repScore / 2  →  0–500 pts
    uint256 public constant REP_WEIGHT = 500;

    /// @notice Maximum points awarded for the cost component.
    uint256 public constant COST_WEIGHT = 300;

    /// @notice Maximum points awarded for the speed component.
    uint256 public constant SPEED_WEIGHT = 200;

    /// @notice Reference speed ceiling in milliseconds.
    ///         Agents at or above this threshold earn zero speed points.
    ///         Agents with avgSpeedMs == 0 earn the full SPEED_WEIGHT.
    uint256 public constant SPEED_CEILING = 30_000; // 30 seconds

    // =========================================================================
    // DEPENDENCY CONTRACTS
    // =========================================================================

    /// @notice AgentRegistry — source of provider agent metadata and type index.
    IAgentRegistry public immutable registry;

    /// @notice ReputationEngine — source of dynamic EMA scores.
    IReputationEngine public immutable reputation;

    /// @notice TaskEscrow — holds and disburses ETH payment per task.
    ITaskEscrow public immutable escrow;

    // =========================================================================
    // STATE
    // =========================================================================

    /// @dev Auto-incrementing task ID counter. Starts at 1 (0 == "no task").
    uint256 private _nextTaskId;

    /// @notice taskId → Task struct.
    mapping(uint256 => DataTypes.Task) private _tasks;

    /// @notice Maps a task type string to its keccak256 hash for cheaper
    ///         comparison during queryProviders (avoids repeated string hashing).
    ///         Not strictly required but improves gas on large candidate pools.

    // =========================================================================
    // CUSTOM ERRORS
    // =========================================================================

    /// @notice Thrown when a task is not found (never created).
    error TaskNotFound(uint256 taskId);

    /// @notice Thrown when an operation requires a specific task status but the
    ///         task is in a different state.
    error InvalidTaskStatus(
        uint256 taskId,
        DataTypes.TaskStatus required,
        DataTypes.TaskStatus actual
    );

    /// @notice Thrown when postTask is called but msg.value != maxBudget.
    error IncorrectPayment(uint256 sent, uint256 required);

    /// @notice Thrown when the evaluation engine finds no eligible providers.
    error NoEligibleProviders(string taskType);

    /// @notice Thrown when a non-agent-owner tries to complete or fail a task.
    error NotAssignedAgentOwner(uint256 taskId, address caller);

    /// @notice Thrown when completeTask is called for a WEB2 task by a non-oracle.
    error Web2TaskRequiresOracle(uint256 taskId);

    /// @notice Thrown when cancelTask is called by someone other than the requester.
    error NotTaskRequester(uint256 taskId, address caller);

    /// @notice Thrown when a zero address is supplied where one is not allowed.
    error ZeroAddress();

    // =========================================================================
    // EVENTS (supplementing IAgentMarketplace)
    // =========================================================================

    /**
     * @notice Emitted when a new provider agent is registered through the
     *         marketplace gateway (atomic registry + reputation init).
     * @param agentId    The new agent's ID assigned by the registry.
     * @param owner      The developer address that registered the agent.
     * @param agentType  Task-type key for this agent.
     */
    event ProviderAgentRegistered(
        uint256 indexed agentId,
        address indexed owner,
        string agentType
    );

    /**
     * @notice Emitted when the Evaluation Engine has scored all candidates.
     *         Useful for off-chain analytics and UI score breakdowns.
     * @param taskId           The evaluated task.
     * @param scores           Array of ProviderScore structs, sorted descending.
     */
    event EvaluationCompleted(
        uint256 indexed taskId,
        DataTypes.ProviderScore[] scores
    );

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * @param admin_      Address that receives DEFAULT_ADMIN_ROLE.
     * @param registry_   Address of the deployed AgentRegistry contract.
     * @param reputation_ Address of the deployed ReputationEngine contract.
     * @param escrow_     Address of the deployed TaskEscrow contract.
     */
    constructor(
        address admin_,
        address registry_,
        address reputation_,
        address escrow_
    ) {
        if (admin_ == address(0)) revert ZeroAddress();
        if (registry_ == address(0)) revert ZeroAddress();
        if (reputation_ == address(0)) revert ZeroAddress();
        if (escrow_ == address(0)) revert ZeroAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);

        registry = IAgentRegistry(registry_);
        reputation = IReputationEngine(reputation_);
        escrow = ITaskEscrow(escrow_);

        _nextTaskId = 1;
    }

    // =========================================================================
    // REGISTRATION GATEWAY
    // =========================================================================

    /**
     * @notice Register a new provider agent atomically:
     *         1. Writes the agent to AgentRegistry.
     *         2. Initialises its reputation record in ReputationEngine.
     *
     *         Developers MUST use this function (not AgentRegistry directly)
     *         to ensure every registered agent has a valid reputation record
     *         before the Evaluation Engine queries it.
     *
     * @param name         Human-readable display name for the agent.
     * @param agentType    Task-type key (e.g. "DEX_SWAP", "NEWSLETTER_GEN").
     * @param category     CRYPTO or WEB2 execution pathway.
     * @param costPerTask  Wei charged per task. Must be > 0.
     * @param avgSpeedMs   Initial self-reported average execution time in ms.
     *
     * @return agentId     The newly assigned agent ID.
     */
    function registerProviderAgent(
        string calldata name,
        string calldata agentType,
        DataTypes.AgentCategory category,
        uint256 costPerTask,
        uint256 avgSpeedMs
    ) external returns (uint256 agentId) {
        // Step 1 — register in the registry (caller becomes the owner)
        // Use registerAgentFor so that msg.sender (the developer wallet)
        // is recorded as the owner, not this marketplace contract address.
        agentId = registry.registerAgentFor(
            msg.sender,
            name,
            agentType,
            category,
            costPerTask,
            avgSpeedMs
        );

        // Step 2 — initialise reputation at neutral ★2.50
        reputation.initializeAgent(agentId);

        emit ProviderAgentRegistered(agentId, msg.sender, agentType);
    }

    // =========================================================================
    // TASK LIFECYCLE — WRITE
    // =========================================================================

    /**
     * @inheritdoc IAgentMarketplace
     *
     * @dev Called by ElsaOrchestrator (ELSA_ROLE) with msg.value == maxBudget.
     *      Atomically:
     *        1. Validates input and payment amount.
     *        2. Creates the Task record in OPEN status.
     *        3. Locks msg.value in TaskEscrow.
     *        4. Immediately runs selectBestAgent() to move to ASSIGNED.
     *           (Selection is done inline to reduce round-trip calls from Elsa,
     *            but can be separated if gas limits require it.)
     */
    function postTask(
        bytes32 blueprintHash,
        string calldata taskType,
        DataTypes.AgentCategory category,
        uint256 maxBudget
    ) external payable override onlyRole(ELSA_ROLE) returns (uint256 taskId) {
        // --- Checks ---
        if (msg.value != maxBudget)
            revert IncorrectPayment(msg.value, maxBudget);
        require(bytes(taskType).length > 0, "AgentMarketplace: empty taskType");
        require(maxBudget > 0, "AgentMarketplace: zero budget");

        // --- Effects ---
        taskId = _nextTaskId++;

        _tasks[taskId] = DataTypes.Task({
            id: taskId,
            blueprintHash: blueprintHash,
            taskType: taskType,
            category: category,
            requester: msg.sender,
            selectedAgentId: 0,
            maxBudget: maxBudget,
            status: DataTypes.TaskStatus.OPEN,
            createdAt: block.timestamp,
            completedAt: 0,
            proofHash: bytes32(0)
        });

        // --- Interactions: lock payment ---
        // Forward the full msg.value to the escrow (agentId = 0 until selection)
        escrow.lockFunds{value: msg.value}(taskId, 0);

        emit TaskPosted(taskId, msg.sender, taskType, category, maxBudget);

        // --- Inline agent selection (OPEN → ASSIGNED) ---
        selectBestAgent(taskId);
    }

    /**
     * @inheritdoc IAgentMarketplace
     *
     * @dev Runs the three-component Evaluation Engine over all active providers
     *      matching the task type, selects the highest composite scorer, and
     *      advances the task from OPEN → ASSIGNED.
     *
     *      Composite score breakdown (0–1000):
     *        • Reputation  50% → repScore(0–1000) / 2         = 0–500 pts
     *        • Cost        30% → (budget−cost)/budget × 300   = 0–300 pts
     *        • Speed       20% → (ceil−speed)/ceil  × 200     = 0–200 pts
     *
     *      Agents whose costPerTask > task.maxBudget are skipped entirely.
     *      Ties are broken in favour of the first encountered (lowest agentId),
     *      which is a deterministic and gas-efficient tiebreaker.
     *
     *      Emits EvaluationCompleted with the full scored candidate list for
     *      off-chain analytics.
     */
    function selectBestAgent(
        uint256 taskId
    ) public override returns (uint256 agentId) {
        // --- Checks ---
        DataTypes.Task storage task = _requireTask(taskId);
        _requireStatus(task, DataTypes.TaskStatus.OPEN);

        // --- Fetch candidates ---
        uint256[] memory candidates = registry.getActiveAgentsByType(
            task.taskType
        );
        if (candidates.length == 0) revert NoEligibleProviders(task.taskType);

        // --- Evaluation Engine ---
        DataTypes.ProviderScore[] memory scores = _evaluateCandidates(
            candidates,
            task.maxBudget
        );

        // Revert if every candidate exceeded the budget (scores array is empty)
        if (scores.length == 0) revert NoEligibleProviders(task.taskType);

        // --- Select winner (highest compositeScore, lowest agentId on tie) ---
        uint256 bestScore = 0;
        uint256 bestAgentId = 0;
        for (uint256 i = 0; i < scores.length; ) {
            if (scores[i].compositeScore > bestScore) {
                bestScore = scores[i].compositeScore;
                bestAgentId = scores[i].agentId;
            }
            unchecked {
                i++;
            }
        }

        // --- Effects ---
        task.selectedAgentId = bestAgentId;
        task.status = DataTypes.TaskStatus.ASSIGNED;

        // Update escrow with the resolved agentId
        escrow.assignAgent(taskId, bestAgentId);

        // --- Events ---
        emit EvaluationCompleted(taskId, scores);
        emit AgentSelected(taskId, bestAgentId, bestScore);

        return bestAgentId;
    }

    /**
     * @inheritdoc IAgentMarketplace
     *
     * @dev Marks an ASSIGNED task as COMPLETED and releases escrow payment.
     *      Two calling paths based on task category:
     *
     *      CRYPTO tasks:
     *        • Caller must be the owner of the selected agent in AgentRegistry.
     *        • The provider submits the tx hash (or equivalent) as proofHash.
     *        • This is a permissioned but trust-minimised flow: the marketplace
     *          admin can add additional on-chain verification in a future upgrade.
     *
     *      WEB2 tasks:
     *        • Caller must hold ORACLE_ROLE (the Web2Oracle contract).
     *        • The oracle has already verified the TLSNotary / API proof off-chain
     *          before calling this function, ensuring payment is only released for
     *          genuinely completed off-chain work.
     *        • Agent owners may NOT call completeTask on WEB2 tasks to prevent
     *          self-reporting fraud.
     *
     *      On success:
     *        1. Task status → COMPLETED, completedAt timestamp recorded.
     *        2. proofHash anchored in the Task struct.
     *        3. ReputationEngine records a success (EMA score update).
     *        4. AgentRegistry avgSpeedMs updated with actual responseTimeMs.
     *        5. TaskEscrow releases payment to the agent owner's address.
     */
    function completeTask(
        uint256 taskId,
        bytes32 proofHash,
        uint256 responseTimeMs
    ) external override nonReentrant {
        // --- Checks ---
        DataTypes.Task storage task = _requireTask(taskId);
        _requireStatus(task, DataTypes.TaskStatus.ASSIGNED);

        DataTypes.Agent memory agent = registry.getAgent(task.selectedAgentId);

        if (task.category == DataTypes.AgentCategory.WEB2) {
            // WEB2: only the oracle can report completion
            if (!hasRole(ORACLE_ROLE, msg.sender))
                revert Web2TaskRequiresOracle(taskId);
        } else {
            // CRYPTO: only the assigned agent's registered owner can report
            if (msg.sender != agent.owner)
                revert NotAssignedAgentOwner(taskId, msg.sender);
        }

        // --- Effects ---
        task.status = DataTypes.TaskStatus.COMPLETED;
        task.completedAt = block.timestamp;
        task.proofHash = proofHash;

        // --- Update reputation (EMA score moves toward MAX) ---
        reputation.recordSuccess(task.selectedAgentId, responseTimeMs);

        // --- Update rolling average speed in registry ---
        uint256 newAvgSpeed = reputation.getAverageResponseTimeMs(
            task.selectedAgentId
        );
        registry.updateSpeed(task.selectedAgentId, newAvgSpeed);

        // --- Interactions: release escrow to agent owner ---
        escrow.releaseFunds(taskId, agent.owner);

        emit TaskCompleted(taskId, task.selectedAgentId, proofHash);
    }

    /**
     * @inheritdoc IAgentMarketplace
     *
     * @dev Marks an ASSIGNED task as FAILED and refunds escrowed payment.
     *      Callable by:
     *        • The assigned agent's owner (voluntary failure report).
     *        • Any address holding DEFAULT_ADMIN_ROLE (admin-forced failure
     *          used when an agent is unresponsive or malicious).
     *
     *      On failure:
     *        1. Task status → FAILED, completedAt timestamp recorded.
     *        2. ReputationEngine records a failure (EMA score moves toward 0).
     *        3. TaskEscrow refunds full payment to the original requester.
     */
    function failTask(
        uint256 taskId,
        string calldata reason
    ) external override nonReentrant {
        // --- Checks ---
        DataTypes.Task storage task = _requireTask(taskId);
        _requireStatus(task, DataTypes.TaskStatus.ASSIGNED);

        DataTypes.Agent memory agent = registry.getAgent(task.selectedAgentId);

        bool isAgentOwner = (msg.sender == agent.owner);
        bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        // Allow the oracle to fail WEB2 tasks (mirrors completeTask logic)
        bool isOracle = (task.category == DataTypes.AgentCategory.WEB2 &&
                         hasRole(ORACLE_ROLE, msg.sender));

        if (!isAgentOwner && !isAdmin && !isOracle)
            revert NotAssignedAgentOwner(taskId, msg.sender);

        // --- Effects ---
        task.status = DataTypes.TaskStatus.FAILED;
        task.completedAt = block.timestamp;

        // --- Update reputation (EMA score moves toward 0) ---
        reputation.recordFailure(task.selectedAgentId);

        // --- Interactions: refund escrow to requester ---
        escrow.refundFunds(taskId);

        emit TaskFailed(taskId, task.selectedAgentId, reason);
    }

    /**
     * @inheritdoc IAgentMarketplace
     *
     * @dev Cancels an OPEN task (before any agent is assigned) and refunds
     *      the full escrow to the requester. Only the original requester
     *      (the ElsaOrchestrator that called postTask) may cancel.
     *
     *      Note: Because postTask() calls selectBestAgent() inline, a task
     *      can only be cancelled if selectBestAgent reverted (no providers
     *      available) and the task was left in OPEN status. In normal operation
     *      tasks move directly from OPEN → ASSIGNED in the same tx.
     *      This function is therefore primarily a safety valve for edge cases.
     */
    function cancelTask(uint256 taskId) external override nonReentrant {
        // --- Checks ---
        DataTypes.Task storage task = _requireTask(taskId);
        _requireStatus(task, DataTypes.TaskStatus.OPEN);

        if (msg.sender != task.requester)
            revert NotTaskRequester(taskId, msg.sender);

        // --- Effects ---
        task.status = DataTypes.TaskStatus.CANCELLED;
        task.completedAt = block.timestamp;

        // --- Interactions: refund escrow ---
        escrow.refundFunds(taskId);

        emit TaskCancelled(taskId);
    }

    // =========================================================================
    // READ — TASK QUERIES
    // =========================================================================

    /**
     * @inheritdoc IAgentMarketplace
     */
    function getTask(
        uint256 taskId
    ) external view override returns (DataTypes.Task memory) {
        if (_tasks[taskId].createdAt == 0) revert TaskNotFound(taskId);
        return _tasks[taskId];
    }

    /**
     * @inheritdoc IAgentMarketplace
     *
     * @dev Read-only version of the Evaluation Engine. Runs the full composite
     *      scoring pass and returns all eligible candidates sorted descending
     *      by compositeScore. The first element is the current best pick.
     *
     *      This function does NOT modify state; it is safe to call off-chain
     *      via eth_call to preview the marketplace before committing a task.
     *
     * @param taskType   Agent type key to filter providers by.
     * @param category   CRYPTO or WEB2 — agents must match this category.
     * @param maxBudget  Cost ceiling — agents above this are excluded.
     *
     * @return scores  ProviderScore array, sorted descending by compositeScore.
     */
    function queryProviders(
        string calldata taskType,
        DataTypes.AgentCategory category,
        uint256 maxBudget
    ) external view override returns (DataTypes.ProviderScore[] memory scores) {
        uint256[] memory candidates = registry.getActiveAgentsByType(taskType);
        if (candidates.length == 0) return scores; // empty array

        // Filter by category and budget before scoring
        uint256 eligible = 0;
        for (uint256 i = 0; i < candidates.length; ) {
            DataTypes.Agent memory agent = registry.getAgent(candidates[i]);
            if (agent.category == category && agent.costPerTask <= maxBudget) {
                unchecked {
                    eligible++;
                }
            }
            unchecked {
                i++;
            }
        }
        if (eligible == 0) return scores;

        // Build and score the eligible subset
        scores = new DataTypes.ProviderScore[](eligible);
        uint256 idx = 0;
        for (uint256 i = 0; i < candidates.length; ) {
            DataTypes.Agent memory agent = registry.getAgent(candidates[i]);
            if (agent.category == category && agent.costPerTask <= maxBudget) {
                scores[idx] = DataTypes.ProviderScore({
                    agentId: candidates[i],
                    compositeScore: _computeCompositeScore(
                        candidates[i],
                        agent.costPerTask,
                        agent.avgSpeedMs,
                        maxBudget
                    )
                });
                unchecked {
                    idx++;
                }
            }
            unchecked {
                i++;
            }
        }

        // Sort descending by compositeScore (insertion sort — small n expected)
        _sortDescending(scores);
    }

    /// @inheritdoc IAgentMarketplace
    function getTotalTasks() external view override returns (uint256) {
        return _nextTaskId - 1;
    }

    // =========================================================================
    // INTERNAL — EVALUATION ENGINE
    // =========================================================================

    /**
     * @dev Scores all candidates against a task's budget and returns a packed
     *      ProviderScore array containing only budget-eligible agents.
     *      Agents whose costPerTask > maxBudget are skipped.
     *
     * @param candidates  Array of agentIds from the registry type index.
     * @param maxBudget   Maximum budget for this task in wei.
     *
     * @return scored  ProviderScore array (may be shorter than candidates
     *                 if some exceeded the budget).
     */
    function _evaluateCandidates(
        uint256[] memory candidates,
        uint256 maxBudget
    ) internal view returns (DataTypes.ProviderScore[] memory scored) {
        // First pass: count eligible candidates (costPerTask <= maxBudget)
        uint256 eligibleCount = 0;
        for (uint256 i = 0; i < candidates.length; ) {
            DataTypes.Agent memory agent = registry.getAgent(candidates[i]);
            if (agent.costPerTask <= maxBudget) {
                unchecked {
                    eligibleCount++;
                }
            }
            unchecked {
                i++;
            }
        }

        if (eligibleCount == 0) return scored; // empty array → caller reverts

        // Second pass: compute composite score for each eligible candidate
        scored = new DataTypes.ProviderScore[](eligibleCount);
        uint256 idx = 0;
        for (uint256 i = 0; i < candidates.length; ) {
            DataTypes.Agent memory agent = registry.getAgent(candidates[i]);
            if (agent.costPerTask <= maxBudget) {
                scored[idx] = DataTypes.ProviderScore({
                    agentId: candidates[i],
                    compositeScore: _computeCompositeScore(
                        candidates[i],
                        agent.costPerTask,
                        agent.avgSpeedMs,
                        maxBudget
                    )
                });
                unchecked {
                    idx++;
                }
            }
            unchecked {
                i++;
            }
        }
    }

    /**
     * @dev Computes the three-component composite score for a single provider.
     *
     *      reputation component (0–500):
     *        repScore is 0–1000 from ReputationEngine.
     *        contribution = repScore * REP_WEIGHT / MAX_SCORE
     *                     = repScore * 500 / 1000
     *                     = repScore / 2
     *
     *      cost component (0–300):
     *        Cheaper agents score higher. If cost == 0, full 300 points.
     *        contribution = (maxBudget − cost) * COST_WEIGHT / maxBudget
     *
     *      speed component (0–200):
     *        Faster agents score higher. avgSpeedMs == 0 → full 200 points
     *        (new agents are not penalised for lacking history).
     *        Agents at or above SPEED_CEILING → 0 speed points.
     *        contribution = (SPEED_CEILING − clampedSpeed) * SPEED_WEIGHT / SPEED_CEILING
     *
     * @param agentId_     ID of the agent being scored.
     * @param agentCost    agent.costPerTask in wei.
     * @param agentSpeed   agent.avgSpeedMs.
     * @param maxBudget    Task's maximum budget in wei.
     *
     * @return composite   Weighted composite score in the range 0–1000.
     */
    function _computeCompositeScore(
        uint256 agentId_,
        uint256 agentCost,
        uint256 agentSpeed,
        uint256 maxBudget
    ) internal view returns (uint256 composite) {
        // ── 1. Reputation component (0–500) ──────────────────────────────────
        uint256 repScore = reputation.getScore(agentId_); // 0–1000
        uint256 repComponent = (repScore * REP_WEIGHT) / 1000;
        // repComponent = repScore * 500 / 1000 = repScore / 2  → 0–500

        // ── 2. Cost component (0–300) ─────────────────────────────────────────
        // Lower cost = more points. maxBudget > 0 guaranteed by postTask checks.
        uint256 costComponent = ((maxBudget - agentCost) * COST_WEIGHT) /
            maxBudget;
        // costComponent ∈ [0, 300]

        // ── 3. Speed component (0–200) ────────────────────────────────────────
        uint256 speedComponent;
        if (agentSpeed == 0) {
            // No speed history yet → award full speed points to attract newcomers
            speedComponent = SPEED_WEIGHT;
        } else {
            // Clamp agentSpeed to SPEED_CEILING so we never underflow
            uint256 clampedSpeed = agentSpeed > SPEED_CEILING
                ? SPEED_CEILING
                : agentSpeed;
            speedComponent =
                ((SPEED_CEILING - clampedSpeed) * SPEED_WEIGHT) /
                SPEED_CEILING;
        }
        // speedComponent ∈ [0, 200]

        // ── Total ─────────────────────────────────────────────────────────────
        composite = repComponent + costComponent + speedComponent;
        // composite ∈ [0, 1000]
    }

    /**
     * @dev In-place insertion sort of a ProviderScore array, descending by
     *      compositeScore. Insertion sort is chosen over quicksort because:
     *        • The candidate pool per task type is small (typically < 20).
     *        • It is stable and entirely in-memory — no storage writes.
     *        • It avoids the stack-depth overhead of recursive quicksort.
     *
     * @param arr  The ProviderScore array to sort in-place.
     */
    function _sortDescending(
        DataTypes.ProviderScore[] memory arr
    ) internal pure {
        uint256 n = arr.length;
        for (uint256 i = 1; i < n; ) {
            DataTypes.ProviderScore memory key = arr[i];
            uint256 j = i;
            // Shift elements that are LESS than key one position to the right
            while (j > 0 && arr[j - 1].compositeScore < key.compositeScore) {
                arr[j] = arr[j - 1];
                unchecked {
                    j--;
                }
            }
            arr[j] = key;
            unchecked {
                i++;
            }
        }
    }

    // =========================================================================
    // INTERNAL — VALIDATION HELPERS
    // =========================================================================

    /**
     * @dev Returns a storage pointer to the Task for `taskId`, reverting with
     *      TaskNotFound if the task has never been created (createdAt == 0).
     *
     * @param taskId  The task to retrieve.
     * @return task   Storage reference to the Task struct.
     */
    function _requireTask(
        uint256 taskId
    ) internal view returns (DataTypes.Task storage task) {
        task = _tasks[taskId];
        if (task.createdAt == 0) revert TaskNotFound(taskId);
    }

    /**
     * @dev Reverts with InvalidTaskStatus if `task.status` does not equal
     *      `required`. Used as a guard at the top of every lifecycle function
     *      to enforce the one-way state machine.
     *
     * @param task      Storage reference to the Task struct.
     * @param required  The status the task must currently be in.
     */
    function _requireStatus(
        DataTypes.Task storage task,
        DataTypes.TaskStatus required
    ) internal view {
        if (task.status != required)
            revert InvalidTaskStatus(task.id, required, task.status);
    }
}
