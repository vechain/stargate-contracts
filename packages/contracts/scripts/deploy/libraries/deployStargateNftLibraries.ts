import { ethers } from "hardhat";
import {
    Clock,
    ClockV1,
    ClockV2,
    Levels,
    LevelsV1,
    LevelsV2,
    MintingLogic,
    MintingLogicV1,
    MintingLogicV2,
    TokenManager,
    Settings,
    SettingsV1,
    SettingsV2,
    Token,
    TokenV1,
    TokenV2,
    VetGeneratedVthoV1,
    VetGeneratedVthoV2,
} from "../../../typechain-types";

interface DeployStargateNFTLibrariesArgs {
    logOutput?: boolean;
    latestVersionOnly?: boolean;
}

export type StargateLatestLibraries = {
    StargateNFTClockLib: Clock;
    StargateNFTLevelsLib: Levels;
    StargateNFTSettingsLib: Settings;
    StargateNFTMintingLib: MintingLogic;
    StargateNFTTokenLib: Token;
    StargateNFTTokenManagerLib: TokenManager;
};

export type StargateLibraries = StargateLatestLibraries & {
    StargateNFTClockLibV1: ClockV1;
    StargateNFTLevelsLibV1: LevelsV1;
    StargateNFTSettingsLibV1: SettingsV1;
    StargateNFTMintingLibV1: MintingLogicV1;
    StargateNFTTokenLibV1: TokenV1;
    StargateNFTVetGeneratedVthoLibV1: VetGeneratedVthoV1;
    StargateNFTClockLibV2: ClockV2;
    StargateNFTLevelsLibV2: LevelsV2;
    StargateNFTMintingLibV2: MintingLogicV2;
    StargateNFTSettingsLibV2: SettingsV2;
    StargateNFTTokenLibV2: TokenV2;
    StargateNFTVetGeneratedVthoLibV2: VetGeneratedVthoV2;
};

export async function deployStargateNFTLibraries<T extends DeployStargateNFTLibrariesArgs>({
    logOutput = false,
    latestVersionOnly = false,
}: T): Promise<T["latestVersionOnly"] extends true ? StargateLatestLibraries : StargateLibraries> {
    // ------------------- LATEST VERSION ------------------- //
    // Deploy Clock Library
    const Clock = await ethers.getContractFactory("Clock");
    const StargateNFTClockLib = (await Clock.deploy()) as Clock;
    await StargateNFTClockLib.waitForDeployment();
    logOutput && console.log("Clock Library deployed");

    // Deploy Levels Library
    const Levels = await ethers.getContractFactory("Levels");
    const StargateNFTLevelsLib = (await Levels.deploy()) as Levels;
    await StargateNFTLevelsLib.waitForDeployment();
    logOutput && console.log("Levels Library deployed");

    // Deploy MintingLogic Library
    const MintingLogic = await ethers.getContractFactory("MintingLogic");
    const StargateNFTMintingLib = (await MintingLogic.deploy()) as MintingLogic;
    await StargateNFTMintingLib.waitForDeployment();
    logOutput && console.log("MintingLogic Library deployed");

    // Deploy Settings Library
    const Settings = await ethers.getContractFactory("Settings");
    const StargateNFTSettingsLib = (await Settings.deploy()) as Settings;
    await StargateNFTSettingsLib.waitForDeployment();
    logOutput && console.log("Settings Library deployed");

    // Deploy Token Library
    const Token = await ethers.getContractFactory("Token");
    const StargateNFTTokenLib = (await Token.deploy()) as Token;
    await StargateNFTTokenLib.waitForDeployment();
    logOutput && console.log("Token Library deployed");

    // Deploy TokenManager Library
    const TokenManager = await ethers.getContractFactory("TokenManager");
    const StargateNFTTokenManagerLib = (await TokenManager.deploy()) as TokenManager;
    await StargateNFTTokenManagerLib.waitForDeployment();
    logOutput && console.log("TokenManager Library deployed");

    if (latestVersionOnly) {
        return {
            StargateNFTClockLib,
            StargateNFTLevelsLib,
            StargateNFTMintingLib,
            StargateNFTSettingsLib,
            StargateNFTTokenLib,
            StargateNFTTokenManagerLib,
        } as T["latestVersionOnly"] extends true ? StargateLatestLibraries : StargateLibraries;
    }

    // ------------------- V2 ------------------- //
    // Deploy Clock Library
    const ClockV2 = await ethers.getContractFactory("ClockV2");
    const StargateNFTClockLibV2 = (await ClockV2.deploy()) as ClockV2;
    await StargateNFTClockLibV2.waitForDeployment();
    logOutput && console.log("ClockV2 Library deployed");

    // Deploy Levels Library
    const LevelsV2 = await ethers.getContractFactory("LevelsV2");
    const StargateNFTLevelsLibV2 = (await LevelsV2.deploy()) as LevelsV2;
    await StargateNFTLevelsLibV2.waitForDeployment();
    logOutput && console.log("LevelsV2 Library deployed");

    // Deploy MintingLogic Library
    const MintingLogicV2 = await ethers.getContractFactory("MintingLogicV2");
    const StargateNFTMintingLibV2 = (await MintingLogicV2.deploy()) as MintingLogicV2;
    await StargateNFTMintingLibV2.waitForDeployment();
    logOutput && console.log("MintingLogicV2 Library deployed");

    // Deploy Settings Library
    const SettingsV2 = await ethers.getContractFactory("SettingsV2");
    const StargateNFTSettingsLibV2 = (await SettingsV2.deploy()) as SettingsV2;
    await StargateNFTSettingsLibV2.waitForDeployment();
    logOutput && console.log("SettingsV2 Library deployed");

    // Deploy Token Library
    const TokenV2 = await ethers.getContractFactory("TokenV2");
    const StargateNFTTokenLibV2 = (await TokenV2.deploy()) as TokenV2;
    await StargateNFTTokenLibV2.waitForDeployment();
    logOutput && console.log("TokenV2 Library deployed");

    // Deploy VetGeneratedVtho Library
    const VetGeneratedVthoV2 = await ethers.getContractFactory("VetGeneratedVthoV2");
    const StargateNFTVetGeneratedVthoLibV2 =
        (await VetGeneratedVthoV2.deploy()) as VetGeneratedVthoV2;
    await StargateNFTVetGeneratedVthoLibV2.waitForDeployment();
    logOutput && console.log("VetGeneratedVthoV2 Library deployed");

    // ------------------- DEPRECATED VERSION ------------------- //
    // ------------------- V1 ------------------- //
    // Deploy Clock Library
    const ClockV1 = await ethers.getContractFactory("ClockV1");
    const StargateNFTClockLibV1 = (await ClockV1.deploy()) as ClockV1;
    await StargateNFTClockLibV1.waitForDeployment();
    logOutput && console.log("ClockV1 Library deployed");

    // Deploy Levels Library
    const LevelsV1 = await ethers.getContractFactory("LevelsV1");
    const StargateNFTLevelsLibV1 = (await LevelsV1.deploy()) as LevelsV1;
    await StargateNFTLevelsLibV1.waitForDeployment();
    logOutput && console.log("LevelsV1 Library deployed");

    // Deploy MintingLogic Library
    const MintingLogicV1 = await ethers.getContractFactory("MintingLogicV1");
    const StargateNFTMintingLibV1 = (await MintingLogicV1.deploy()) as MintingLogicV1;
    await StargateNFTMintingLibV1.waitForDeployment();
    logOutput && console.log("MintingLogicV1 Library deployed");

    // Deploy Settings Library
    const SettingsV1 = await ethers.getContractFactory("SettingsV1");
    const StargateNFTSettingsLibV1 = (await SettingsV1.deploy()) as SettingsV1;
    await StargateNFTSettingsLibV1.waitForDeployment();
    logOutput && console.log("SettingsV1 Library deployed");

    // Deploy Token Library
    const TokenV1 = await ethers.getContractFactory("TokenV1");
    const StargateNFTTokenLibV1 = (await TokenV1.deploy()) as TokenV1;
    await StargateNFTTokenLibV1.waitForDeployment();
    logOutput && console.log("TokenV1 Library deployed");

    // Deploy VetGeneratedVtho Library
    const VetGeneratedVthoV1 = await ethers.getContractFactory("VetGeneratedVthoV1");
    const StargateNFTVetGeneratedVthoLibV1 =
        (await VetGeneratedVthoV1.deploy()) as VetGeneratedVthoV1;
    await StargateNFTVetGeneratedVthoLibV1.waitForDeployment();
    logOutput && console.log("VetGeneratedVthoV1 Library deployed");

    return {
        // ------------------- LATEST VERSION ------------------- //
        StargateNFTClockLib,
        StargateNFTLevelsLib,
        StargateNFTMintingLib,
        StargateNFTSettingsLib,
        StargateNFTTokenLib,
        StargateNFTTokenManagerLib,
        // ------------------- DEPRECATED VERSION ------------------- //
        // ------------------- V2 ------------------- //
        StargateNFTClockLibV2,
        StargateNFTLevelsLibV2,
        StargateNFTMintingLibV2,
        StargateNFTSettingsLibV2,
        StargateNFTTokenLibV2,
        StargateNFTVetGeneratedVthoLibV2,
        // ------------------- V1 ------------------- //
        StargateNFTClockLibV1,
        StargateNFTLevelsLibV1,
        StargateNFTMintingLibV1,
        StargateNFTSettingsLibV1,
        StargateNFTTokenLibV1,
        StargateNFTVetGeneratedVthoLibV1,
    } as T["latestVersionOnly"] extends true ? StargateLatestLibraries : StargateLibraries;
}
