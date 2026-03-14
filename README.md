# ShadowPay

**Hey Elsa & The AI Council — On-Chain Agent Marketplace**

A decentralized smart contract system that connects AI-generated strategic blueprints with a permissionless marketplace of provider agents. Users express natural language intent → an AI Council produces a strategic blueprint → an on-chain orchestrator posts the task → an evaluation engine selects the best provider → execution completes on-chain (CRYPTO) or off-chain via oracle verification (WEB2).

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│  Tier 1  │  User submits natural language intent                 │
├──────────┼───────────────────────────────────────────────────────┤
│  Tier 2  │  AI Council produces Strategic Blueprint (JSON)       │
├──────────┼───────────────────────────────────────────────────────┤
│  Tier 3  │  ElsaOrchestrator — secure middleware broker          │
│          │  Validates, decodes, and forwards blueprints on-chain │
├──────────┼───────────────────────────────────────────────────────┤
│  Tier 4  │  AgentMarketplace — evaluation engine & task hub      │
│          │  AgentRegistry    — provider agent registry           │
│          │  ReputationEngine — EMA-based dynamic scoring         │
│          │  TaskEscrow       — ETH payment escrow vault          │
├──────────┼───────────────────────────────────────────────────────┤
│  Tier 5  │  Web2Oracle — off-chain proof verification bridge     │
│          │  Provider Agents — execute CRYPTO / WEB2 tasks        │
└──────────┴───────────────────────────────────────────────────────┘
```

---

## Smart Contracts (Implemented & Tested ✅)

All 6 contracts compiled and verified with **130 passing tests**.

### 1. AgentRegistry

> Permissionless registry where third-party developers register their AI execution agents.

- **Register agents** with name, type, category (CRYPTO/WEB2), cost, and speed
- **`registerAgentFor()`** — marketplace gateway that correctly forwards the developer's wallet as agent owner
- **Activate / deactivate** agents without losing reputation history
- **Update pricing** — owners can adjust `costPerTask` in real-time
- **Rolling speed updates** — `updateSpeed()` called by marketplace after each task completion
- **Query helpers** — `getActiveAgentsByType()`, `getAgentsByOwner()`, `isAgentActive()`

### 2. ReputationEngine

> On-chain dynamic reputation scoring using Exponential Moving Average (EMA).

- **Score scale**: 0–1000 → ★0.00 – ★5.00 (divide by 200)
- **Neutral start**: every new agent begins at 500 (★2.50)
- **EMA formula** (α = 20%):
  - Success: `newScore = 0.20 × 1000 + 0.80 × oldScore`
  - Failure: `newScore = 0.80 × oldScore`
- **Asymmetric design**: success pulls harder than failure — protects against transient infra issues
- **Simulation helpers**: `simulateSuccess()` / `simulateFailure()` — read-only projected scores
- **Metrics**: success rate (bps), average response time, task counters

### 3. TaskEscrow

> Secure ETH payment vault with a strict one-way state machine.

```
         lockFunds()
         ┌─────────┐
         │  LOCKED  │
         └────┬─────┘
    ┌─────────┴──────────┐
releaseFunds()       refundFunds()
    │                    │
┌───▼─────┐        ┌────▼──────┐
│RELEASED │        │ REFUNDED  │
└─────────┘        └───────────┘
```

- **Lock** — holds ETH at task creation
- **Release** — pays provider agent owner on successful completion
- **Refund** — returns funds to depositor on failure/cancellation
- **ReentrancyGuard** + Checks-Effects-Interactions on all ETH transfers
- Rejects direct ETH sends (must go through `lockFunds()`)

### 4. AgentMarketplace

> The core Smart Contract Hub with a built-in Evaluation Engine.

**Evaluation Engine** — weighted composite scoring (0–1000):

| Factor     | Weight | Formula                            |
|------------|--------|------------------------------------|
| Reputation | 50%    | `repScore × 1`                     |
| Cost       | 30%    | `(1 − cost/maxBudget) × 300`       |
| Speed      | 20%    | `(1 − speed/MAX_SPEED) × 200`      |

**Task lifecycle**:
- `postTask()` — creates task + auto-selects best agent (OPEN → ASSIGNED)
- `completeTask()` — verifies caller ownership, updates reputation, releases escrow
- `failTask()` — records failure, refunds escrow (supports agent owner, admin, and oracle callers)
- `cancelTask()` — OPEN tasks only, full refund
- `queryProviders()` — public scoring preview for any task type

**Agent registration gateway**:
- `registerProviderAgent()` — calls `registerAgentFor(msg.sender, ...)` to correctly forward the developer's address as agent owner

**Access control roles**: `ELSA_ROLE` (orchestrator), `ORACLE_ROLE` (Web2Oracle), `DEFAULT_ADMIN_ROLE`

### 5. Web2Oracle

> Bridge between off-chain task execution and the on-chain reputation economy.

**Proof lifecycle**:
```
(no proof) → submitProof() → SUBMITTED → verifyAndReport() → VERIFIED
                                       → rejectProof()     → REJECTED
```

- **Proof integrity**: on-chain `keccak256` recomputation ensures declared hash matches supplied bytes
- **TLSNotary support**: raw proof bytes emitted in `ProofDataAnchored` event for off-chain auditors
- **Oracle feedback loop**:
  1. Agent executes off-chain task (e.g., Notion API call)
  2. Agent generates cryptographic proof (TLSNotary/API receipt)
  3. Oracle operator submits + verifies proof on-chain
  4. Marketplace marks task COMPLETED/FAILED → reputation updated → escrow resolved
- **Operator management**: `setOracleOperator()` for key rotation without redeployment

### 6. ElsaOrchestrator

> Hey Elsa's secure on-chain identity — the Tier 3 Middleware Orchestrator.

- **Blueprint execution**: translates AI Council decisions into marketplace tasks
- **Deduplication**: same `blueprintHash` cannot be executed twice
- **MPC wallet integration**: sequential nonce-based audit trail via `SignedTransaction` events
- **Budget enforcement**: per-execution cap (configurable, hard ceiling at 10 ETH)
- **Emergency pause**: `PAUSER_ROLE` can halt all outbound task posting without blocking ongoing completions
- **Cancel support**: cancel OPEN tasks and reclaim escrowed funds
- **Preview providers**: `previewProviders()` delegates to marketplace evaluation engine
- **Fund management**: receives refunds via `receive()`, admin can `withdrawFunds()`

### Shared Library — DataTypes

Central type definitions used across all contracts:
- **Enums**: `AgentCategory` (CRYPTO/WEB2), `TaskStatus`, `EscrowStatus`
- **Structs**: `Agent`, `Task`, `ReputationData`, `EscrowEntry`, `ProviderScore`, `ExecutionProof`

---

## Backend (Scaffolded)

A Next.js API route at `/api/heyElsa` is scaffolded with:
- HeyElsa SDK client initialization
- Placeholder hooks for LLM negotiator and blockchain interaction
- Returns mock task state for frontend rendering

> **Status**: Scaffolded — not yet connected to the deployed contracts.

---

## Project Structure

```
ShadowPay/
├── contracts/                   # Hardhat smart contract workspace
│   ├── contracts/
│   │   ├── core/
│   │   │   ├── AgentRegistry.sol
│   │   │   ├── AgentMarketplace.sol
│   │   │   ├── ReputationEngine.sol
│   │   │   └── TaskEscrow.sol
│   │   ├── orchestrator/
│   │   │   └── ElsaOrchestrator.sol
│   │   ├── oracles/
│   │   │   └── Web2Oracle.sol
│   │   ├── interfaces/          # Solidity interfaces for all contracts
│   │   └── libraries/
│   │       └── DataTypes.sol    # Shared enums, structs, types
│   ├── test/
│   │   └── AgentMarketplace.test.ts   # 130 tests covering all contracts
│   ├── scripts/
│   │   └── deploy.ts           # Full 6-step deployment with role wiring
│   ├── hardhat.config.ts
│   ├── package.json
│   └── .env.example            # All environment variables documented
└── backend/                     # Next.js backend (scaffolded)
    └── src/
        ├── app/api/heyElsa/route.ts
        └── services/heyElsaClient.ts
```

---

## Getting Started

### Prerequisites

- Node.js (v18–v22 recommended)
- npm or yarn

### Install Dependencies

```bash
cd contracts
npm install
```

### Compile Contracts

```bash
npm run compile
```

### Run Tests

```bash
npm test
```

Expected output: **130 passing**

### Deploy (Local)

```bash
# Start a local Hardhat node
npx hardhat node

# In another terminal
npm run deploy:local
```

### Deploy (Sepolia Testnet)

1. Copy `.env.example` → `.env` and fill in your values
2. Run:
```bash
npm run deploy:sepolia
```

The deploy script:
1. Deploys all 6 contracts in dependency order
2. Wires all access control roles (`MARKETPLACE_ROLE`, `ELSA_ROLE`, `ORACLE_ROLE`, etc.)
3. Runs post-deployment verification checks
4. Saves deployment addresses to `deployments/<network>.json`
5. Submits contracts for block explorer verification (live networks)

---

## Test Coverage

130 tests organized into 7 sections:

| Section | Tests | Description |
|---------|-------|-------------|
| §1 AgentRegistry | 16 | Registration, activation, speed updates, access control |
| §2 ReputationEngine | 12 | EMA scoring, success/failure recording, simulation |
| §3 TaskEscrow | 10 | Lock/release/refund lifecycle, security guards |
| §4 AgentMarketplace | 17 | Evaluation engine, task lifecycle, cancellation |
| §5 Web2Oracle | 13 | Proof submission, verification, rejection |
| §6 ElsaOrchestrator | 18 | Blueprint execution, deduplication, budget caps, pause |
| §7 End-to-End | 14 | Full CRYPTO + WEB2 workflows across all contracts |

### Run with Gas Reporting

```bash
npm run test:gas
```

---

## Environment Variables

See [`.env.example`](contracts/.env.example) for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `DEPLOYER_PRIVATE_KEY` | Deployer/admin wallet private key |
| `ELSA_SIGNER_ADDRESS` | MPC co-signer for ElsaOrchestrator |
| `ORACLE_OPERATOR_ADDRESS` | Trusted oracle node address |
| `SEPOLIA_RPC_URL` | Sepolia testnet RPC endpoint |
| `ETHERSCAN_API_KEY` | For contract verification |
| `INITIAL_BUDGET_CAP_WEI` | Per-execution budget cap (default: 0.1 ETH) |

---

## Access Control Summary

```
ElsaOrchestrator
  ├── ELSA_SIGNER_ROLE    → backend / MPC co-signers
  └── PAUSER_ROLE         → emergency pause operators

AgentMarketplace
  ├── ELSA_ROLE           → ElsaOrchestrator (postTask, cancelTask)
  ├── ORACLE_ROLE         → Web2Oracle (completeTask, failTask for WEB2)
  └── DEFAULT_ADMIN_ROLE  → deployer multisig

ReputationEngine
  └── MARKETPLACE_ROLE    → AgentMarketplace

TaskEscrow
  └── MARKETPLACE_ROLE    → AgentMarketplace

Web2Oracle
  └── ORACLE_OPERATOR_ROLE → trusted oracle nodes

AgentRegistry
  └── marketplace (address) → AgentMarketplace (updateSpeed, registerAgentFor)
```

---

## Tech Stack

- **Solidity** ^0.8.20
- **Hardhat** — development framework
- **OpenZeppelin** — AccessControl, ReentrancyGuard, Pausable
- **TypeChain** — TypeScript contract bindings
- **Ethers.js** v6
- **Chai** + **Hardhat Chai Matchers** — testing
- **Next.js** — backend API (scaffolded)

---

## License

MIT
