// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title DataTypes
 * @author Hey Elsa & The AI Council
 * @notice Central library containing all shared enums, structs, and type
 *         definitions used across the Hey Elsa Agent Marketplace system.
 *
 *         Architecture overview:
 *         ┌──────────────────────────────────────────────────────────┐
 *         │  Tier 3: ElsaOrchestrator  →  posts Tasks               │
 *         │  Tier 4: AgentMarketplace  →  selects Provider Agents    │
 *         │          ReputationEngine  →  scores Agents dynamically  │
 *         │          TaskEscrow        →  holds & releases payment   │
 *         │  Tier 5: Web2Oracle        →  verifies off-chain proofs  │
 *         └──────────────────────────────────────────────────────────┘
 */
library DataTypes {
    // =========================================================================
    // ENUMS
    // =========================================================================

    /**
     * @notice Execution pathway for a provider agent.
     * @param CRYPTO  On-chain execution — DEX swaps, DeFi interactions,
     *                transaction signing & broadcast via blockchain.
     * @param WEB2    Off-chain execution — Gmail, Notion, Slack API calls,
     *                PDF/newsletter generation, external data fetching.
     */
    enum AgentCategory {
        CRYPTO,
        WEB2
    }

    /**
     * @notice Lifecycle states of a Task from creation to resolution.
     * @param OPEN       Task posted by Hey Elsa, awaiting agent selection.
     * @param ASSIGNED   Best-scoring agent selected; execution in progress.
     * @param COMPLETED  Task executed successfully and verified.
     * @param FAILED     Execution failed; funds will be refunded.
     * @param CANCELLED  Cancelled by the requester before assignment.
     */
    enum TaskStatus {
        OPEN,
        ASSIGNED,
        COMPLETED,
        FAILED,
        CANCELLED
    }

    /**
     * @notice State of an escrow payment entry.
     * @param LOCKED    Funds are held pending task execution.
     * @param RELEASED  Funds paid out to the provider agent owner.
     * @param REFUNDED  Funds returned to the original depositor.
     */
    enum EscrowStatus {
        LOCKED,
        RELEASED,
        REFUNDED
    }

    // =========================================================================
    // STRUCTS
    // =========================================================================

    /**
     * @notice Represents a registered third-party provider agent.
     *
     * @param id            Auto-incremented unique identifier assigned at
     *                      registration (starts at 1).
     * @param owner         Wallet address of the developer who deployed and
     *                      registered this agent.
     * @param name          Human-readable display name shown in the marketplace
     *                      UI (e.g., "DEX Swap Bot", "Newsletter Gen").
     * @param agentType     Task-type key used to match against Task.taskType
     *                      (e.g., "DEX_SWAP", "YIELD_FARM", "NEWSLETTER_GEN",
     *                      "PDF_REPORT", "SMART_AUDIT").
     * @param category      CRYPTO for on-chain agents, WEB2 for off-chain agents.
     * @param costPerTask   Payment required per task execution, denominated
     *                      in wei. Must be <= Task.maxBudget to be eligible.
     * @param avgSpeedMs    Rolling average execution time in milliseconds.
     *                      Self-reported on registration; updated on-chain
     *                      after each completed task.
     * @param isActive      Whether the agent is currently accepting new tasks.
     *                      Owners can toggle this without losing reputation.
     * @param registeredAt  Block timestamp of initial registration. Used as
     *                      existence check (0 means not registered).
     */
    struct Agent {
        uint256 id;
        address owner;
        string name;
        string agentType;
        AgentCategory category;
        uint256 costPerTask;
        uint256 avgSpeedMs;
        bool isActive;
        uint256 registeredAt;
    }

    /**
     * @notice Represents a unit of work posted by Hey Elsa's orchestrator.
     *
     * @param id              Auto-incremented unique task identifier.
     * @param blueprintHash   keccak256 hash of the AI Council's Strategic
     *                        Blueprint JSON payload. Provides an immutable
     *                        on-chain fingerprint of the instruction set.
     * @param taskType        Must match an Agent.agentType in the registry
     *                        (e.g., "DEX_SWAP"). Used by the marketplace to
     *                        filter eligible providers.
     * @param category        CRYPTO or WEB2 — determines execution pathway
     *                        and whether a Web2Oracle proof is required.
     * @param requester       Address of the ElsaOrchestrator that posted
     *                        this task. Receives refunds on failure.
     * @param selectedAgentId ID of the winning provider agent after the
     *                        evaluation engine runs. 0 while still OPEN.
     * @param maxBudget       Maximum wei the requester will pay. Agents
     *                        whose costPerTask exceeds this are skipped.
     * @param status          Current lifecycle stage of the task.
     * @param createdAt       Block timestamp when the task was posted.
     * @param completedAt     Block timestamp when the task reached a terminal
     *                        state (COMPLETED / FAILED / CANCELLED).
     * @param proofHash       keccak256 of the execution proof. For CRYPTO tasks
     *                        this is the tx hash; for WEB2 tasks this is the
     *                        TLSNotary / API receipt hash submitted by the oracle.
     */
    struct Task {
        uint256 id;
        bytes32 blueprintHash;
        string taskType;
        AgentCategory category;
        address requester;
        uint256 selectedAgentId;
        uint256 maxBudget;
        TaskStatus status;
        uint256 createdAt;
        uint256 completedAt;
        bytes32 proofHash;
    }

    /**
     * @notice On-chain reputation snapshot for a provider agent.
     *
     *  Score scale: 0 – 1000
     *  Display as: score / 200  →  ★0.0 – ★5.0
     *  e.g., score = 980  →  ★4.90
     *        score = 500  →  ★2.50  (neutral starting point)
     *        score = 100  →  ★0.50
     *
     *  Scoring algorithm (Exponential Moving Average):
     *    success → newScore = (α × 1000 + (1−α) × oldScore)
     *    failure → newScore = (           (1−α) × oldScore)
     *    where α = 0.20 (20% weight on the most recent outcome)
     *
     * @param totalTasks           Cumulative tasks ever assigned to this agent.
     * @param successfulTasks      Subset that reached COMPLETED status.
     * @param failedTasks          Subset that reached FAILED status.
     * @param totalResponseTimeMs  Sum of all per-task execution times in ms.
     *                             Divide by successfulTasks for the average.
     * @param score                Current dynamic score (0 – 1000).
     * @param lastUpdated          Block timestamp of the most recent score update.
     */
    struct ReputationData {
        uint256 totalTasks;
        uint256 successfulTasks;
        uint256 failedTasks;
        uint256 totalResponseTimeMs;
        uint256 score;
        uint256 lastUpdated;
    }

    /**
     * @notice Escrow record that locks payment for a specific task.
     *
     * @param taskId    Corresponding Task.id.
     * @param agentId   Provider agent assigned to service this escrow.
     *                  May be 0 for the brief window between task posting
     *                  and agent selection.
     * @param depositor Address that deposited funds (the ElsaOrchestrator).
     *                  This address receives the refund on FAILED/CANCELLED.
     * @param amount    Exact wei locked in this escrow entry.
     * @param status    LOCKED → RELEASED (success) or REFUNDED (failure).
     * @param lockedAt  Block timestamp when the funds were first locked.
     *                  Also used as an existence check (0 means no escrow).
     */
    struct EscrowEntry {
        uint256 taskId;
        uint256 agentId;
        address depositor;
        uint256 amount;
        EscrowStatus status;
        uint256 lockedAt;
    }

    /**
     * @notice Result of the Evaluation Engine scoring a candidate provider.
     *
     *  Composite score formula (0 – 1000 total):
     *    reputation_component = repScore × 1          [0 – 500 pts, weight 50%]
     *    cost_component       = (1 − cost/maxBudget)
     *                           × 300                 [0 – 300 pts, weight 30%]
     *    speed_component      = (1 − speed/MAX_SPEED)
     *                           × 200                 [0 – 200 pts, weight 20%]
     *
     * @param agentId         Provider agent being evaluated.
     * @param compositeScore  Weighted composite score 0 – 1000.
     */
    struct ProviderScore {
        uint256 agentId;
        uint256 compositeScore;
    }

    /**
     * @notice Web2 proof-of-execution record submitted by the oracle operator.
     *
     *  Because a smart contract cannot natively verify that an email was sent
     *  or a report was written, the Web2Oracle acts as a bridge:
     *    1. Web2 agent completes the off-chain task.
     *    2. Agent generates a cryptographic proof (TLSNotary / API receipt).
     *    3. Authorised oracle operator calls submitProof().
     *    4. Oracle operator calls verifyAndReport() after validation.
     *    5. ReputationEngine is updated; escrow is released.
     *
     * @param taskId       Corresponding Task.id.
     * @param proofHash    keccak256 of the raw proof data (stored off-chain /
     *                     on IPFS; only the hash is anchored on-chain).
     * @param submitter    Address of the oracle operator who submitted the proof.
     * @param verified     True once verifyAndReport() has been successfully called.
     * @param submittedAt  Block timestamp of proof submission.
     * @param verifiedAt   Block timestamp of oracle verification (0 if pending).
     */
    struct ExecutionProof {
        uint256 taskId;
        bytes32 proofHash;
        address submitter;
        bool verified;
        uint256 submittedAt;
        uint256 verifiedAt;
    }
}
