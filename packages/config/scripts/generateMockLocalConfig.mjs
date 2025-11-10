import fs from "fs";
import path from "path";
import { fetchGenesisBlock } from "./fetchGenesisId.mjs";

/**
 * Generates a mock local config file if it does not exist yet
 * This is needed and executed in the dev pipeline to avoid versioning local.ts
 * Now dynamically fetches the genesis block from the running thor-solo node
 */
export const generateMockLocalConfig = async () => {
  console.log("Checking if @repo/config/local.ts exists...");

  const localConfigPath = path.resolve("./local.ts");
  if (fs.existsSync(localConfigPath)) {
    console.log(`${localConfigPath} exists, skipping...`);
    return;
  }

  console.log(`${localConfigPath} does not exist, generating mock...`);

  // Default genesis block (fallback if thor-solo is not running)
  let genesisBlock = {
    id: "0x0000000089970f535c92d8f2151346f002755b4cf6f7fb4b731317fc6df8ee51",
  };

  // Try to fetch the actual genesis block from thor-solo
  try {
    genesisBlock = await fetchGenesisBlock("http://localhost:8669");
  } catch (error) {
    console.error("Failed to fetch genesis block from thor-solo. Using default genesis block.");
  }

  const toWrite = `import { AppConfig } from ".";

const config: AppConfig = {
  environment: "local",
  basePath: "http://localhost:3000",
  ipfsPinningService: "https://api.gateway-proxy.vechain.org/api/v1/pinning/pinFileToIPFS",
  ipfsFetchingService: "https://api.gateway-proxy.vechain.org/ipfs",
  legacyNodesContractAddress: "0x45d5CA3f295ad8BCa291cC4ecd33382DE40E4FAc",
  stargateNFTContractAddress: "0x45d5CA3f295ad8BCa291cC4ecd33382DE40E4FAc",
  stargateDelegationContractAddress: "0x45d5CA3f295ad8BCa291cC4ecd33382DE40E4FAc",
  nodeManagementContractAddress: "0x45d5CA3f295ad8BCa291cC4ecd33382DE40E4FAc",
  stargateContractAddress: "0x00000000000000000000000000005374616B6572",
  protocolStakerContractAddress: "0x00000000000000000000000000005374616B6572",
  protocolParamsContractAddress: "0x0000000000000000000000000000506172616d73",
  indexerUrl: "http://localhost:8080/api/v1",
  nodeUrl: "http://localhost:8669",
  network: {
    id: "solo",
    name: "solo",
    type: "solo",
    defaultNet: true,
    urls: [
      "http://localhost:8669"
    ],
    explorerUrl: "https://explore-testnet.vechain.org",
    blockTime: ${1000 * 10},
    genesis: {
      id: "${genesisBlock.id}"
    }
  },
  cyclePeriods: [
    { value: 18, label: "3 minutes" },
    { value: 180, label: "30 minutes" },
    { value: 8640, label: "1 day" },
  ],
}
export default config;`;

  console.log(`Writing mock config file to ${localConfigPath}`);
  fs.writeFileSync(localConfigPath, toWrite);

  console.log("Done!");
};

generateMockLocalConfig().catch((error) => {
  console.error("Failed to generate mock local config:", error);
  process.exit(1);
});
