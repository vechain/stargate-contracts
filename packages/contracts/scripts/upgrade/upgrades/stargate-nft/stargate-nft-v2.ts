import { ethers, network } from "hardhat";
import { getConfig } from "@repo/config";
import { EnvConfig, getContractsConfig } from "@repo/config/contracts";
import { deployStargateNFTLibraries } from "../../../deploy/libraries";
import { upgradeProxy } from "../../../helpers";
import {
    ClockV2,
    LevelsV2,
    MintingLogicV2,
    SettingsV2,
    StargateNFT,
    StargateNFTV2,
    TokenV2,
    VetGeneratedVthoV2,
} from "../../../../typechain-types";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
    const contractsConfig = getContractsConfig(process.env.VITE_APP_ENV as EnvConfig);

    console.log(
        `Upgrading StargateNFT contract at address: ${config.stargateNFTContractAddress} on network: ${config.network.name} with hardhat network set to: ${network.name}`
    );

    // Deploy libraries
    // Deploy Clock Library
    const ClockV2 = await ethers.getContractFactory("ClockV2");
    const StargateNFTClockLibV2 = (await ClockV2.deploy()) as ClockV2;
    await StargateNFTClockLibV2.waitForDeployment();
    console.log("ClockV2 Library deployed");

    // Deploy Levels Library
    const LevelsV2 = await ethers.getContractFactory("LevelsV2");
    const StargateNFTLevelsLibV2 = (await LevelsV2.deploy()) as LevelsV2;
    await StargateNFTLevelsLibV2.waitForDeployment();
    console.log("LevelsV2 Library deployed");

    // Deploy MintingLogic Library
    const MintingLogicV2 = await ethers.getContractFactory("MintingLogicV2");
    const StargateNFTMintingLibV2 = (await MintingLogicV2.deploy()) as MintingLogicV2;
    await StargateNFTMintingLibV2.waitForDeployment();
    console.log("MintingLogicV2 Library deployed");

    // Deploy Settings Library
    const SettingsV2 = await ethers.getContractFactory("SettingsV2");
    const StargateNFTSettingsLibV2 = (await SettingsV2.deploy()) as SettingsV2;
    await StargateNFTSettingsLibV2.waitForDeployment();
    console.log("SettingsV2 Library deployed");

    // Deploy Token Library
    const TokenV2 = await ethers.getContractFactory("TokenV2");
    const StargateNFTTokenLibV2 = (await TokenV2.deploy()) as TokenV2;
    await StargateNFTTokenLibV2.waitForDeployment();
    console.log("TokenV2 Library deployed");

    // Deploy VetGeneratedVtho Library
    const VetGeneratedVthoV2 = await ethers.getContractFactory("VetGeneratedVthoV2");
    const StargateNFTVetGeneratedVthoLibV2 =
        (await VetGeneratedVthoV2.deploy()) as VetGeneratedVthoV2;
    await StargateNFTVetGeneratedVthoLibV2.waitForDeployment();
    console.log("VetGeneratedVthoV2 Library deployed");

    const stargateNFTV2 = (await upgradeProxy(
        "StargateNFTV1",
        "StargateNFTV2",
        config.stargateNFTContractAddress,
        [contractsConfig.WHITELIST_ENTRIES_V2],
        {
            version: 2,
            libraries: {
                ClockV2: await StargateNFTClockLibV2.getAddress(),
                LevelsV2: await StargateNFTLevelsLibV2.getAddress(),
                MintingLogicV2: await StargateNFTMintingLibV2.getAddress(),
                SettingsV2: await StargateNFTSettingsLibV2.getAddress(),
                TokenV2: await StargateNFTTokenLibV2.getAddress(),
                VetGeneratedVthoV2: await StargateNFTVetGeneratedVthoLibV2.getAddress(),
            },
            logOutput: true,
        }
    )) as StargateNFTV2;

    console.log(`StargateNFT upgraded`);

    // check that upgrade was successful
    const version = await stargateNFTV2.version();
    console.log(`New StargateNFT version: ${version}`);

    if (version !== 2n) {
        throw new Error(`StargateNFT version is not 2: ${version}`);
    }

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
