import inquirer from "inquirer";
import { execSync } from "child_process";
import { EnvConfig } from "@repo/config/contracts";
import { getConfig } from "@repo/config";
import { ethers } from "hardhat";

export async function upgradeNodeManagement() {
  try {
    const env = process.env.VITE_APP_ENV;
    if (!env) throw new Error("Environment variable VITE_APP_ENV is not set.");

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

    const selectedContract = "node-management";
    const version = "v3";

    console.log(`You are about to upgrade the following contract:`);
    console.log(`\nContract: ${selectedContract}`);
    console.log(`Node Management Contract address: ${config.nodeManagementContractAddress}`);
    console.log(`Stargate NFT Contract address: ${config.stargateNFTContractAddress}`);
    console.log(`Version: ${version}`);
    console.log(`Environment: ${env}\n`);
    console.log(`Deployer address: ${(await ethers.getSigners())[0].address}\n`);

    // Confirm the upgrade
    const { confirmUpgrade } = await inquirer.prompt<{
      confirmUpgrade: boolean;
    }>({
      type: "confirm",
      name: "confirmUpgrade",
      message: `Do you want to proceed with the upgrade of ${selectedContract} to version ${version} on environment ${env}?`,
      default: false,
    });

    if (!confirmUpgrade) {
      console.log("Upgrade aborted.");
      process.exit(0);
    }

    // Set environment variables
    process.env.CONTRACT_TO_UPGRADE = selectedContract;
    process.env.CONTRACT_VERSION = version;

    console.log(`\nStarting upgrade of ${selectedContract} to version ${version} on ${env}...`);

    // Run the upgrade script
    execSync(`turbo run upgrade:contract:${env}`, { stdio: "inherit" });

    console.log("\nUpgrade complete!");
  } catch (error) {
    console.error("Upgrade failed:", error);
    process.exit(1);
  }
}
