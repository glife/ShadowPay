import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "hardhat-gas-reporter";
import "hardhat-contract-sizer";
import "solidity-coverage";
import * as dotenv from "dotenv";

dotenv.config();

// ─────────────────────────────────────────────────────────────────────────────
// Environment helpers — fall back to safe defaults so the config can be
// imported even when .env is absent (e.g. CI compile-only runs).
// ─────────────────────────────────────────────────────────────────────────────

const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  // Well-known Hardhat account #0 — safe placeholder for local dev only
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const ETHERSCAN_API_KEY   = process.env.ETHERSCAN_API_KEY   || "";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY || "";
const ARBISCAN_API_KEY    = process.env.ARBISCAN_API_KEY    || "";
const BASESCAN_API_KEY    = process.env.BASESCAN_API_KEY    || "";
const COINMARKETCAP_API_KEY = process.env.COINMARKETCAP_API_KEY || "";

const MAINNET_RPC_URL         = process.env.MAINNET_RPC_URL         || "https://eth.llamarpc.com";
const SEPOLIA_RPC_URL         = process.env.SEPOLIA_RPC_URL         || "https://rpc.sepolia.org";
const POLYGON_RPC_URL         = process.env.POLYGON_RPC_URL         || "https://polygon-rpc.com";
const MUMBAI_RPC_URL          = process.env.MUMBAI_RPC_URL          || "https://rpc-mumbai.maticvigil.com";
const ARBITRUM_RPC_URL        = process.env.ARBITRUM_RPC_URL        || "https://arb1.arbitrum.io/rpc";
const ARBITRUM_SEPOLIA_RPC_URL = process.env.ARBITRUM_SEPOLIA_RPC_URL || "https://sepolia-rollup.arbitrum.io/rpc";
const BASE_RPC_URL            = process.env.BASE_RPC_URL            || "https://mainnet.base.org";
const BASE_SEPOLIA_RPC_URL    = process.env.BASE_SEPOLIA_RPC_URL    || "https://sepolia.base.org";

const REPORT_GAS      = process.env.REPORT_GAS      === "true";
const OPTIMIZER_RUNS  = parseInt(process.env.OPTIMIZER_RUNS || "200", 10);

// ─────────────────────────────────────────────────────────────────────────────
// Hardhat Configuration
// ─────────────────────────────────────────────────────────────────────────────

const config: HardhatUserConfig = {

  // ──────────────────────────────────────────────────────────────────────────
  // Solidity Compiler
  // ──────────────────────────────────────────────────────────────────────────
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: OPTIMIZER_RUNS,
          },
          viaIR: false,
          evmVersion: "paris",
          // Expose all output artifacts needed by TypeChain + coverage
          outputSelection: {
            "*": {
              "*": [
                "abi",
                "evm.bytecode",
                "evm.deployedBytecode",
                "evm.methodIdentifiers",
                "metadata",
                "storageLayout",
              ],
              "": ["ast"],
            },
          },
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Networks
  // ──────────────────────────────────────────────────────────────────────────
  networks: {
    // Local Hardhat in-process node (default for `hardhat test`)
    hardhat: {
      chainId: 31337,
      gas: "auto",
      gasPrice: "auto",
      // Uncomment to fork mainnet at a specific block for integration tests:
      // forking: {
      //   url: MAINNET_RPC_URL,
      //   blockNumber: parseInt(process.env.FORK_BLOCK_NUMBER || "0") || undefined,
      // },
      accounts: {
        // 10 accounts, each funded with 10,000 ETH — plenty for tests
        mnemonic: "test test test test test test test test test test test junk",
        count: 10,
        accountsBalance: "10000000000000000000000",
      },
      allowUnlimitedContractSize: false,
      throwOnTransactionFailures: true,
      throwOnCallFailures: true,
      loggingEnabled: false,
    },

    // Local standalone node started with `hardhat node`
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
      timeout: 60_000,
    },

    // ── Ethereum ─────────────────────────────────────────────────────────────
    mainnet: {
      url: MAINNET_RPC_URL,
      chainId: 1,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
      timeout: 120_000,
      // Confirmations to wait before considering a deployment final
      confirmations: 2,
    },

    sepolia: {
      url: SEPOLIA_RPC_URL,
      chainId: 11155111,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
      timeout: 120_000,
      confirmations: 1,
    },

    // ── Polygon ───────────────────────────────────────────────────────────────
    polygon: {
      url: POLYGON_RPC_URL,
      chainId: 137,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
      timeout: 120_000,
      confirmations: 2,
    },

    mumbai: {
      url: MUMBAI_RPC_URL,
      chainId: 80001,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
      timeout: 120_000,
      confirmations: 1,
    },

    // ── Arbitrum ──────────────────────────────────────────────────────────────
    arbitrum: {
      url: ARBITRUM_RPC_URL,
      chainId: 42161,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
      timeout: 120_000,
      confirmations: 2,
    },

    arbitrumSepolia: {
      url: ARBITRUM_SEPOLIA_RPC_URL,
      chainId: 421614,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
      timeout: 120_000,
      confirmations: 1,
    },

    // ── Base ──────────────────────────────────────────────────────────────────
    base: {
      url: BASE_RPC_URL,
      chainId: 8453,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
      timeout: 120_000,
      confirmations: 2,
    },

    baseSepolia: {
      url: BASE_SEPOLIA_RPC_URL,
      chainId: 84532,
      accounts: [DEPLOYER_PRIVATE_KEY],
      gas: "auto",
      gasPrice: "auto",
      timeout: 120_000,
      confirmations: 1,
    },
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Paths
  // ──────────────────────────────────────────────────────────────────────────
  paths: {
    sources:   "./contracts",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // TypeChain — generates type-safe contract wrappers for tests & scripts
  // ──────────────────────────────────────────────────────────────────────────
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
    alwaysGenerateOverloads: false,
    externalArtifacts: [],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Etherscan / Block Explorer Verification
  // ──────────────────────────────────────────────────────────────────────────
  etherscan: {
    apiKey: {
      // Ethereum
      mainnet: ETHERSCAN_API_KEY,
      sepolia:  ETHERSCAN_API_KEY,
      // Polygon
      polygon:        POLYGONSCAN_API_KEY,
      polygonMumbai:  POLYGONSCAN_API_KEY,
      // Arbitrum
      arbitrumOne:     ARBISCAN_API_KEY,
      arbitrumSepolia: ARBISCAN_API_KEY,
      // Base
      base:        BASESCAN_API_KEY,
      baseSepolia: BASESCAN_API_KEY,
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL:     "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org",
        },
      },
      {
        network: "arbitrumSepolia",
        chainId: 421614,
        urls: {
          apiURL:     "https://api-sepolia.arbiscan.io/api",
          browserURL: "https://sepolia.arbiscan.io",
        },
      },
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Gas Reporter
  // ──────────────────────────────────────────────────────────────────────────
  gasReporter: {
    enabled: REPORT_GAS,
    currency: "USD",
    coinmarketcap: COINMARKETCAP_API_KEY,
    outputFile: REPORT_GAS ? "gas-report.txt" : undefined,
    noColors: REPORT_GAS,       // clean output when writing to file
    reportPureAndViewMethods: false,
    showMethodSig: true,
    showDeploymentCost: true,
    // Contracts to exclude from the report (internal libraries, mocks, etc.)
    excludeContracts: [],
    // Token & network for gas cost estimation
    token: "ETH",
    gasPriceApi:
      "https://api.etherscan.io/api?module=proxy&action=eth_gasPrice",
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Contract Sizer
  // ──────────────────────────────────────────────────────────────────────────
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: false,        // set to true to see sizes on every compile
    strict: false,              // if true, fails build when a contract > 24 KB
    only: [
      "AgentRegistry",
      "ReputationEngine",
      "TaskEscrow",
      "AgentMarketplace",
      "Web2Oracle",
      "ElsaOrchestrator",
    ],
  },

  // ──────────────────────────────────────────────────────────────────────────
  // Mocha (test runner)
  // ──────────────────────────────────────────────────────────────────────────
  mocha: {
    timeout: 120_000,   // 2 minutes — generous for fork tests
    reporter: "spec",
    bail: false,        // run all tests even if one fails
  },
};

export default config;
