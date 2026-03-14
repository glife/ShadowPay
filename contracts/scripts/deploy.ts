import { ethers, network, run } from "hardhat";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config();

// =============================================================================
// TYPES
// =============================================================================

interface DeployedAddresses {
  network: string;
  chainId: number;
  deployedAt: string;
  deployer: string;
  contracts: {
    AgentRegistry: string;
    ReputationEngine: string;
    TaskEscrow: string;
    AgentMarketplace: string;
    Web2Oracle: string;
    ElsaOrchestrator: string;
  };
  roles: {
    elsaSigner: string;
    oracleOperator: string;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Prints a formatted section header to the console.
 */
function section(title: string): void {
  const line = "─".repeat(60);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(`${line}`);
}

/**
 * Prints a labelled address line.
 */
function log(label: string, address: string): void {
  console.log(`  ✓  ${label.padEnd(28)} ${address}`);
}

/**
 * Waits for a specified number of block confirmations.
 * On a local Hardhat node this resolves immediately.
 */
async function waitForConfirmations(
  tx: { wait: (n?: number) => Promise<unknown> },
  confirmations: number
): Promise<void> {
  const isLocal =
    network.name === "hardhat" || network.name === "localhost";
  await tx.wait(isLocal ? 1 : confirmations);
}

/**
 * Attempts to verify a contract on Etherscan / the configured block explorer.
 * Silently skips on local networks where verification is not applicable.
 *
 * @param address          Deployed contract address.
 * @param constructorArgs  ABI-encoded constructor arguments.
 */
async function verifyContract(
  address: string,
  constructorArgs: unknown[]
): Promise<void> {
  if (network.name === "hardhat" || network.name === "localhost") {
    return; // Nothing to verify on local networks
  }

  console.log(`     ↳ Verifying ${address} on block explorer…`);
  try {
    await run("verify:verify", {
      address,
      constructorArguments: constructorArgs,
    });
    console.log(`     ✓ Verified`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.toLowerCase().includes("already verified")) {
      console.log(`     ℹ Already verified`);
    } else {
      console.warn(`     ⚠ Verification failed: ${message}`);
    }
  }
}

/**
 * Saves the deployed addresses to a JSON file under deployments/<network>.json.
 * Creates the deployments/ directory if it does not exist.
 */
function saveDeployment(data: DeployedAddresses): void {
  const dir = path.join(__dirname, "..", "deployments");
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const filePath = path.join(dir, `${data.network}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  console.log(`\n  📄 Deployment saved to: deployments/${data.network}.json`);
}

// =============================================================================
// MAIN DEPLOYMENT SCRIPT
// =============================================================================

async function main(): Promise<void> {
  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(  "║   Hey Elsa & The AI Council — Contract Deployment        ║");
  console.log(  "╚══════════════════════════════════════════════════════════╝");

  // ── Signers & network context ──────────────────────────────────────────────
  const [deployer] = await ethers.getSigners();
  const { chainId } = await ethers.provider.getNetwork();
  const networkName = network.name;

  console.log(`\n  Network  : ${networkName} (chainId: ${chainId})`);
  console.log(`  Deployer : ${deployer.address}`);
  console.log(
    `  Balance  : ${ethers.formatEther(
      await ethers.provider.getBalance(deployer.address)
    )} ETH`
  );

  // ── Deployment parameters ──────────────────────────────────────────────────

  // Address that will receive admin roles on all contracts.
  // In production this should be a multisig (e.g. Safe), not a hot wallet.
  const adminAddress = deployer.address;

  // Address to grant ELSA_SIGNER_ROLE on ElsaOrchestrator.
  // Falls back to deployer for local / test deployments.
  const elsaSignerAddress =
    process.env.ELSA_SIGNER_ADDRESS && process.env.ELSA_SIGNER_ADDRESS !== "0xYourElsaSignerAddressHere"
      ? process.env.ELSA_SIGNER_ADDRESS
      : deployer.address;

  // Address to grant ORACLE_OPERATOR_ROLE on Web2Oracle.
  // Falls back to deployer for local / test deployments.
  const oracleOperatorAddress =
    process.env.ORACLE_OPERATOR_ADDRESS && process.env.ORACLE_OPERATOR_ADDRESS !== "0xYourOracleOperatorAddressHere"
      ? process.env.ORACLE_OPERATOR_ADDRESS
      : deployer.address;

  // Initial per-execution budget cap for ElsaOrchestrator (wei).
  // Default: 0.1 ETH. Adjust via INITIAL_BUDGET_CAP_WEI in .env.
  const initialBudgetCap =
    process.env.INITIAL_BUDGET_CAP_WEI
      ? BigInt(process.env.INITIAL_BUDGET_CAP_WEI)
      : ethers.parseEther("0.1");

  // Number of block confirmations to wait per deployment tx on live networks.
  const CONFIRMATIONS = networkName === "hardhat" || networkName === "localhost" ? 1 : 2;

  console.log(`\n  Admin address      : ${adminAddress}`);
  console.log(`  Elsa signer        : ${elsaSignerAddress}`);
  console.log(`  Oracle operator    : ${oracleOperatorAddress}`);
  console.log(`  Initial budget cap : ${ethers.formatEther(initialBudgetCap)} ETH`);
  console.log(`  Confirmations      : ${CONFIRMATIONS}`);

  // ============================================================================
  // STEP 1 — Deploy AgentRegistry
  // ============================================================================
  section("Step 1 / 6 — AgentRegistry");
  console.log("  Deploying permissionless provider agent registry…");

  const AgentRegistryFactory = await ethers.getContractFactory("AgentRegistry");
  const agentRegistry = await AgentRegistryFactory.deploy(adminAddress);
  await waitForConfirmations(agentRegistry.deploymentTransaction()!, CONFIRMATIONS);

  const agentRegistryAddress = await agentRegistry.getAddress();
  log("AgentRegistry", agentRegistryAddress);

  // ============================================================================
  // STEP 2 — Deploy ReputationEngine
  // ============================================================================
  section("Step 2 / 6 — ReputationEngine");
  console.log("  Deploying EMA reputation scoring engine…");

  const ReputationEngineFactory = await ethers.getContractFactory("ReputationEngine");
  const reputationEngine = await ReputationEngineFactory.deploy(adminAddress);
  await waitForConfirmations(reputationEngine.deploymentTransaction()!, CONFIRMATIONS);

  const reputationEngineAddress = await reputationEngine.getAddress();
  log("ReputationEngine", reputationEngineAddress);

  console.log(`\n  Score constants:`);
  console.log(`    MAX_SCORE     : ${await reputationEngine.MAX_SCORE()}`);
  console.log(`    INITIAL_SCORE : ${await reputationEngine.INITIAL_SCORE()} (★2.50 neutral)`);
  console.log(`    EMA_ALPHA     : ${await reputationEngine.EMA_ALPHA()}%`);

  // ============================================================================
  // STEP 3 — Deploy TaskEscrow
  // ============================================================================
  section("Step 3 / 6 — TaskEscrow");
  console.log("  Deploying ETH payment escrow vault…");

  const TaskEscrowFactory = await ethers.getContractFactory("TaskEscrow");
  const taskEscrow = await TaskEscrowFactory.deploy(adminAddress);
  await waitForConfirmations(taskEscrow.deploymentTransaction()!, CONFIRMATIONS);

  const taskEscrowAddress = await taskEscrow.getAddress();
  log("TaskEscrow", taskEscrowAddress);

  // ============================================================================
  // STEP 4 — Deploy AgentMarketplace
  // ============================================================================
  section("Step 4 / 6 — AgentMarketplace");
  console.log("  Deploying the Smart Contract Hub (Evaluation Engine)…");

  const AgentMarketplaceFactory = await ethers.getContractFactory("AgentMarketplace");
  const agentMarketplace = await AgentMarketplaceFactory.deploy(
    adminAddress,
    agentRegistryAddress,
    reputationEngineAddress,
    taskEscrowAddress
  );
  await waitForConfirmations(agentMarketplace.deploymentTransaction()!, CONFIRMATIONS);

  const agentMarketplaceAddress = await agentMarketplace.getAddress();
  log("AgentMarketplace", agentMarketplaceAddress);

  console.log(`\n  Evaluation Engine weights:`);
  console.log(`    Reputation : ${await agentMarketplace.REP_WEIGHT()} / 1000  (50%)`);
  console.log(`    Cost       : ${await agentMarketplace.COST_WEIGHT()} / 1000  (30%)`);
  console.log(`    Speed      : ${await agentMarketplace.SPEED_WEIGHT()} / 1000  (20%)`);
  console.log(`    Speed ceil : ${(await agentMarketplace.SPEED_CEILING()).toString()} ms`);

  // ============================================================================
  // STEP 5 — Deploy Web2Oracle
  // ============================================================================
  section("Step 5 / 6 — Web2Oracle");
  console.log("  Deploying the Web2 Verification Oracle (Proof of Execution)…");

  const Web2OracleFactory = await ethers.getContractFactory("Web2Oracle");
  const web2Oracle = await Web2OracleFactory.deploy(
    adminAddress,
    agentMarketplaceAddress
  );
  await waitForConfirmations(web2Oracle.deploymentTransaction()!, CONFIRMATIONS);

  const web2OracleAddress = await web2Oracle.getAddress();
  log("Web2Oracle", web2OracleAddress);

  // ============================================================================
  // STEP 6 — Deploy ElsaOrchestrator
  // ============================================================================
  section("Step 6 / 6 — ElsaOrchestrator");
  console.log("  Deploying Hey Elsa's secure on-chain middleware orchestrator…");

  const ElsaOrchestratorFactory = await ethers.getContractFactory("ElsaOrchestrator");
  const elsaOrchestrator = await ElsaOrchestratorFactory.deploy(
    adminAddress,
    agentMarketplaceAddress,
    initialBudgetCap
  );
  await waitForConfirmations(elsaOrchestrator.deploymentTransaction()!, CONFIRMATIONS);

  const elsaOrchestratorAddress = await elsaOrchestrator.getAddress();
  log("ElsaOrchestrator", elsaOrchestratorAddress);

  console.log(`\n  Budget cap         : ${ethers.formatEther(await elsaOrchestrator.maxBudgetCap())} ETH`);
  console.log(`  Absolute max cap   : ${ethers.formatEther(await elsaOrchestrator.ABSOLUTE_MAX_BUDGET())} ETH`);

  // ============================================================================
  // ROLE WIRING
  // Principle of least privilege: each contract only gets the exact role it needs.
  // ============================================================================
  section("Role Wiring");
  console.log("  Configuring access control across all contracts…\n");

  // ── 4a. Grant MARKETPLACE_ROLE on ReputationEngine → AgentMarketplace ──────
  //        So the marketplace can call initializeAgent(), recordSuccess(),
  //        and recordFailure() when tasks are posted and resolved.
  const MARKETPLACE_ROLE_REP = await reputationEngine.MARKETPLACE_ROLE();
  const grantRepRole = await reputationEngine
    .connect(deployer)
    .grantRole(MARKETPLACE_ROLE_REP, agentMarketplaceAddress);
  await waitForConfirmations(grantRepRole, CONFIRMATIONS);
  log("MARKETPLACE_ROLE → ReputationEngine", agentMarketplaceAddress);

  // ── 4b. Grant MARKETPLACE_ROLE on TaskEscrow → AgentMarketplace ─────────────
  //        So the marketplace can call lockFunds(), assignAgent(),
  //        releaseFunds(), and refundFunds() during the task lifecycle.
  const MARKETPLACE_ROLE_ESC = await taskEscrow.MARKETPLACE_ROLE();
  const grantEscRole = await taskEscrow
    .connect(deployer)
    .grantRole(MARKETPLACE_ROLE_ESC, agentMarketplaceAddress);
  await waitForConfirmations(grantEscRole, CONFIRMATIONS);
  log("MARKETPLACE_ROLE → TaskEscrow", agentMarketplaceAddress);

  // ── 4c. Set marketplace address on AgentRegistry ────────────────────────────
  //        So the marketplace can call updateSpeed() after task completions
  //        to keep the on-chain avgSpeedMs metric current.
  const setMarketplaceTx = await agentRegistry
    .connect(deployer)
    .setMarketplace(agentMarketplaceAddress);
  await waitForConfirmations(setMarketplaceTx, CONFIRMATIONS);
  log("registry.marketplace →", agentMarketplaceAddress);

  // ── 4d. Grant ELSA_ROLE on AgentMarketplace → ElsaOrchestrator ──────────────
  //        So ElsaOrchestrator can call postTask() and cancelTask().
  //        This is the ONLY address permitted to submit tasks from Tier 3.
  const ELSA_ROLE = await agentMarketplace.ELSA_ROLE();
  const grantElsaRole = await agentMarketplace
    .connect(deployer)
    .grantRole(ELSA_ROLE, elsaOrchestratorAddress);
  await waitForConfirmations(grantElsaRole, CONFIRMATIONS);
  log("ELSA_ROLE → AgentMarketplace", elsaOrchestratorAddress);

  // ── 4e. Grant ORACLE_ROLE on AgentMarketplace → Web2Oracle ──────────────────
  //        So the Web2Oracle can call completeTask() for WEB2-category tasks
  //        after verifying the cryptographic proof of execution.
  const ORACLE_ROLE = await agentMarketplace.ORACLE_ROLE();
  const grantOracleRole = await agentMarketplace
    .connect(deployer)
    .grantRole(ORACLE_ROLE, web2OracleAddress);
  await waitForConfirmations(grantOracleRole, CONFIRMATIONS);
  log("ORACLE_ROLE → AgentMarketplace", web2OracleAddress);

  // ── 4f. Grant ELSA_SIGNER_ROLE on ElsaOrchestrator → Elsa backend ────────────
  //        The Elsa backend / MPC co-signer wallet that calls executeBlueprint().
  const ELSA_SIGNER_ROLE = await elsaOrchestrator.ELSA_SIGNER_ROLE();
  const grantSignerRole = await elsaOrchestrator
    .connect(deployer)
    .grantRole(ELSA_SIGNER_ROLE, elsaSignerAddress);
  await waitForConfirmations(grantSignerRole, CONFIRMATIONS);
  log("ELSA_SIGNER_ROLE → ElsaOrchestrator", elsaSignerAddress);

  // ── 4g. Grant ORACLE_OPERATOR_ROLE on Web2Oracle → oracle node ───────────────
  //        The trusted oracle node that calls submitProof() and verifyAndReport().
  const grantOperatorRole = await web2Oracle
    .connect(deployer)
    .setOracleOperator(oracleOperatorAddress, true);
  await waitForConfirmations(grantOperatorRole, CONFIRMATIONS);
  log("ORACLE_OPERATOR_ROLE → Web2Oracle", oracleOperatorAddress);

  // ── 4h. Grant PAUSER_ROLE on ElsaOrchestrator → admin ────────────────────────
  //        Already granted to admin in the constructor, but log it for clarity.
  const PAUSER_ROLE = await elsaOrchestrator.PAUSER_ROLE();
  const hasPauserRole = await elsaOrchestrator.hasRole(PAUSER_ROLE, adminAddress);
  console.log(
    `  ${hasPauserRole ? "✓" : "✗"}  ${"PAUSER_ROLE (admin)".padEnd(28)} ${adminAddress}`
  );

  // ============================================================================
  // VERIFICATION — Sanity check deployed state
  // ============================================================================
  section("Deployment Verification");
  console.log("  Checking contract state post-wiring…\n");

  const checks: Array<{ label: string; pass: boolean; detail?: string }> = [];

  // Registry marketplace pointer
  const registryMarketplace = await agentRegistry.marketplace();
  checks.push({
    label: "registry.marketplace set",
    pass: registryMarketplace === agentMarketplaceAddress,
    detail: registryMarketplace,
  });

  // ReputationEngine roles
  const repHasMarketplace = await reputationEngine.hasRole(
    MARKETPLACE_ROLE_REP,
    agentMarketplaceAddress
  );
  checks.push({
    label: "RepEngine: MARKETPLACE_ROLE",
    pass: repHasMarketplace,
  });

  // TaskEscrow roles
  const escrowHasMarketplace = await taskEscrow.hasRole(
    MARKETPLACE_ROLE_ESC,
    agentMarketplaceAddress
  );
  checks.push({
    label: "TaskEscrow: MARKETPLACE_ROLE",
    pass: escrowHasMarketplace,
  });

  // Marketplace roles
  const marketplaceHasElsa = await agentMarketplace.hasRole(
    ELSA_ROLE,
    elsaOrchestratorAddress
  );
  checks.push({
    label: "Marketplace: ELSA_ROLE",
    pass: marketplaceHasElsa,
  });

  const marketplaceHasOracle = await agentMarketplace.hasRole(
    ORACLE_ROLE,
    web2OracleAddress
  );
  checks.push({
    label: "Marketplace: ORACLE_ROLE",
    pass: marketplaceHasOracle,
  });

  // ElsaOrchestrator roles
  const orchestratorHasSigner = await elsaOrchestrator.hasRole(
    ELSA_SIGNER_ROLE,
    elsaSignerAddress
  );
  checks.push({
    label: "Orchestrator: ELSA_SIGNER",
    pass: orchestratorHasSigner,
  });

  // Web2Oracle roles
  const oracleHasOperator = await web2Oracle.isOracleOperator(
    oracleOperatorAddress
  );
  checks.push({
    label: "Web2Oracle: ORACLE_OPERATOR",
    pass: oracleHasOperator,
  });

  // Web2Oracle marketplace pointer
  const oracleMarketplace = await web2Oracle.marketplace();
  checks.push({
    label: "Web2Oracle.marketplace set",
    pass: oracleMarketplace === agentMarketplaceAddress,
    detail: oracleMarketplace,
  });

  // Orchestrator marketplace pointer
  const orchestratorMarketplace = await elsaOrchestrator.marketplace();
  checks.push({
    label: "Orchestrator.marketplace set",
    pass: orchestratorMarketplace === agentMarketplaceAddress,
    detail: orchestratorMarketplace,
  });

  let allPassed = true;
  for (const check of checks) {
    const icon = check.pass ? "✓" : "✗";
    const status = check.pass ? "" : " ← FAILED";
    console.log(
      `  ${icon}  ${check.label.padEnd(34)}${check.detail ? check.detail : ""}${status}`
    );
    if (!check.pass) allPassed = false;
  }

  if (!allPassed) {
    throw new Error(
      "\n  ❌ One or more post-deployment checks failed. Review the output above."
    );
  }

  console.log("\n  ✅ All checks passed.");

  // ============================================================================
  // BLOCK EXPLORER VERIFICATION
  // ============================================================================
  section("Block Explorer Verification");

  if (networkName === "hardhat" || networkName === "localhost") {
    console.log("  Skipped — local network.");
  } else {
    console.log("  Submitting contracts for source verification…\n");

    // Allow the block explorer indexer time to pick up the deployments
    console.log("  Waiting 30 seconds for indexer to catch up…");
    await new Promise((resolve) => setTimeout(resolve, 30_000));

    await verifyContract(agentRegistryAddress, [adminAddress]);
    await verifyContract(reputationEngineAddress, [adminAddress]);
    await verifyContract(taskEscrowAddress, [adminAddress]);
    await verifyContract(agentMarketplaceAddress, [
      adminAddress,
      agentRegistryAddress,
      reputationEngineAddress,
      taskEscrowAddress,
    ]);
    await verifyContract(web2OracleAddress, [adminAddress, agentMarketplaceAddress]);
    await verifyContract(elsaOrchestratorAddress, [
      adminAddress,
      agentMarketplaceAddress,
      initialBudgetCap.toString(),
    ]);
  }

  // ============================================================================
  // SUMMARY
  // ============================================================================
  section("Deployment Summary");

  const deployedData: DeployedAddresses = {
    network: networkName,
    chainId: Number(chainId),
    deployedAt: new Date().toISOString(),
    deployer: deployer.address,
    contracts: {
      AgentRegistry:      agentRegistryAddress,
      ReputationEngine:   reputationEngineAddress,
      TaskEscrow:         taskEscrowAddress,
      AgentMarketplace:   agentMarketplaceAddress,
      Web2Oracle:         web2OracleAddress,
      ElsaOrchestrator:   elsaOrchestratorAddress,
    },
    roles: {
      elsaSigner:      elsaSignerAddress,
      oracleOperator:  oracleOperatorAddress,
    },
  };

  console.log("\n  CONTRACT ADDRESSES");
  console.log("  ──────────────────────────────────────────────────────────");
  for (const [name, address] of Object.entries(deployedData.contracts)) {
    log(name, address);
  }

  console.log("\n  ROLE ASSIGNMENTS");
  console.log("  ──────────────────────────────────────────────────────────");
  log("ELSA_SIGNER",      elsaSignerAddress);
  log("ORACLE_OPERATOR",  oracleOperatorAddress);
  log("ADMIN",            adminAddress);

  saveDeployment(deployedData);

  console.log("\n╔══════════════════════════════════════════════════════════╗");
  console.log(  "║   ✅  Deployment complete — Hey Elsa is live.            ║");
  console.log(  "╚══════════════════════════════════════════════════════════╝\n");
}

// =============================================================================
// ENTRYPOINT
// =============================================================================

main()
  .then(() => process.exit(0))
  .catch((error: Error) => {
    console.error("\n  ❌ Deployment failed:\n");
    console.error(error);
    process.exit(1);
  });
