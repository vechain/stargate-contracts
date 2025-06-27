import inquirer from "inquirer";
import { EnvConfig } from "@repo/config/contracts";
import { getConfig } from "@repo/config";
import { ethers } from "hardhat";
import { deployStargateNFTLibraries } from "../../libraries";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { AddressUtils } from "@repo/utils";

export async function upgradeStargateNFT() {
  try {
    const env = process.env.VITE_APP_ENV;
    if (!env) throw new Error("Environment variable VITE_APP_ENV is not set.");

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

    console.log(`You are about to upgrade the following contract:`);
    console.log(`\nStargate NFT Contract address: ${config.stargateNFTContractAddress}`);
    console.log(`Environment: ${env}\n`);
    console.log(`Deployer address: ${(await ethers.getSigners())[0].address}\n`);

    // Confirm the upgrade
    const { confirmUpgrade } = await inquirer.prompt<{
      confirmUpgrade: boolean;
    }>({
      type: "confirm",
      name: "confirmUpgrade",
      message: `Do you want to proceed with the upgrade of Stargate NFT on environment ${env}?`,
      default: false,
    });

    if (!confirmUpgrade) {
      console.log("Upgrade aborted.");
      process.exit(0);
    }

    console.log("StargateNFT Proxy address: ", config.stargateNFTContractAddress);
    const stargateNFTContract = await ethers.getContractAt(
      "StargateNFT",
      config.stargateNFTContractAddress
    );

    const currentImplementationAddress = await getImplementationAddress(
      ethers.provider,
      config.stargateNFTContractAddress
    );
    console.log("Current implementation address: ", currentImplementationAddress);

    console.log("Deploying the StargateNFT libraries...");
    const {
      StargateNFTClockLib,
      StargateNFTSettingsLib,
      StargateNFTTokenLib,
      StargateNFTMintingLib,
      StargateNFTVetGeneratedVthoLib,
      StargateNFTLevelsLib,
    } = await deployStargateNFTLibraries({ logOutput: true });

    // Deploy the implementation contract
    const Contract = await ethers.getContractFactory("StargateNFT", {
      libraries: {
        Clock: await StargateNFTClockLib.getAddress(),
        MintingLogic: await StargateNFTMintingLib.getAddress(),
        Settings: await StargateNFTSettingsLib.getAddress(),
        Token: await StargateNFTTokenLib.getAddress(),
        VetGeneratedVtho: await StargateNFTVetGeneratedVthoLib.getAddress(),
        Levels: await StargateNFTLevelsLib.getAddress(),
      },
    });
    const newImplementation = await Contract.deploy();
    await newImplementation.waitForDeployment();
    console.log(`StargateNFT new impl. deployed at: ${await newImplementation.getAddress()}`);

    // Confirm the upgrade
    const { proceed } = await inquirer.prompt<{
      proceed: boolean;
    }>({
      type: "confirm",
      name: "proceed",
      message: `By continuing, you will upgrade the Stargate NFT contract to the new implementation. Do you want to proceed?`,
      default: false,
    });

    if (!proceed) {
      console.log("Upgrade aborted.");
      process.exit(0);
    }

    console.log("Changing implemetation address in proxy");
    const tx = await stargateNFTContract.upgradeToAndCall(
      await newImplementation.getAddress(),
      "0x"
    );
    await tx.wait();
    console.log("Done");

    console.log("Validating that proxy points to the new implementation");
    const newImplementationAddressInProxy = await getImplementationAddress(
      ethers.provider,
      config.stargateNFTContractAddress
    );
    if (
      !AddressUtils.compareAddresses(
        newImplementationAddressInProxy,
        await newImplementation.getAddress()
      )
    ) {
      throw new Error(
        `The implementation address is not the one expected: ${newImplementationAddressInProxy} !== ${await newImplementation.getAddress()}`
      );
    }

    console.log("\nUpgrade complete!");
  } catch (error) {
    console.error("Upgrade failed:", error);
    process.exit(1);
  }
}
