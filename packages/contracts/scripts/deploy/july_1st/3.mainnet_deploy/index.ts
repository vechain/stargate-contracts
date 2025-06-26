import { getContractsConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { deployMainnetRelease } from "./mainnet_deploy";

async function main() {
  try {
    const env = process.env.VITE_APP_ENV as EnvConfig;
    if (!env) {
      throw new Error("Environment variable VITE_APP_ENV is not set.");
    }

    console.log(`Running July 1st Mainnet Deploy on environment: ${env}`);

    const config = getContractsConfig(env);

    await deployMainnetRelease(config);

    console.log("July 1st Mainnet Deploy completed successfully!");
  } catch (error) {
    console.error("July 1st Mainnet Deploy failed:", error);
    process.exit(1);
  }
}

main();
