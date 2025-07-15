import { deployAll } from "./deploy/deploy";
import { AppConfig, getConfig } from "@repo/config";
import fs from "fs";
import path from "path";
import { Network } from "@repo/constants";

const config = getConfig();

export const overrideLocalConfigWithNewContracts = async (
  contracts: Awaited<ReturnType<typeof deployAll>>,
  network: Network
) => {
  const newConfig: AppConfig = {
    ...config,
    legacyNodesContractAddress: contracts.TokenAuctionMock,
    stargateNFTContractAddress: contracts.StargateNFT,
    stargateDelegationContractAddress: contracts.StargateDelegation,
    nodeManagementContractAddress: contracts.NodeManagement,
  };

  console.log(`Overriding local config with new contracts...`, newConfig);

  // eslint-disable-next-line
  const toWrite = `import { AppConfig } from \".\" \n const config: AppConfig = ${JSON.stringify(newConfig, null, 2)};
    export default config;`;

  const configFiles: { [key: string]: string } = {
    solo: "local.ts",
    test: "testnet.ts",
    main: "mainnet.ts",
  };
  const fileToWrite = configFiles[network.name];
  const localConfigPath = path.resolve(`../config/${fileToWrite}`);
  console.log(`Writing new config file to ${localConfigPath}`);
  fs.writeFileSync(localConfigPath, toWrite);
};
