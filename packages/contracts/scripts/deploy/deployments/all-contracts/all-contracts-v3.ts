import { getConfig } from "@repo/config";
import { EnvConfig, getContractsConfig, StrengthLevel } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import { deployStargateNFTLibraries } from "../../libraries";
import {
    deployAndUpgrade,
    deployUpgradeableWithoutInitialization,
    initializeProxyAllVersions,
} from "../../../helpers";
import {
    NodeManagementV4,
    Stargate,
    StargateDelegation,
    StargateNFT,
} from "../../../../typechain-types";

type DeployedContractsAddresses = {
    TokenAuctionMock: string;
    ClockAuctionMock: string;
    NodeManagement: string;
    StargateNFT: string;
    Stargate: string;
};

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const contractsConfig = getContractsConfig(process.env.VITE_APP_ENV as EnvConfig);

    const appConfig = getConfig(process.env.VITE_APP_ENV as EnvConfig);

    console.log(`Deploying Stargate contract on network: ${appConfig.network.name}`);

    const [deployer, ...otherAccounts] = await ethers.getSigners();
    console.log(`👤 Deployer Address: ${deployer.address}`);
    console.log(
        "⚠️  TODO: Before mainnet we need to correctly setup deployer addresses and roles in the contracts"
    );

    const ADMIN_ADDRESS = deployer.address;
    console.log(`🔑 Admin Address: ${ADMIN_ADDRESS}`);

    // ---------------------- Deploy Mocks if not mainnet ----------------------
    let vechainNodesMockAddress, clockAuctionMockAddress;

    let vechainNodesMock = await ethers.getContractAt(
        "TokenAuction",
        contractsConfig.TOKEN_AUCTION_CONTRACT_ADDRESS
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
        vthoAddress = contractsConfig.VTHO_TOKEN_ADDRESS;
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
    (await initializeProxyAllVersions(
        "Stargate",
        stargateProxyAddress,
        [
            {
                args: [
                    {
                        admin: ADMIN_ADDRESS,
                        protocolStakerContract: getConfig().protocolStakerContractAddress,
                        stargateNFTContract: stargateNFTProxyAddress,
                        maxClaimablePeriods: contractsConfig.MAX_CLAIMABLE_PERIODS || 832,
                    },
                ],
            },
        ],
        false
    )) as Stargate;

    // For mainnet, grab WHITELIST_ENTRIES_V2 from config, otherwise set dummy whitelist entry
    const initV2Data = contractsConfig.WHITELIST_ENTRIES_V2.length
        ? contractsConfig.WHITELIST_ENTRIES_V2
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
                        baseTokenURI: contractsConfig.BASE_TOKEN_URI,
                        admin: ADMIN_ADDRESS,
                        upgrader: ADMIN_ADDRESS,
                        pauser: ADMIN_ADDRESS,
                        levelOperator: ADMIN_ADDRESS,
                        legacyNodes:
                            vechainNodesMockAddress ||
                            contractsConfig.TOKEN_AUCTION_CONTRACT_ADDRESS,
                        stargateDelegation: stargateDelegationProxyAddress,
                        legacyLastTokenId: contractsConfig.LEGACY_LAST_TOKEN_ID,
                        levelsAndSupplies: contractsConfig.TOKEN_LEVELS,
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
                        vthoRewardPerBlock: contractsConfig.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
                        delegationPeriod: contractsConfig.DELEGATION_PERIOD_DURATION,
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
        console.log("  🔧 Deploying NodeManagement (V1→V2→V3→V4)...");
        const nodeManagement = (await deployAndUpgrade(
            ["NodeManagementV1", "NodeManagementV2", "NodeManagementV3", "NodeManagementV4"],
            [
                [
                    vechainNodesMockAddress || contractsConfig.TOKEN_AUCTION_CONTRACT_ADDRESS,
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
        nodeManagementContractAddress = contractsConfig.NODE_MANAGEMENT_CONTRACT_ADDRESS;
        console.log("  ⚠️  TODO: Upgrade NodeManagement to version 4 on mainnet");
    }

    console.log("\n✅ Core Deployment Completed Successfully!");

    console.log("\n📋 Deployment Summary");
    console.log("=".repeat(60));

    const contractAddresses: DeployedContractsAddresses = {
        // Below addresses are deployed if not mainnet, hence the default
        TokenAuctionMock: vechainNodesMockAddress || contractsConfig.TOKEN_AUCTION_CONTRACT_ADDRESS,
        ClockAuctionMock: clockAuctionMockAddress || contractsConfig.CLOCK_AUCTION_CONTRACT_ADDRESS,
        NodeManagement: nodeManagementContractAddress,
        // Below addresses are deployed on all networks
        StargateNFT: stargateNFTProxyAddress,
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

    console.log("\n🎉 All Done! Deployment completed successfully!");
    console.log("=".repeat(60));
}

main();
