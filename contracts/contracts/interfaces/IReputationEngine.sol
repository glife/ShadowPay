// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/DataTypes.sol";

/**
 * @title IReputationEngine
 * @author Hey Elsa & The AI Council
 * @notice Interface for the on-chain dynamic reputation scoring system.
 *
 *         Every provider agent starts at a neutral score (★2.50) and moves
 *         up or down via an Exponential Moving Average (EMA) as tasks are
 *         completed or failed. The score feeds directly into the Evaluation
 *         Engine inside AgentMarketplace to rank candidate providers.
 *
 *         Score scale  : 0 – 1000
 *         Star display : score / 200  →  ★0.00 – ★5.00
 *
 *         Only addresses holding MARKETPLACE_ROLE may mutate state, ensuring
 *         reputation cannot be manipulated outside the marketplace lifecycle.
 */
interface IReputationEngine {
    // =========================================================================
    // EVENTS
    // =========================================================================

    /**
     * @notice Emitted when a new agent's reputation record is created.
     * @param agentId  The newly initialised provider agent ID.
     */
    event AgentInitialized(uint256 indexed agentId);

    /**
     * @notice Emitted whenever an agent's dynamic score changes.
     * @param agentId    The provider agent whose score was updated.
     * @param newScore   The updated score in the range 0 – 1000.
     * @param wasSuccess True if the update was triggered by a successful task,
     *                   false if triggered by a failure.
     */
    event ScoreUpdated(
        uint256 indexed agentId,
        uint256 newScore,
        bool wasSuccess
    );

    // =========================================================================
    // MUTATING FUNCTIONS
    // =========================================================================

    /**
     * @notice Initialise a fresh reputation record for a newly registered agent.
     *         Sets the starting score to the neutral midpoint (500 = ★2.50).
     *         Must be called by the marketplace immediately after agent registration.
     *
     * @param agentId  ID of the agent to initialise.
     *
     * Requirements:
     * - Caller must hold MARKETPLACE_ROLE.
     * - agentId must not have been previously initialised.
     */
    function initializeAgent(uint256 agentId) external;

    /**
     * @notice Record a successful task completion and push the score upward.
     *         Applies the EMA formula: newScore = α×1000 + (1−α)×oldScore
     *         and appends responseTimeMs to the cumulative speed tracker.
     *
     * @param agentId        ID of the agent that completed the task.
     * @param responseTimeMs Measured wall-clock execution time for this task
     *                       in milliseconds. Used to update the rolling average
     *                       speed metric in the AgentRegistry.
     *
     * Requirements:
     * - Caller must hold MARKETPLACE_ROLE.
     * - agentId must have been previously initialised.
     */
    function recordSuccess(uint256 agentId, uint256 responseTimeMs) external;

    /**
     * @notice Record a failed task and push the score downward.
     *         Applies the EMA formula: newScore = (1−α)×oldScore
     *         (equivalent to treating the failed task as a 0-point result).
     *
     * @param agentId  ID of the agent that failed the task.
     *
     * Requirements:
     * - Caller must hold MARKETPLACE_ROLE.
     * - agentId must have been previously initialised.
     */
    function recordFailure(uint256 agentId) external;

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /**
     * @notice Returns the current dynamic score for an agent (0 – 1000).
     *         Divide by 200 to obtain the ★ star rating (e.g. 980 → ★4.90).
     *
     * @param agentId  ID of the agent to query.
     * @return score   Current EMA score in the range 0 – 1000.
     */
    function getScore(uint256 agentId) external view returns (uint256 score);

    /**
     * @notice Returns the full reputation snapshot for an agent.
     *
     * @param agentId  ID of the agent to query.
     * @return data    ReputationData struct containing task counts, cumulative
     *                 response time, current score, and last-updated timestamp.
     */
    function getReputationData(
        uint256 agentId
    ) external view returns (DataTypes.ReputationData memory data);

    /**
     * @notice Returns the average execution time across all successful tasks.
     *         Returns 0 if the agent has no successful completions yet.
     *
     * @param agentId       ID of the agent to query.
     * @return avgSpeedMs   Average response time in milliseconds.
     */
    function getAverageResponseTimeMs(
        uint256 agentId
    ) external view returns (uint256 avgSpeedMs);

    /**
     * @notice Returns the star rating as a fraction (numerator / denominator).
     *         Caller divides to obtain the display value.
     *         e.g. (980, 200) → 980 / 200 = ★4.90
     *
     * @param agentId      ID of the agent to query.
     * @return numerator   The raw score (0 – 1000).
     * @return denominator Always 200. Kept explicit for front-end convenience.
     */
    function getStarRating(
        uint256 agentId
    ) external view returns (uint256 numerator, uint256 denominator);
}
