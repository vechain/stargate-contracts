import { EnvConfig } from "@repo/config/contracts";
import { upgradeStargateNFT } from "./upgrade-stargate-nft";

async function main() {
  try {
    const env = process.env.VITE_APP_ENV as EnvConfig;
    if (!env) {
      throw new Error("Environment variable VITE_APP_ENV is not set.");
    }

    console.log(`Running July 1st Stargate NFT Upgrade on environment: ${env}`);

    await upgradeStargateNFT();
  } catch (error) {
    console.error("July 1st Stargate NFT Upgrade failed:", error);
    process.exit(1);
  }
}

main();
