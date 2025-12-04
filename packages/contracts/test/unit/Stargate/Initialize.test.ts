import { Stargate, Stargate__factory } from "../../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, expect } from "hardhat";
import { deployUpgradeableWithoutInitialization, initializeProxy } from "../../../scripts/helpers";
import {
    deployStargateNFTLibraries,
    StargateLatestLibraries,
} from "../../../scripts/deploy/libraries";
import { ZeroAddress } from "ethers";

describe("shard-u9: Stargate: Initialize", () => {
    let stargateContract: Stargate;
    let libraries: StargateLatestLibraries;
    let stargateProxyAddress: string;

    let deployer: HardhatEthersSigner;
    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        libraries = await deployStargateNFTLibraries({
            latestVersionOnly: true,
        });
        stargateProxyAddress = await deployUpgradeableWithoutInitialization(
            "Stargate",
            {
                Clock: await libraries.StargateNFTClockLib.getAddress(),
            },
            false
        );
        stargateContract = Stargate__factory.connect(stargateProxyAddress, deployer);
    });

    describe("V1", () => {
        it("should initialize v1 of the contract", async () => {
            await expect(
                initializeProxy(
                    stargateProxyAddress,
                    "Stargate",
                    [
                        {
                            admin: deployer.address,
                            protocolStakerContract: deployer.address,
                            stargateNFTContract: deployer.address,
                            maxClaimablePeriods: 832,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                    }
                )
            ).to.not.be.reverted;
        });
        it("should fail to initialize v1 of the contract because the admin address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateProxyAddress,
                    "Stargate",
                    [
                        {
                            admin: ZeroAddress,
                            protocolStakerContract: deployer.address,
                            stargateNFTContract: deployer.address,
                            maxClaimablePeriods: 832,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateContract, "InvalidInitializationParams");
        });
        it("should fail to initialize v1 of the contract because the protocol staker contract address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateProxyAddress,
                    "Stargate",
                    [
                        {
                            admin: deployer.address,
                            protocolStakerContract: ZeroAddress,
                            stargateNFTContract: deployer.address,
                            maxClaimablePeriods: 832,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateContract, "InvalidInitializationParams");
        });
        it("should fail to initialize v1 of the contract because the stargate nft contract address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateProxyAddress,
                    "Stargate",
                    [
                        {
                            admin: deployer.address,
                            protocolStakerContract: deployer.address,
                            stargateNFTContract: ZeroAddress,
                            maxClaimablePeriods: 832,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateContract, "InvalidInitializationParams");
        });
        it("should fail to initialize v1 of the contract because the max claimable periods is zero", async () => {
            await expect(
                initializeProxy(
                    stargateProxyAddress,
                    "Stargate",
                    [
                        {
                            admin: deployer.address,
                            protocolStakerContract: deployer.address,
                            stargateNFTContract: deployer.address,
                            maxClaimablePeriods: 0,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateContract, "InvalidInitializationParams");
        });
    });
});
