// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IReputationEngine.sol";
import "../libraries/DataTypes.sol";

/**
 * @title ReputationEngine
 * @author Hey Elsa & The AI Council
 * @notice On-chain dynamic reputation scoring system for provider agents in
 *         the Hey Elsa Agent Marketplace (Tier 4).
 *
 *         Every provider agent starts at a neutral ★2.50 (score = 500) and
 *         moves up or down after each task using an Exponential Moving Average
 *         (EMA) so that recent performance matters more than ancient history
 *         while still being smoothed against one-off anomalies.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  SCORE SCALE
 * ─────────────────────────────────────────────────────────────────────────────
 *   Raw score  : 0 – 1000  (stored on-chain)
 *   Star display: score / 200  →  ★0.00 – ★5.00
 *
 *   Examples:
 *     1000  →  ★5.00   (perfect record)
 *      980  →  ★4.90   (DEX Swap Bot in the diagram)
 *      900  →  ★4.50
 *      500  →  ★2.50   (fresh agent, neutral start)
 *      200  →  ★1.00
 *        0  →  ★0.00   (catastrophic failure history)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  EMA FORMULA
 * ─────────────────────────────────────────────────────────────────────────────
 *   α  = EMA_ALPHA / 100  = 0.20  (20% weight on the most recent outcome)
 *   1-α = 0.80                    (80% weight on accumulated history)
 *
 *   On SUCCESS (task result treated as full score = MAX_SCORE = 1000):
 *     newScore = α × 1000 + (1−α) × oldScore
 *              = (EMA_ALPHA × 1000 + (100 − EMA_ALPHA) × oldScore) / 100
 *
 *   On FAILURE (task result treated as zero score = 0):
 *     newScore = α × 0 + (1−α) × oldScore
 *              = ((100 − EMA_ALPHA) × oldScore) / 100
 *
 *   This means:
 *   • A perfect-record agent scoring ★5.00 needs ~13 consecutive failures
 *     before dropping below ★2.50 — protecting providers from isolated bugs.
 *   • A brand-new agent at ★2.50 reaches ★4.50 after ~12 successes — fast
 *     enough for quality agents to rise quickly without being gamed overnight.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  ACCESS CONTROL
 * ─────────────────────────────────────────────────────────────────────────────
 *   DEFAULT_ADMIN_ROLE  – Contract admin (deployer multisig). Can grant roles.
 *   MARKETPLACE_ROLE    – AgentMarketplace contract. Only caller that may
 *                         mutate reputation state (initializeAgent, recordSuccess,
 *                         recordFailure). Prevents reputation manipulation from
 *                         outside the verified task lifecycle.
 */
contract ReputationEngine is IReputationEngine, AccessControl {
    // =========================================================================
    // ROLES
    // =========================================================================

    /// @notice Role granted to the AgentMarketplace contract.
    ///         All state-mutating calls require this role.
    bytes32 public constant MARKETPLACE_ROLE = keccak256("MARKETPLACE_ROLE");

    // =========================================================================
    // SCORING CONSTANTS
    // =========================================================================

    /// @notice Maximum possible score (★5.00 when divided by 200).
    uint256 public constant MAX_SCORE = 1000;

    /// @notice Neutral starting score for every new agent (★2.50).
    uint256 public constant INITIAL_SCORE = 500;

    /// @notice EMA smoothing factor as a percentage (20 = 20%).
    ///         Determines how much weight the most recent task carries.
    ///         Range: 1–99. Lower = smoother / slower to change.
    uint256 public constant EMA_ALPHA = 20;

    /// @notice Denominator for EMA_ALPHA (always 100).
    uint256 private constant EMA_DENOMINATOR = 100;

    /// @notice Denominator to convert raw score to star display value.
    ///         score / STAR_DENOMINATOR = star rating (e.g. 980 / 200 = 4.90).
    uint256 public constant STAR_DENOMINATOR = 200;

    // =========================================================================
    // STATE
    // =========================================================================

    /// @notice agentId → ReputationData snapshot.
    ///         A zero lastUpdated timestamp indicates the agent has not been
    ///         initialised and should be treated as non-existent.
    mapping(uint256 => DataTypes.ReputationData) private _reputations;

    // =========================================================================
    // CUSTOM ERRORS
    // =========================================================================

    /// @notice Thrown when operating on an agent that has not been initialised.
    error AgentNotInitialized(uint256 agentId);

    /// @notice Thrown when attempting to initialise an agent that already exists.
    error AlreadyInitialized(uint256 agentId);

    // =========================================================================
    // CONSTRUCTOR
    // =========================================================================

    /**
     * @param admin  Address that receives DEFAULT_ADMIN_ROLE.
     *               Should be the deployer multisig or the ElsaOrchestrator admin.
     */
    constructor(address admin) {
        require(admin != address(0), "ReputationEngine: zero admin address");
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // =========================================================================
    // EXTERNAL WRITE — MARKETPLACE_ROLE ONLY
    // =========================================================================

    /**
     * @inheritdoc IReputationEngine
     *
     * @dev Creates a fresh ReputationData record at the neutral starting score
     *      (INITIAL_SCORE = 500 = ★2.50). The timestamp is set to block.timestamp
     *      so it doubles as an existence check (zero == not initialised).
     *
     *      Must be called by AgentMarketplace immediately after a successful
     *      call to AgentRegistry.registerAgent().
     */
    function initializeAgent(
        uint256 agentId
    ) external override onlyRole(MARKETPLACE_ROLE) {
        if (_reputations[agentId].lastUpdated != 0)
            revert AlreadyInitialized(agentId);

        _reputations[agentId] = DataTypes.ReputationData({
            totalTasks: 0,
            successfulTasks: 0,
            failedTasks: 0,
            totalResponseTimeMs: 0,
            score: INITIAL_SCORE,
            lastUpdated: block.timestamp
        });

        emit AgentInitialized(agentId);
    }

    /**
     * @inheritdoc IReputationEngine
     *
     * @dev EMA update on success:
     *        newScore = (α × MAX_SCORE + (1−α) × oldScore)
     *                 = (EMA_ALPHA × 1000 + (100 − EMA_ALPHA) × oldScore) / 100
     *
     *      Also increments successfulTasks and accumulates responseTimeMs so
     *      the caller can derive the rolling average execution speed.
     *
     *      Integer arithmetic note: multiplication before division preserves
     *      precision; no overflow risk because MAX_SCORE × 100 = 100_000 which
     *      fits comfortably in uint256.
     */
    function recordSuccess(
        uint256 agentId,
        uint256 responseTimeMs
    ) external override onlyRole(MARKETPLACE_ROLE) {
        DataTypes.ReputationData storage rep = _requireInitialized(agentId);

        // Update task counters
        unchecked {
            rep.totalTasks++;
            rep.successfulTasks++;
            rep.totalResponseTimeMs += responseTimeMs;
        }

        // EMA: pull score toward MAX_SCORE (1000)
        rep.score =
            (EMA_ALPHA *
                MAX_SCORE +
                (EMA_DENOMINATOR - EMA_ALPHA) *
                rep.score) /
            EMA_DENOMINATOR;

        // Clamp to [0, MAX_SCORE] as a safety guard against edge cases
        if (rep.score > MAX_SCORE) rep.score = MAX_SCORE;

        rep.lastUpdated = block.timestamp;

        emit ScoreUpdated(agentId, rep.score, true);
    }

    /**
     * @inheritdoc IReputationEngine
     *
     * @dev EMA update on failure:
     *        newScore = (1−α) × oldScore
     *                 = ((100 − EMA_ALPHA) × oldScore) / 100
     *
     *      Treating failure as a zero-point result means the score is simply
     *      damped by the history weight. This asymmetry (failures only damp,
     *      successes also add the α × 1000 boost) means success has a slightly
     *      stronger pull than failure — a deliberate design choice to avoid
     *      overly punishing agents for transient infrastructure issues.
     */
    function recordFailure(
        uint256 agentId
    ) external override onlyRole(MARKETPLACE_ROLE) {
        DataTypes.ReputationData storage rep = _requireInitialized(agentId);

        // Update task counters
        unchecked {
            rep.totalTasks++;
            rep.failedTasks++;
        }

        // EMA: pull score toward 0 (zero-point failure outcome)
        rep.score =
            ((EMA_DENOMINATOR - EMA_ALPHA) * rep.score) /
            EMA_DENOMINATOR;

        rep.lastUpdated = block.timestamp;

        emit ScoreUpdated(agentId, rep.score, false);
    }

    // =========================================================================
    // EXTERNAL READ
    // =========================================================================

    /**
     * @inheritdoc IReputationEngine
     *
     * @dev Returns 0 for agents that have not been initialised rather than
     *      reverting, so the marketplace can safely compare uninitialised
     *      agents without a try/catch.
     */
    function getScore(
        uint256 agentId
    ) external view override returns (uint256) {
        return _reputations[agentId].score;
    }

    /// @inheritdoc IReputationEngine
    function getReputationData(
        uint256 agentId
    ) external view override returns (DataTypes.ReputationData memory) {
        return _reputations[agentId];
    }

    /**
     * @inheritdoc IReputationEngine
     *
     * @dev Returns 0 if the agent has never completed a successful task to
     *      avoid division-by-zero without reverting.
     */
    function getAverageResponseTimeMs(
        uint256 agentId
    ) external view override returns (uint256) {
        DataTypes.ReputationData storage rep = _reputations[agentId];
        if (rep.successfulTasks == 0) return 0;
        return rep.totalResponseTimeMs / rep.successfulTasks;
    }

    /**
     * @inheritdoc IReputationEngine
     *
     * @dev Returns the star rating as an explicit fraction so front-ends
     *      and other contracts can display it without hard-coding the
     *      denominator (200).
     *
     *      Usage example (JavaScript):
     *        const [num, den] = await reputationEngine.getStarRating(agentId);
     *        const stars = Number(num) / Number(den); // e.g. 4.90
     */
    function getStarRating(
        uint256 agentId
    ) external view override returns (uint256 numerator, uint256 denominator) {
        return (_reputations[agentId].score, STAR_DENOMINATOR);
    }

    // =========================================================================
    // CONVENIENCE READ FUNCTIONS (not in interface — for dashboards / tests)
    // =========================================================================

    /**
     * @notice Returns whether an agent has been initialised in this engine.
     * @param agentId  The agent to check.
     * @return True if initializeAgent() has been called for this agentId.
     */
    function isInitialized(uint256 agentId) external view returns (bool) {
        return _reputations[agentId].lastUpdated != 0;
    }

    /**
     * @notice Returns the success rate of an agent as a basis-point value
     *         (0 – 10_000, where 10_000 = 100.00%).
     *         Returns 0 if the agent has no completed tasks.
     *
     * @param agentId  The agent to query.
     * @return bps     Success rate in basis points.
     */
    function getSuccessRateBps(
        uint256 agentId
    ) external view returns (uint256 bps) {
        DataTypes.ReputationData storage rep = _reputations[agentId];
        if (rep.totalTasks == 0) return 0;
        return (rep.successfulTasks * 10_000) / rep.totalTasks;
    }

    /**
     * @notice Simulates what the agent's score WOULD BE after one more success
     *         without writing to state. Useful for front-end "projected score"
     *         displays.
     *
     * @param agentId  The agent to simulate for.
     * @return         Projected score after one successful task.
     */
    function simulateSuccess(uint256 agentId) external view returns (uint256) {
        uint256 current = _reputations[agentId].score;
        uint256 projected = (EMA_ALPHA *
            MAX_SCORE +
            (EMA_DENOMINATOR - EMA_ALPHA) *
            current) / EMA_DENOMINATOR;
        return projected > MAX_SCORE ? MAX_SCORE : projected;
    }

    /**
     * @notice Simulates what the agent's score WOULD BE after one more failure
     *         without writing to state.
     *
     * @param agentId  The agent to simulate for.
     * @return         Projected score after one failed task.
     */
    function simulateFailure(uint256 agentId) external view returns (uint256) {
        uint256 current = _reputations[agentId].score;
        return ((EMA_DENOMINATOR - EMA_ALPHA) * current) / EMA_DENOMINATOR;
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /**
     * @dev Returns a storage pointer to the ReputationData for `agentId`,
     *      reverting with AgentNotInitialized if the record does not exist.
     *
     * @param agentId  The agent whose record to retrieve.
     * @return rep     Storage reference to the agent's ReputationData.
     */
    function _requireInitialized(
        uint256 agentId
    ) internal view returns (DataTypes.ReputationData storage rep) {
        rep = _reputations[agentId];
        if (rep.lastUpdated == 0) revert AgentNotInitialized(agentId);
    }
}
