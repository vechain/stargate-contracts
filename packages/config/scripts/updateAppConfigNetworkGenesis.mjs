import "dotenv/config";
import fs from "fs";
import path from "path";
import { fetchGenesisBlock } from "./fetchGenesisId.mjs";

const getNetworkUrl = (environment) => {
  let nodeUrl = "";
  switch (environment) {
    case "local":
      nodeUrl = "http://localhost:8669";
      break;
    case "devnet":
      nodeUrl = "https://hayabusa.live.dev.node.vechain.org";
      break;
    case "testnet":
      nodeUrl = "https://testnet.vechain.org";
      break;
    case "mainnet":
      nodeUrl = "https://mainnet.vechain.org";
      break;
    default:
      throw new Error(`Unsupported environment: ${environment}`);
  }
  return nodeUrl;
};

/**
 * Updates the genesis block in an existing config file
 * This is useful when a thor chain is restarted and gets a new genesis block
 */
export const updateAppConfigNetworkGenesis = async () => {
  try {
    // Get environment from environment variable
    const environment = process.env.VITE_APP_ENV;
    if (!environment) {
      throw new Error("VITE_APP_ENV environment variable is required (local, devnet, testnet, mainnet)");
    }

    // Get config file path
    const configFilePath = path.resolve(`./${environment}.ts`);
    if (!fs.existsSync(configFilePath)) {
      throw new Error(`${configFilePath} does not exist. Run generateMockLocalConfig for local env or create a new config file.`);
    }

    // Fetch the genesis block from the network
    const networkUrl = getNetworkUrl(environment);
    const genesisBlock = await fetchGenesisBlock(networkUrl);
    console.log(`Found genesis block ID: ${genesisBlock.id}`);

    // Read the config file
    const currentConfig = fs.readFileSync(configFilePath, "utf8");

    // Find the genesis section and update it (support quoted and unquoted keys)
    const lines = currentConfig.split("\n");
    let inGenesisSection = false;
    let braceDepth = 0;

    const countChar = (str, ch) => (str.match(new RegExp(`\\${ch}`, "g")) || []).length;
    const isGenesisStart = (line) => /(^|\s)["']?genesis["']?\s*:\s*\{?/.test(line);
    const replaceKeyValue = (line, key, value, quoteValue = true) => {
      const pattern = new RegExp(`(["']?${key}["']?\\s*:\\s*)(\"[^\"]*\"|'[^']*'|[^,}\\s]+)`);
      const replacement = `$1${quoteValue ? '"' + value + '"' : value}`;
      return line.replace(pattern, replacement);
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (!inGenesisSection) {
        if (isGenesisStart(line)) {
          inGenesisSection = true;
          braceDepth += countChar(line, "{") - countChar(line, "}");
        }
        continue;
      }

      // We are inside genesis section
      // Update common fields if present
      if (/["']?id["']?\s*:/.test(line)) {
        lines[i] = replaceKeyValue(line, "id", genesisBlock.id, true);
      } else if (/["']?timestamp["']?\s*:/.test(line) && typeof genesisBlock.timestamp !== "undefined") {
        lines[i] = replaceKeyValue(line, "timestamp", String(genesisBlock.timestamp), false);
      } else if (/["']?parentID["']?\s*:/.test(line) && typeof genesisBlock.parentID !== "undefined") {
        lines[i] = replaceKeyValue(line, "parentID", genesisBlock.parentID, true);
      } else if (/["']?stateRoot["']?\s*:/.test(line) && typeof genesisBlock.stateRoot !== "undefined") {
        lines[i] = replaceKeyValue(line, "stateRoot", genesisBlock.stateRoot, true);
      }

      // Track end of genesis block
      braceDepth += countChar(line, "{") - countChar(line, "}");
      if (braceDepth <= 0) {
        inGenesisSection = false;
      }
    }

    const finalConfig = lines.join("\n");

    // Write the updated config back
    fs.writeFileSync(configFilePath, finalConfig);
    console.log(`Successfully updated ${configFilePath} with new genesis block ID`);
  } catch (error) {
    console.error("Failed to update genesis block:", error.message || error);
    console.error("Make sure your target node is running (check VITE_APP_ENV)");
    process.exit(1);
  }
};

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  updateAppConfigNetworkGenesis().catch((error) => {
    console.error("Failed to update app config network genesis:", error);
    process.exit(1);
  });
}
