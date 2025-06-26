import { EnvConfig } from "@repo/config/contracts";
import { upgradeNodeManagement } from "./upgrade_node_management";

async function main() {
  try {
    const env = process.env.VITE_APP_ENV as EnvConfig;
    if (!env) {
      throw new Error("Environment variable VITE_APP_ENV is not set.");
    }

    console.log(`Running July 1st Node Management Upgrade on environment: ${env}`);

    await upgradeNodeManagement();
  } catch (error) {
    console.error("July 1st Node Management Upgrade failed:", error);
    process.exit(1);
  }
}

main();
