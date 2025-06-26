import { EnvConfig } from "@repo/config/contracts";
import { rolesTransfer } from "./roles_transfer";

async function main() {
  try {
    const env = process.env.VITE_APP_ENV as EnvConfig;
    if (!env) {
      throw new Error("Environment variable VITE_APP_ENV is not set.");
    }

    console.log(`Running July 1st Roles Transfer on environment: ${env}`);

    await rolesTransfer();

    console.log("July 1st Roles Transfer completed successfully!");
  } catch (error) {
    console.error("July 1st Roles Transfer failed:", error);
    process.exit(1);
  }
}

main();
