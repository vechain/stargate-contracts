import { ContractsConfig, StrengthLevel } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import {
    deployAndUpgrade,
    saveContractsToFile,
    addToken,
    parseTokenMetadata,
    deployUpgradeableWithoutInitialization,
    initializeProxyAllVersions,
} from "../helpers";
import { StargateNFT, StargateDelegation, NodeManagementV4, Stargate } from "../../typechain-types";
import { HttpNetworkConfig } from "hardhat/types";
import { deployStargateNFTLibraries } from "./libraries";
import { getConfig } from "@repo/config";

interface DeployedContractsAddresses {
    TokenAuctionMock: string;
    ClockAuctionMock: string;
    StargateNFT: string;
    StargateDelegation: string;
    NodeManagement: string;
    Stargate: string;
}

// TODO: refactor this script to be aligned with the Hayabusa release
export async function deployAll(config: ContractsConfig): Promise<DeployedContractsAddresses> {
    const start = performance.now();

    console.log("\n🚀 Starting Stargate Staking Contract Deployment");
    console.log("=".repeat(60));

    const networkConfig = network.config as HttpNetworkConfig;
    console.log(`🌐 Network: ${network.name}`);
    console.log(`🔗 URL: ${networkConfig.url}`);
    console.log(`⚙️  Environment: ${config.VITE_APP_ENV}`);

    const [deployer, ...otherAccounts] = await ethers.getSigners();
    console.log(`👤 Deployer Address: ${deployer.address}`);
    console.log(
        "⚠️  TODO: Before mainnet we need to correctly setup deployer addresses and roles in the contracts"
    );

    const ADMIN_ADDRESS = deployer.address;
    console.log(`🔑 Admin Address: ${ADMIN_ADDRESS}`);

    // ---------------------- Deploy Mocks if not mainnet ----------------------
    let vechainNodesMockAddress, clockAuctionMockAddress, erc721MockAddress, erc1155MockAddress;

    let vechainNodesMock = await ethers.getContractAt(
        "TokenAuction",
        config.TOKEN_AUCTION_CONTRACT_ADDRESS
    );

    const deployMocks = network.name !== "vechain_mainnet";
    if (deployMocks) {
        console.log("\n🎭 Deploying Mock Contracts");
        console.log("-".repeat(40));

        console.log("  📦 Deploying TokenAuction mock...");
        const TokenAuctionFactory = await ethers.getContractFactory("TokenAuction");
        vechainNodesMock = await TokenAuctionFactory.deploy();
        await vechainNodesMock.waitForDeployment();

        vechainNodesMockAddress = await vechainNodesMock.getAddress();
        console.log(`  ✅ TokenAuction deployed: ${vechainNodesMockAddress}`);

        console.log("  📦 Deploying ClockAuction mock...");
        const ClockAuctionFactory = await ethers.getContractFactory("ClockAuction");
        const clockAuctionMock = await ClockAuctionFactory.deploy(
            vechainNodesMockAddress,
            deployer.address
        );
        await clockAuctionMock.waitForDeployment();

        clockAuctionMockAddress = await clockAuctionMock.getAddress();
        console.log(`  ✅ ClockAuction deployed: ${clockAuctionMockAddress}`);

        console.log("  🔧 Configuring TokenAuction mock...");
        await vechainNodesMock.setSaleAuctionAddress(clockAuctionMockAddress);
        await vechainNodesMock.addOperator(deployer.address);
    }

    // If we are on hardhat, we need to deploy the VTHO token
    let vthoAddress;
    if (network.name === "hardhat") {
        console.log("\n💰 Deploying VTHO Token");
        console.log("-".repeat(40));

        const VTHOFactory = await ethers.getContractFactory("MyERC20");
        const vtho = await VTHOFactory.deploy(deployer.address, deployer.address);
        await vtho.waitForDeployment();

        vthoAddress = await vtho.getAddress();
        console.log(`  ✅ VTHO token deployed: ${vthoAddress}`);
    } else {
        vthoAddress = config.VTHO_TOKEN_ADDRESS;
        console.log(`\n💰 Using existing VTHO token: ${vthoAddress}`);
    }

    // ---------------------- Deploy Project contracts ----------------------
    console.log("\n🏗️  Deploying Stargate Contracts");
    console.log("-".repeat(40));

    console.log("  📚 Deploying StargateNFT libraries...");
    const {
        StargateNFTClockLib,
        StargateNFTLevelsLib,
        StargateNFTMintingLib,
        StargateNFTSettingsLib,
        StargateNFTTokenLib,
        StargateNFTTokenManagerLib,
    } = await deployStargateNFTLibraries({
        logOutput: true,
        latestVersionOnly: true,
    });

    console.log("  🎨 Deploying StargateNFT implementation...");
    const stargateNFTProxyAddress = await deployUpgradeableWithoutInitialization(
        "StargateNFT",
        {
            Clock: await StargateNFTClockLib.getAddress(),
            Levels: await StargateNFTLevelsLib.getAddress(),
            MintingLogic: await StargateNFTMintingLib.getAddress(),
            Settings: await StargateNFTSettingsLib.getAddress(),
            Token: await StargateNFTTokenLib.getAddress(),
            TokenManager: await StargateNFTTokenManagerLib.getAddress(),
        },
        true
    );
    console.log(`  ✅ StargateNFT proxy: ${stargateNFTProxyAddress}`);

    console.log("  🤝 Deploying StargateDelegation implementation...");
    const stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
        "StargateDelegation",
        {},
        true
    );
    console.log(`  ✅ StargateDelegation proxy: ${stargateDelegationProxyAddress}`);

    console.log("  🥩 Deploying Stargate proxy...");
    const stargateProxyAddress = await deployUpgradeableWithoutInitialization(
        "Stargate",
        {
            Clock: await StargateNFTClockLib.getAddress(),
        },
        false
    );
    console.log(`  ✅ Stargate proxy: ${stargateProxyAddress}`);

    console.log("\n🔧 Initializing Contract Proxies");
    console.log("-".repeat(40));

    console.log("  ⚡ Initializing Stargate...");
    const stargate = (await initializeProxyAllVersions(
        "Stargate",
        stargateProxyAddress,
        [
            {
                args: [
                    {
                        admin: ADMIN_ADDRESS,
                        protocolStakerContract: getConfig().protocolStakerContractAddress,
                        stargateNFTContract: stargateNFTProxyAddress,
                        maxClaimablePeriods: config.MAX_CLAIMABLE_PERIODS || 832,
                    },
                ],
            },
        ],
        false
    )) as Stargate;

    // For mainnet, grab WHITELIST_ENTRIES_V2 from config, otherwise set dummy whitelist entry
    const initV2Data = config.WHITELIST_ENTRIES_V2.length
        ? config.WHITELIST_ENTRIES_V2
        : [
              {
                  owner: otherAccounts[7].address,
                  tokenId: 777,
                  levelId: StrengthLevel.MjolnirX,
              },
          ];

    console.log("  ⚡ Initializing StargateNFT (all versions)...");
    (await initializeProxyAllVersions(
        "StargateNFT",
        stargateNFTProxyAddress,
        [
            {
                args: [
                    {
                        tokenCollectionName: "StarGate Delegator Token",
                        tokenCollectionSymbol: "SDT",
                        baseTokenURI: config.BASE_TOKEN_URI,
                        admin: ADMIN_ADDRESS,
                        upgrader: ADMIN_ADDRESS,
                        pauser: ADMIN_ADDRESS,
                        levelOperator: ADMIN_ADDRESS,
                        legacyNodes:
                            vechainNodesMockAddress || config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                        stargateDelegation: stargateDelegationProxyAddress,
                        legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                        levelsAndSupplies: config.TOKEN_LEVELS,
                        vthoToken: vthoAddress,
                    },
                ],
            }, // V1
            {
                args: [initV2Data],
                version: 2,
            },
            {
                args: [stargateProxyAddress],
                version: 3,
            },
        ],
        true
    )) as StargateNFT;

    console.log("  ⚡ Initializing StargateDelegation (all versions)...");
    (await initializeProxyAllVersions(
        "StargateDelegation",
        stargateDelegationProxyAddress,
        [
            {
                args: [
                    {
                        upgrader: ADMIN_ADDRESS,
                        admin: ADMIN_ADDRESS,
                        stargateNFT: stargateNFTProxyAddress,
                        vthoToken: vthoAddress,
                        vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
                        delegationPeriod: config.DELEGATION_PERIOD_DURATION,
                        operator: ADMIN_ADDRESS,
                    },
                ],
            }, // V1
            {
                args: [deployer.address],
                version: 3,
            },
        ],
        true
    )) as StargateDelegation;

    // WARNING: The NodeManagement contract is already deployed in production, with current version 2,
    // so we deploy it only on testnet and local, while on mainnet we upgrade to version 3
    let nodeManagementContractAddress;
    if (network.name !== "vechain_mainnet") {
        console.log("  🔧 Deploying NodeManagement (V1→V2→V3)...");
        const nodeManagement = (await deployAndUpgrade(
            ["NodeManagementV1", "NodeManagementV2", "NodeManagementV3", "NodeManagementV4"],
            [
                [
                    vechainNodesMockAddress || config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                    deployer.address,
                    deployer.address,
                ],
                [],
                [stargateNFTProxyAddress],
                [],
            ],
            {
                versions: [undefined, 2, 3, 4],
                logOutput: true,
            }
        )) as NodeManagementV4;
        nodeManagementContractAddress = await nodeManagement.getAddress();
        console.log(`  ✅ NodeManagement deployed: ${nodeManagementContractAddress}`);
    } else {
        nodeManagementContractAddress = config.NODE_MANAGEMENT_CONTRACT_ADDRESS;
        console.log("  ⚠️  TODO: Upgrade NodeManagement to version 3 on mainnet");
    }

    console.log("\n✅ Core Deployment Completed Successfully!");

    if (network.name !== "vechain_mainnet") {
        console.log("\n🌱 Seeding Development Environment");
        console.log("-".repeat(40));

        console.log("  [1/4] 🎨 Minting legacy NFTs...");
        await Promise.all([
            addToken(vechainNodesMock, otherAccounts[0].address, StrengthLevel.Strength, false), // Strength, not upgrading
            addToken(vechainNodesMock, otherAccounts[1].address, StrengthLevel.VeThorX, false), // VeThorX, not upgrading
            addToken(vechainNodesMock, otherAccounts[2].address, StrengthLevel.Mjolnir, false), // Mjolnir, not upgrading
            addToken(vechainNodesMock, otherAccounts[3].address, StrengthLevel.StrengthX, false), // StrengthX, not upgrading
            addToken(vechainNodesMock, otherAccounts[4].address, StrengthLevel.Strength, true), // Strength, upgrading
            addToken(vechainNodesMock, otherAccounts[5].address, StrengthLevel.Thunder, false), // Thunder, not upgrading
            addToken(vechainNodesMock, otherAccounts[6].address, StrengthLevel.MjolnirX, false), // MjolnirX is the max level!
        ]);

        console.log("  📊 Token distribution summary:");
        const tokenIds = [1, 2, 3, 4, 5, 6, 7];
        for (const tokenId of tokenIds) {
            const tokenMetadata = await vechainNodesMock.getMetadata(tokenId);
            const metadataParsed = parseTokenMetadata(tokenMetadata);
            console.log(
                `    • Token #${tokenId}: ${otherAccounts[tokenId - 1].address.slice(0, 8)}... | Level ${metadataParsed.level} | Upgrading: ${metadataParsed.onUpgrade}`
            );
        }

        console.log("  [2/4] ⏰ Setting lead time to 0 on Legacy Token Auction...");
        await vechainNodesMock.setLeadTime(0);
        console.log("    ✅ Lead time configured");

        console.log("  [3/4] 👤 Setting StargateNFT as operator of Legacy Token Auction...");
        await vechainNodesMock.addOperator(stargateNFTProxyAddress);
        console.log("    ✅ Operator permissions granted");

        console.log("  [4/4] 💰 Depositing VTHO to StargateDelegation...");
        try {
            const vthoToken = await ethers.getContractAt("MyERC20", vthoAddress);
            if (network.name === "hardhat") {
                await vthoToken.mint(
                    stargateDelegationProxyAddress,
                    ethers.parseUnits("1000000000000000000000")
                );
                console.log(
                    "    ✅ 1,000,000,000,000,000,000,000 VTHO minted to StargateDelegation"
                );
            } else if (network.name === "vechain_testnet" || network.name === "vechain_solo") {
                console.log("    ℹ️  VTHO comes from protocol - no transfer needed");
            }
        } catch (error) {
            console.error("    ❌ Error depositing VTHO:", error);
            console.log("    ⚠️  Continuing with deployment...");
        }
    }

    if (network.name === "vechain_solo") {
        console.log("\n⚙️  Configuring VeChain Solo Protocol");
        console.log("-".repeat(40));

        const protocolParamsContract = await ethers.getContractAt(
            "IProtocolParams",
            getConfig().protocolParamsContractAddress
        );

        console.log("  🔧 Setting Stargate as delegator contract...");
        // Set Stargate contract address in the protocol params contract
        // https://github.com/vechain/thor/blob/06b06a4dc759661e1681ccfb02f930604f221ad3/thor/params.go#L64
        // delegator-contract-address -> 0x00000000000064656c656761746f722d636f6e74726163742d61646472657373
        const paramsKey = ethers.zeroPadValue(ethers.toUtf8Bytes("delegator-contract-address"), 32);
        const paramsVal = BigInt(stargateProxyAddress);
        await protocolParamsContract.set(paramsKey, paramsVal);
        console.log("    ✅ Protocol parameter configured");
    }

    const deploymentDuration = performance.now() - start;
    const minutes = Math.floor(deploymentDuration / 60000);
    const seconds = Math.floor((deploymentDuration % 60000) / 1000);

    console.log("\n📋 Deployment Summary");
    console.log("=".repeat(60));

    const contractAddresses: DeployedContractsAddresses = {
        // Below addresses are deployed if not mainnet, hence the default
        TokenAuctionMock: vechainNodesMockAddress || config.TOKEN_AUCTION_CONTRACT_ADDRESS,
        ClockAuctionMock: clockAuctionMockAddress || config.CLOCK_AUCTION_CONTRACT_ADDRESS,
        NodeManagement: nodeManagementContractAddress,
        // Below addresses are deployed on all networks
        StargateNFT: stargateNFTProxyAddress,
        StargateDelegation: stargateDelegationProxyAddress,
        Stargate: stargateProxyAddress,
    };

    console.log("📍 Contract Addresses:");
    Object.entries(contractAddresses).forEach(([name, address]) => {
        if (address !== ethers.ZeroAddress) {
            console.log(`  • ${name}: ${address}`);
        }
    });

    const libraries = {
        StargateNFTClockLib: await StargateNFTClockLib.getAddress(),
        StargateNFTSettingsLib: await StargateNFTSettingsLib.getAddress(),
        StargateNFTTokenLib: await StargateNFTTokenLib.getAddress(),
        StargateNFTMintingLib: await StargateNFTMintingLib.getAddress(),
        StargateNFTLevelsLib: await StargateNFTLevelsLib.getAddress(),
        StargateNFTTokenManagerLib: await StargateNFTTokenManagerLib.getAddress(),
    };

    console.log("\n📚 Library Addresses:");
    Object.entries(libraries).forEach(([name, address]) => {
        console.log(`  • ${name}: ${address}`);
    });

    console.log(`\n⏱️  Total deployment time: ${minutes}m ${seconds}s`);

    await saveContractsToFile(contractAddresses as unknown as Record<string, string>, libraries);
    console.log("💾 Contract addresses saved to file");

    console.log("\n🎉 All Done! Deployment completed successfully!");
    console.log("=".repeat(60));

    return contractAddresses;
}
