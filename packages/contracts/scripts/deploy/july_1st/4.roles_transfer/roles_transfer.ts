import inquirer from "inquirer";
import { execSync } from "child_process";
import { EnvConfig } from "@repo/config/contracts";
import { getConfig } from "@repo/config";
import { ethers } from "hardhat";

export async function rolesTransfer() {
  try {
    const env = process.env.VITE_APP_ENV;
    if (!env) throw new Error("Environment variable VITE_APP_ENV is not set.");

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
    const deployerAddress = (await ethers.getSigners())[0].address;
    const stargateNFTContract = await ethers.getContractAt(
      "StargateNFT",
      config.stargateNFTContractAddress
    );
    const stargateDelegationContract = await ethers.getContractAt(
      "StargateDelegationV1",
      config.stargateDelegationContractAddress
    );

    const DEFAULT_ADMIN_ROLE = await stargateNFTContract.DEFAULT_ADMIN_ROLE();
    const UPGRADER_ROLE = await stargateNFTContract.UPGRADER_ROLE();
    const PAUSER_ROLE = await stargateNFTContract.PAUSER_ROLE();
    const LEVEL_OPERATOR_ROLE = await stargateNFTContract.LEVEL_OPERATOR_ROLE();
    const MANAGER_ROLE = await stargateNFTContract.MANAGER_ROLE();
    const OPERATOR_ROLE = await stargateDelegationContract.OPERATOR_ROLE();

    // Confirm the upgrade
    const { newAdminAddress } = await inquirer.prompt<{
      newAdminAddress: string;
    }>({
      type: "input",
      name: "newAdminAddress",
      message: `Enter the new admin address to transfer the roles to:`,
      default: "",
    });

    if (!newAdminAddress) {
      console.log("New admin address is required.");
      process.exit(0);
    }

    // validate the new admin address is valid
    if (!ethers.isAddress(newAdminAddress)) {
      console.log("New admin address is not a valid address.");
      process.exit(0);
    }

    console.log(`You are about to transfer the following roles:`);
    console.log(`\nStargate NFT Contract address: ${config.stargateNFTContractAddress}`);
    console.log(`Roles to transfer:`);
    console.log(`- DEFAULT_ADMIN_ROLE -> ${newAdminAddress}`);
    console.log(`- UPGRADER_ROLE -> ${ethers.ZeroAddress}`);
    // console.log(`- PAUSER_ROLE -> ${ethers.ZeroAddress}`);
    console.log(`- LEVEL_OPERATOR_ROLE -> ${ethers.ZeroAddress}`);
    console.log(`- MANAGER_ROLE -> ${ethers.ZeroAddress}`);
    console.log(
      `\nStargate Delegation Contract address: ${config.stargateDelegationContractAddress}`
    );
    console.log(`Roles to transfer:`);
    console.log(`- DEFAULT_ADMIN_ROLE -> ${newAdminAddress}`);
    console.log(`- OPERATOR_ROLE -> ${ethers.ZeroAddress}`);
    console.log(`- UPGRADER_ROLE -> ${ethers.ZeroAddress}`);
    console.log(`Environment: ${env}\n`);
    console.log(`Deployer address: ${deployerAddress}\n`);

    // check if the deployer has the DEFAULT_ADMIN_ROLE on the stargate nft contract

    const hasDefaultAdminRole = await stargateNFTContract.hasRole(
      await stargateNFTContract.DEFAULT_ADMIN_ROLE(),
      deployerAddress
    );
    if (!hasDefaultAdminRole) {
      console.log("Deployer does not have the DEFAULT_ADMIN_ROLE on the stargate nft contract.");
      process.exit(0);
    }

    // Confirm the transfer
    const { confirmRolesTransfer } = await inquirer.prompt<{
      confirmRolesTransfer: boolean;
    }>({
      type: "confirm",
      name: "confirmRolesTransfer",
      message: `Do you want to proceed with the transfer of roles to ${newAdminAddress}?`,
      default: false,
    });

    if (!confirmRolesTransfer) {
      console.log("Roles transfer aborted.");
      process.exit(0);
    }

    // transfer the roles
    console.log(
      "Transferring DEFAULT_ADMIN_ROLE to",
      newAdminAddress,
      "on Stargate NFT contract..."
    );
    await stargateNFTContract.grantRole(DEFAULT_ADMIN_ROLE, newAdminAddress);
    let success = await stargateNFTContract.hasRole(DEFAULT_ADMIN_ROLE, newAdminAddress);
    if (!success) {
      console.log(
        "Failed to transfer DEFAULT_ADMIN_ROLE to",
        newAdminAddress,
        "on Stargate NFT contract."
      );
      process.exit(0);
    }
    console.log("Done");

    console.log(
      "Transferring DEFAULT_ADMIN_ROLE to",
      newAdminAddress,
      "on Stargate Delegation contract..."
    );

    await stargateDelegationContract.grantRole(DEFAULT_ADMIN_ROLE, newAdminAddress);
    success = await stargateDelegationContract.hasRole(DEFAULT_ADMIN_ROLE, newAdminAddress);
    if (!success) {
      console.log(
        "Failed to transfer DEFAULT_ADMIN_ROLE to",
        newAdminAddress,
        "on Stargate Delegation contract."
      );
      process.exit(0);
    }
    console.log("Done");

    // Confirm the transfer
    const { renounceRoles } = await inquirer.prompt<{
      renounceRoles: boolean;
    }>({
      type: "confirm",
      name: "renounceRoles",
      message: `Do you want to proceed and renounce the roles with the deployer?`,
      default: false,
    });

    if (!renounceRoles) {
      console.log("Roles renounce aborted.");
      process.exit(0);
    }

    console.log(
      "Renouncing UPGRADER_ROLE, LEVEL_OPERATOR_ROLE, MANAGER_ROLE, DEFAULT_ADMIN_ROLE on Stargate NFT contract..."
    );
    await Promise.all([
      stargateNFTContract.renounceRole(UPGRADER_ROLE, deployerAddress),
      // stargateNFTContract.renounceRole(PAUSER_ROLE, deployerAddress),
      stargateNFTContract.renounceRole(LEVEL_OPERATOR_ROLE, deployerAddress),
      stargateNFTContract.renounceRole(MANAGER_ROLE, deployerAddress),
      stargateNFTContract.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddress),
    ]);
    console.log("Done");

    console.log(
      "Renouncing OPERATOR_ROLE, UPGRADER_ROLE, DEFAULT_ADMIN_ROLE on Stargate Delegation contract..."
    );
    await Promise.all([
      stargateDelegationContract.renounceRole(OPERATOR_ROLE, deployerAddress),
      stargateDelegationContract.renounceRole(UPGRADER_ROLE, deployerAddress),
      stargateDelegationContract.renounceRole(DEFAULT_ADMIN_ROLE, deployerAddress),
    ]);
    console.log("Done");

    // Validate that the deployer does not have anymore any roles on the stargate nft contract
    if (
      (await stargateNFTContract.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress)) ||
      (await stargateNFTContract.hasRole(UPGRADER_ROLE, deployerAddress)) ||
      // (await stargateNFTContract.hasRole(PAUSER_ROLE, deployerAddress)) ||
      (await stargateNFTContract.hasRole(LEVEL_OPERATOR_ROLE, deployerAddress)) ||
      (await stargateNFTContract.hasRole(MANAGER_ROLE, deployerAddress)) ||
      (await stargateDelegationContract.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress)) ||
      (await stargateDelegationContract.hasRole(UPGRADER_ROLE, deployerAddress))
    ) {
      console.log(
        "Deployer still has some roles on the stargate nft contract or stargate delegation contract."
      );
      process.exit(0);
    }
    console.log("Validation successful");

    console.log("\nRoles transfer complete!");
  } catch (error) {
    console.error("Upgrade failed:", error);
    process.exit(1);
  }
}
