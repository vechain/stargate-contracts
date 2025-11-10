import { ethers } from "hardhat";
import { StargateNFT, StargateNFT__factory, StargateNFTV2 } from "../../typechain-types";
import { deployStargateNFTLibraries } from "../../scripts/deploy/libraries";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { BytesLike } from "ethers";

export async function upgradeStargateNFTV2ToV3(
    deployer: HardhatEthersSigner,
    initializerData: BytesLike,
    stargateNFTV2Contract: StargateNFTV2
): Promise<StargateNFT> {
    const libraries = await deployStargateNFTLibraries({ logOutput: false });

    const StargateNFTFactory = await ethers.getContractFactory("StargateNFT", {
        libraries: {
            Clock: await libraries.StargateNFTClockLib.getAddress(),
            MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
            Settings: await libraries.StargateNFTSettingsLib.getAddress(),
            Token: await libraries.StargateNFTTokenLib.getAddress(),
            Levels: await libraries.StargateNFTLevelsLib.getAddress(),
            TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
        },
    });

    const newImplementation = await StargateNFTFactory.deploy();
    await newImplementation.waitForDeployment();

    const newImplementationAddress = await newImplementation.getAddress();

    const upgradeTx = await stargateNFTV2Contract.upgradeToAndCall(
        newImplementationAddress,
        initializerData
    );

    await upgradeTx.wait();

    return (await StargateNFTFactory.attach(stargateNFTV2Contract)) as StargateNFT;
}
