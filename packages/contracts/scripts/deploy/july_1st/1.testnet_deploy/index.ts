import { getContractsConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { deployTestnetRelease } from "./testnet_deploy";

async function main() {
  try {
    const env = process.env.VITE_APP_ENV as EnvConfig;
    if (!env) {
      throw new Error("Environment variable VITE_APP_ENV is not set.");
    }

    console.log(`Running July 1st Testnet Deploy on environment: ${env}`);

    const config = getContractsConfig(env);
    await deployTestnetRelease(config);

    console.log("July 1st Testnet Deploy completed successfully!");
  } catch (error) {
    console.error("July 1st Testnet Deploy failed:", error);
    process.exit(1);
  }
}

main();
