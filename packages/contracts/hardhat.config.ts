import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomiclabs/hardhat-truffle5";
import "@vechain/sdk-hardhat-plugin";
import "hardhat-contract-sizer";
import "hardhat-ignore-warnings";
import { getConfig } from "@repo/config";
import "solidity-coverage";
import "solidity-docgen";
import { EnvConfig } from "@repo/config/contracts";
import "@nomicfoundation/hardhat-verify";

const VECHAIN_DERIVATION_PATH = "m/44'/818'/0'/0";

const getEnvMnemonic = () => {
  const mnemonic = process.env.MNEMONIC;

  return mnemonic ?? "";
};

const getSoloUrl = () => {
  const url = process.env.VITE_APP_ENV
    ? getConfig(process.env.VITE_APP_ENV as EnvConfig).network.urls[0]
    : "http://localhost:8669";
  return url;
};

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 1,
          },
          evmVersion: "paris",
        },
      },
    ],
  },
  contractSizer: {
    alphaSort: true,
    disambiguatePaths: false,
    runOnCompile: true,
    strict: true,
    except: [
      "mocks",
      "deprecated",
      "interfaces",
      "test",
      "templates",
      "openzeppelin",
      "NodeManagement/NodeManagementV1.sol",
    ],
  },
  mocha: {
    timeout: 1800000,
  },
  gasReporter: {
    enabled: false,
    excludeContracts: [
      "mocks",
      "deprecated",
      "interfaces",
      "test",
      "templates",
      "NodeManagement/NodeManagementV1.sol",
      "NodeManagement/NodeManagementV2.sol",
    ],
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId: 1337,
    },
    vechain_solo: {
      url: getSoloUrl(),
      accounts: {
        mnemonic: getEnvMnemonic(),
        count: 20,
        path: VECHAIN_DERIVATION_PATH,
      },
      gas: 10000000,
    },
    vechain_testnet: {
      url: "https://testnet.vechain.org",
      chainId: 100010,
      accounts: {
        mnemonic: getEnvMnemonic(),
        count: 20,
        path: VECHAIN_DERIVATION_PATH,
      },
      gas: 10000000,
    },
    vechain_mainnet: {
      url: "https://mainnet.vechain.org",
      chainId: 100009,
      accounts: {
        mnemonic: getEnvMnemonic(),
        count: 20,
        path: VECHAIN_DERIVATION_PATH,
      },
      gas: 10000000,
    },
  },
  docgen: {
    pages: "files",
  },
  sourcify: {
    enabled: true,
    apiUrl: "https://sourcify.dev/server",
    browserUrl: "https://repo.sourcify.dev",
  },
};

export default config;
