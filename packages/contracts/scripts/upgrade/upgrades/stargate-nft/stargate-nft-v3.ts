import { ethers, network } from "hardhat";
import { getConfig } from "@repo/config";
import { EnvConfig, getContractsConfig } from "@repo/config/contracts";
import { upgradeProxy } from "../../../helpers";
import {
    Clock,
    Levels,
    MintingLogic,
    Settings,
    StargateNFTV2,
    Token,
    TokenManager,
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
    const clockFactoryV3 = await ethers.getContractFactory("Clock");
    const clockLibV3 = (await clockFactoryV3.deploy()) as Clock;
    await clockLibV3.waitForDeployment();
    console.log("Clock Library deployed");

    // Deploy Levels Library
    const levelsFactoryV3 = await ethers.getContractFactory("Levels");
    const levelsLibV3 = (await levelsFactoryV3.deploy()) as Levels;
    await levelsLibV3.waitForDeployment();
    console.log("Levels Library deployed");

    // Deploy MintingLogic Library
    const mintingFactoryV3 = await ethers.getContractFactory("MintingLogic");
    const mintingLibV3 = (await mintingFactoryV3.deploy()) as MintingLogic;
    await mintingLibV3.waitForDeployment();
    console.log("MintingLogic Library deployed");

    // Deploy Settings Library
    const settingsFactoryV3 = await ethers.getContractFactory("Settings");
    const settingsLibV3 = (await settingsFactoryV3.deploy()) as Settings;
    await settingsLibV3.waitForDeployment();
    console.log("Settings Library deployed");

    // Deploy Token Library
    const tokenFactoryV3 = await ethers.getContractFactory("Token");
    const tokenLibV3 = (await tokenFactoryV3.deploy()) as Token;
    await tokenLibV3.waitForDeployment();
    console.log("Token Library deployed");

    // Deploy tokenManager Library
    const tokenManagerFactoryV3 = await ethers.getContractFactory("TokenManager");
    const tokenManagerLibV3 = (await tokenManagerFactoryV3.deploy()) as TokenManager;
    await tokenManagerLibV3.waitForDeployment();
    console.log("TokenManager Library deployed");

    const stargateNFTV3 = (await upgradeProxy(
        "StargateNFTV2",
        "StargateNFT",
        config.stargateNFTContractAddress,
        [
            config.stargateContractAddress,
            contractsConfig.STARGATE_NFT_BOOST_LEVEL_IDS,
            contractsConfig.STARGATE_NFT_BOOST_PRICES_PER_BLOCK,
        ],
        {
            version: 3,
            libraries: {
                Clock: await clockLibV3.getAddress(),
                MintingLogic: await mintingLibV3.getAddress(),
                Levels: await levelsLibV3.getAddress(),
                Settings: await settingsLibV3.getAddress(),
                Token: await tokenLibV3.getAddress(),
                TokenManager: await tokenManagerLibV3.getAddress(),
            },
            logOutput: true,
        }
    )) as StargateNFTV2;

    console.log(`StargateNFT upgraded`);

    // check that upgrade was successful
    const version = await stargateNFTV3.version();
    console.log(`New StargateNFT version: ${version}`);

    if (version !== 3n) {
        throw new Error(`StargateNFT version is not 3: ${version}`);
    }

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
