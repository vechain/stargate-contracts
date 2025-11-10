import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { deployUpgradeableWithoutInitialization, initializeProxy } from "../../../scripts/helpers";
import {
    StargateNFT,
    StargateNFT__factory,
    TokenAuctionMock,
    TokenAuctionMock__factory,
} from "../../../typechain-types";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
    deployStargateNFTLibraries,
    StargateLatestLibraries,
} from "../../../scripts/deploy/libraries";
import { expect } from "chai";
import { ZeroAddress } from "ethers";

describe("shard-u111: StargateNFT: Initialize", () => {
    const config = createLocalConfig();
    let deployer: HardhatEthersSigner;
    let stargateNFTProxyAddress: string;
    let libraries: StargateLatestLibraries;
    let legacyNodesMock: TokenAuctionMock;
    let stargateNFTContract: StargateNFT;
    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        const legacyNodesMockFactory = new TokenAuctionMock__factory(deployer);
        legacyNodesMock = await legacyNodesMockFactory.deploy();
        await legacyNodesMock.waitForDeployment();
        config.TOKEN_AUCTION_CONTRACT_ADDRESS = await legacyNodesMock.getAddress();
        libraries = await deployStargateNFTLibraries({
            latestVersionOnly: true,
        });
        stargateNFTProxyAddress = await deployUpgradeableWithoutInitialization(
            "StargateNFT",
            {
                Clock: await libraries.StargateNFTClockLib.getAddress(),
                Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                Token: await libraries.StargateNFTTokenLib.getAddress(),
                TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
            },
            false
        );
        stargateNFTContract = StargateNFT__factory.connect(stargateNFTProxyAddress, deployer);
    });

    describe("V1", () => {
        it("should initialize v1 of the contract", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.not.be.reverted;
        });
        it("should fail to initialize v1 of the contract because the admin address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: ZeroAddress,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "AddressCannotBeZero");
        });
        it("should fail to initialize v1 of the contract because the upgrader address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: ZeroAddress,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "AddressCannotBeZero");
        });
        it("should fail to initialize v1 of the contract because the pauser address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: ZeroAddress,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "AddressCannotBeZero");
        });
        it("should fail to initialize v1 of the contract because the level operator address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: ZeroAddress,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "AddressCannotBeZero");
        });

        it("should fail to initialize v1 of the contract because the legacy nodes address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: ZeroAddress,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "AddressCannotBeZero");
        });
        it("should fail to initialize v1 of the contract because the stargate delegation address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: ZeroAddress,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "AddressCannotBeZero");
        });
        it("should fail to initialize v1 of the contract because the vtho token address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: ZeroAddress,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "AddressCannotBeZero");
        });
        it("should fail to initialize v1 of the contract because the token collection name is empty", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "StringCannotBeEmpty");
        });
        it("should fail to initialize v1 of the contract because the token collection symbol is empty", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "StringCannotBeEmpty");
        });
        it("should fail to initialize v1 of the contract because the base token URI is empty", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: "",
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "StringCannotBeEmpty");
        });
        it("should fail to initialize v1 of the contract because the legacy last token id is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: 0,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "ValueCannotBeZero");
        });
        it("should fail to initialize v1 of the contract because the levels and supplies is empty", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: deployer.address,
                            upgrader: deployer.address,
                            pauser: deployer.address,
                            levelOperator: deployer.address,
                            legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: deployer.address,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: [],
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    }
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "ArrayCannotHaveZeroLength");
        });
    });
    describe("V2", () => {
        beforeEach(async () => {
            // initialize v1 of the contract
            await initializeProxy(
                stargateNFTProxyAddress,
                "StargateNFT",
                [
                    {
                        tokenCollectionName: "StarGate Delegator Token",
                        tokenCollectionSymbol: "SDT",
                        baseTokenURI: config.BASE_TOKEN_URI,
                        admin: deployer.address,
                        upgrader: deployer.address,
                        pauser: deployer.address,
                        levelOperator: deployer.address,
                        legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                        stargateDelegation: deployer.address,
                        legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                        levelsAndSupplies: config.TOKEN_LEVELS,
                        vthoToken: config.VTHO_TOKEN_ADDRESS,
                    },
                ],
                {
                    Clock: await libraries.StargateNFTClockLib.getAddress(),
                    Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                    MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                    Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                    Token: await libraries.StargateNFTTokenLib.getAddress(),
                    TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                }
            );
            const upgraderRole = await stargateNFTContract.UPGRADER_ROLE();
            await stargateNFTContract.grantRole(upgraderRole, deployer.address);
        });
        it("should initialize v2 of the contract", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [[]],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    },
                    2
                )
            ).to.not.be.reverted;
        });
    });
    describe("V3", () => {
        beforeEach(async () => {
            // initialize v1 of the contract
            await initializeProxy(
                stargateNFTProxyAddress,
                "StargateNFT",
                [
                    {
                        tokenCollectionName: "StarGate Delegator Token",
                        tokenCollectionSymbol: "SDT",
                        baseTokenURI: config.BASE_TOKEN_URI,
                        admin: deployer.address,
                        upgrader: deployer.address,
                        pauser: deployer.address,
                        levelOperator: deployer.address,
                        legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                        stargateDelegation: deployer.address,
                        legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                        levelsAndSupplies: config.TOKEN_LEVELS,
                        vthoToken: config.VTHO_TOKEN_ADDRESS,
                    },
                ],
                {
                    Clock: await libraries.StargateNFTClockLib.getAddress(),
                    Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                    MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                    Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                    Token: await libraries.StargateNFTTokenLib.getAddress(),
                    TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                }
            );
            const upgraderRole = await stargateNFTContract.UPGRADER_ROLE();
            await stargateNFTContract.grantRole(upgraderRole, deployer.address);

            // initialize v2 of the contract
            initializeProxy(
                stargateNFTProxyAddress,
                "StargateNFT",
                [[]],
                {
                    Clock: await libraries.StargateNFTClockLib.getAddress(),
                    Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                    MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                    Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                    Token: await libraries.StargateNFTTokenLib.getAddress(),
                    TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                },
                2
            );
        });
        it("should initialize v3 of the contract", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        deployer.address,
                        config.STARGATE_NFT_BOOST_LEVEL_IDS,
                        config.STARGATE_NFT_BOOST_PRICES_PER_BLOCK,
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    },
                    3
                )
            ).to.not.be.reverted;
        });

        it("should fail to initialize v3 of the contract because the stargate address is zero", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        ZeroAddress,
                        config.STARGATE_NFT_BOOST_LEVEL_IDS,
                        config.STARGATE_NFT_BOOST_PRICES_PER_BLOCK,
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    },
                    3
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "AddressCannotBeZero");
        });
        it("should fail to initialize v3 of the contract because the level ids and prices per block are different lengths", async () => {
            await expect(
                initializeProxy(
                    stargateNFTProxyAddress,
                    "StargateNFT",
                    [
                        deployer.address,
                        [...config.STARGATE_NFT_BOOST_LEVEL_IDS!, 15],
                        config.STARGATE_NFT_BOOST_PRICES_PER_BLOCK,
                    ],
                    {
                        Clock: await libraries.StargateNFTClockLib.getAddress(),
                        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
                        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
                        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
                        Token: await libraries.StargateNFTTokenLib.getAddress(),
                        TokenManager: await libraries.StargateNFTTokenManagerLib.getAddress(),
                    },
                    3
                )
            ).to.be.revertedWithCustomError(stargateNFTContract, "ArraysLengthMismatch");
        });
    });
});
