import testnetConfig from "./testnet";
import mainnetConfig from "./mainnet";
import localConfig from "./local";
import { EnvConfig, getContractsConfig } from "./contracts";
import { Network } from "@repo/constants";

export type AppConfig = {
  environment: EnvConfig;
  basePath?: string;
  ipfsPinningService: string;
  ipfsFetchingService: string;
  legacyNodesContractAddress: string;
  stargateNFTContractAddress: string;
  stargateDelegationContractAddress: string;
  nodeManagementContractAddress: string;
  nodeUrl: string;
  indexerUrl: string;
  network: Network;
};

export const getConfig = (env?: EnvConfig): AppConfig => {
  const appEnv = env || process.env.VITE_APP_ENV;

  if (!appEnv)
    throw new Error(
      "VITE_APP_ENV env variable must be set or a type must be passed to getConfig()"
    );
  if (appEnv === "testnet") return testnetConfig;
  if (appEnv === "mainnet") return mainnetConfig;
  if (appEnv === "local") return localConfig;

  throw new Error(`Unsupported VITE_APP_ENV ${appEnv}`);
};

export { getContractsConfig };
