import { ethers } from "hardhat";
import { deployStargateNFTLibraries } from "../deploy/libraries";
import {
    deployAndUpgrade,
    deployUpgradeableWithoutInitialization,
    initializeProxyAllVersions,
} from "../helpers/upgrades";
import {
    NodeManagementV3,
    StargateDelegation,
    StargateNFTV2,
    TokenAuction,
    ClockAuction,
    MyERC20,
} from "../../typechain-types";
import { ContractsConfig, StrengthLevel, TokenLevelId } from "@repo/config/contracts";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { log, saveContractsToFile } from "../helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { mineBlocks } from "../../test/helpers";
import { TransactionResponse } from "ethers";

type Contracts = {
    legacyNodesContract: TokenAuction;
    clockAuctionContract: ClockAuction;
    stargateNFTV2Contract: StargateNFTV2;
    stargateDelegationV3Contract: StargateDelegation;
    nodeManagementV3Contract: NodeManagementV3;
    vthoContract: MyERC20;
    deployer: HardhatEthersSigner;
    otherAccounts: HardhatEthersSigner[];
};

type DeployedContractsAddresses = {
    TokenAuctionMock: string;
    ClockAuctionMock: string;
    StargateNFT: string;
    StargateDelegation: string;
    NodeManagement: string;
};

async function main() {
    const config = createLocalConfig();
    const contracts = await deployV2Contracts(config);
    await simulateNetworkUsage(contracts);
}

async function simulateNetworkUsage(contracts: Contracts) {
    let tx: TransactionResponse;
    const {
        legacyNodesContract,
        stargateNFTV2Contract,
        nodeManagementV3Contract,
        vthoContract,
        deployer,
        otherAccounts,
        stargateDelegationV3Contract,
    } = contracts;

    const user1 = otherAccounts[0];
    const user2 = otherAccounts[1];
    const user3 = otherAccounts[2];
    const user4 = otherAccounts[3];
    const user5 = otherAccounts[4];

    log("\n💰 Sending VET and VTHO tokens to the users");
    // transfer VET and VTHO from deployer to users
    await Promise.all([
        deployer.sendTransaction({
            to: user1.address,
            value: ethers.parseEther("100000000"),
        }),
        deployer.sendTransaction({
            to: user2.address,
            value: ethers.parseEther("100000000"),
        }),
        deployer.sendTransaction({
            to: user3.address,
            value: ethers.parseEther("100000000"),
        }),
        deployer.sendTransaction({
            to: user4.address,
            value: ethers.parseEther("100000000"),
        }),
        deployer.sendTransaction({
            to: user5.address,
            value: ethers.parseEther("100000000"),
        }),
        vthoContract.connect(deployer).transfer(user1.address, ethers.parseEther("100000000")),
        vthoContract.connect(deployer).transfer(user2.address, ethers.parseEther("100000000")),
        vthoContract.connect(deployer).transfer(user3.address, ethers.parseEther("100000000")),
        vthoContract.connect(deployer).transfer(user4.address, ethers.parseEther("100000000")),
        vthoContract.connect(deployer).transfer(user5.address, ethers.parseEther("100000000")),
        // transfer VTHO to stargateNFTV2Contract so it can pay VET generated VTHO rewards
        vthoContract
            .connect(deployer)
            .transfer(stargateDelegationV3Contract, ethers.parseEther("100000000")),
    ]);
    log("\n✅ Sent VET and VTHO tokens to the users");
    await Promise.all([
        legacyNodesContract
            .connect(deployer)
            .addToken(user1.address, StrengthLevel.MjolnirX, false, 0, 0),
        legacyNodesContract
            .connect(deployer)
            .addToken(user2.address, StrengthLevel.Strength, false, 0, 0),
    ]);
    log("\n✅ Minted legacy nodes to User1 and User2");

    await mineBlocks(10);

    const levelSpecDawn = await stargateNFTV2Contract.getLevel(TokenLevelId.Dawn);
    const levelSpecLightning = await stargateNFTV2Contract.getLevel(TokenLevelId.Lightning);
    const levelSpecFlash = await stargateNFTV2Contract.getLevel(TokenLevelId.Flash);
    const levelSpecThunder = await stargateNFTV2Contract.getLevel(TokenLevelId.Thunder);
    const levelSpecStrength = await stargateNFTV2Contract.getLevel(TokenLevelId.Strength);
    const levelSpecMjolnir = await stargateNFTV2Contract.getLevel(TokenLevelId.Mjolnir);
    // user 1 stakes a dawn nft
    tx = await stargateNFTV2Contract.connect(user1).stakeAndDelegate(levelSpecStrength.id, true, {
        value: levelSpecStrength.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a dawn nft to user 1");

    // user 1 stakes a lightning nft
    tx = await stargateNFTV2Contract.connect(user1).stakeAndDelegate(levelSpecLightning.id, true, {
        value: levelSpecLightning.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a lightning nft to user 1");

    // user 2 stakes a thunder nft
    tx = await stargateNFTV2Contract.connect(user2).stakeAndDelegate(levelSpecThunder.id, true, {
        value: levelSpecThunder.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();

    log("\n✅ Staked a thunder nft to user 2");
    tx = await stargateNFTV2Contract.connect(user2).stakeAndDelegate(levelSpecFlash.id, true, {
        value: levelSpecFlash.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();

    log("\n✅ Staked a strength nft to user 3");
    tx = await stargateNFTV2Contract.connect(user3).stakeAndDelegate(levelSpecMjolnir.id, true, {
        value: levelSpecMjolnir.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();

    log("\n✅ Staked a mjolnir nft to user 3");
    tx = await stargateNFTV2Contract.connect(user3).stakeAndDelegate(levelSpecMjolnir.id, true, {
        value: levelSpecMjolnir.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a mjolnir nft to user 3");
    tx = await stargateNFTV2Contract.connect(user3).stakeAndDelegate(levelSpecDawn.id, true, {
        value: levelSpecDawn.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a dawn nft to user 3");

    tx = await stargateNFTV2Contract.connect(user4).stakeAndDelegate(levelSpecDawn.id, true, {
        value: levelSpecDawn.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a dawn nft to user 4");
    tx = await stargateNFTV2Contract.connect(user4).stakeAndDelegate(levelSpecLightning.id, true, {
        value: levelSpecLightning.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a lightning nft to user 4");
    tx = await stargateNFTV2Contract.connect(user4).stakeAndDelegate(levelSpecDawn.id, true, {
        value: levelSpecDawn.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a dawn nft to user 5");
    tx = await stargateNFTV2Contract.connect(user5).stakeAndDelegate(levelSpecDawn.id, true, {
        value: levelSpecDawn.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a dawn nft to user 5");
    tx = await stargateNFTV2Contract.connect(user5).stakeAndDelegate(levelSpecLightning.id, true, {
        value: levelSpecLightning.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a lightning nft to user 5");
    tx = await stargateNFTV2Contract.connect(user5).stakeAndDelegate(levelSpecDawn.id, true, {
        value: levelSpecDawn.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Staked a dawn nft to user 5");

    log("\n🚀 Fast-forwarding to ensure all nfts are mature and generating rewards");
    // ensure all nfts are mature and generating rewards
    await mineBlocks(2 * Number(levelSpecMjolnir.maturityBlocks));

    // add node managers for user 5 token ids
    const user5TokenIds = await stargateNFTV2Contract.idsOwnedBy(user5.address);
    for (const tokenId of user5TokenIds) {
        await nodeManagementV3Contract.connect(user5).delegateNode(user4.address, tokenId);
    }
    log("\n✅ Added node managers for user 5 token ids");

    // add node managers for user 4 token ids
    const user4TokenIds = await stargateNFTV2Contract.idsOwnedBy(user4.address);
    for (const tokenId of user4TokenIds) {
        await nodeManagementV3Contract.connect(user4).delegateNode(user3.address, tokenId);
    }
    log("\n✅ Added node managers for user 4 token ids");

    // migrate legacy node from user 1
    log("\n🚀 Migrating legacy node from user 1");

    const legacyTokenId = await legacyNodesContract.ownerToId(user1.address);
    const mjolnirXLevelSpec = await stargateNFTV2Contract.getLevel(TokenLevelId.MjolnirX);

    await stargateNFTV2Contract.connect(user1).migrate(legacyTokenId, {
        value: mjolnirXLevelSpec.vetAmountRequiredToStake,
        gasLimit: 10_000_000,
    });
    await tx.wait();
    log("\n✅ Migrated and delegated a legacy node to user 1");

    log("\n Local environment succesfully set up");
}

async function deployV2Contracts(config: ContractsConfig): Promise<Contracts> {
    const [deployer, ...otherAccounts] = await ethers.getSigners();

    log("📋 Deployer", deployer.address);
    log(
        "📋 Other accounts",
        otherAccounts.map((account) => account.address)
    );
    config.CONTRACTS_ADMIN_ADDRESS = deployer.address;
    log("📋 Config contracts admin address", config.CONTRACTS_ADMIN_ADDRESS);
    // deploy legacy nodes
    const LegacyNodesFactory = await ethers.getContractFactory("TokenAuction");
    const legacyNodesContract = await LegacyNodesFactory.deploy();
    await legacyNodesContract.waitForDeployment();
    const legacyNodesContractAddress = await legacyNodesContract.getAddress();

    log("\n✅ Deployed legacy nodes contract", legacyNodesContractAddress);

    // deploy clock auction
    const ClockAuctionFactory = await ethers.getContractFactory("ClockAuction");
    const clockAuctionContract = await ClockAuctionFactory.deploy(
        legacyNodesContractAddress,
        deployer.address
    );
    await clockAuctionContract.waitForDeployment();
    const clockAuctionContractAddress = await clockAuctionContract.getAddress();

    log("\n✅ Deployed clock auction contract", clockAuctionContractAddress);

    // configure legacy nodes
    await legacyNodesContract.setSaleAuctionAddress(clockAuctionContractAddress);
    await legacyNodesContract.addOperator(deployer.address);

    // Set the transfer cooldown and lead time to 0 to avoid the need to wait for them
    await legacyNodesContract.setTransferCooldown(0);
    await legacyNodesContract.setLeadTime(0);

    log("\n✅ Configured legacy nodes contract");
    log("⚙️ Sale auction address set to", clockAuctionContractAddress);
    log("⚙️ Operator added to legacy nodes contract", deployer.address);
    log("⚙️ Transfer cooldown set to 0");
    log("⚙️ Lead time set to 0");

    // Deploys the v2 libraries
    const {
        StargateNFTClockLibV2,
        StargateNFTLevelsLibV2,
        StargateNFTMintingLibV2,
        StargateNFTSettingsLibV2,
        StargateNFTTokenLibV2,
        StargateNFTVetGeneratedVthoLibV2,
    } = await deployStargateNFTLibraries({ latestVersionOnly: false });

    log("\n✅ Deployed v2 libraries");
    log("📋 StargateNFTClockLibV2", await StargateNFTClockLibV2.getAddress());
    log("📋 StargateNFTLevelsLibV2", await StargateNFTLevelsLibV2.getAddress());
    log("📋 StargateNFTMintingLibV2", await StargateNFTMintingLibV2.getAddress());
    log("📋 StargateNFTSettingsLibV2", await StargateNFTSettingsLibV2.getAddress());
    log("📋 StargateNFTTokenLibV2", await StargateNFTTokenLibV2.getAddress());
    log("📋 StargateNFTVetGeneratedVthoLibV2", await StargateNFTVetGeneratedVthoLibV2.getAddress());

    // deploy stargateDelegation v2 proxy

    const stargateNFTV2ProxyAddress = await deployUpgradeableWithoutInitialization(
        "StargateNFTV2",
        {
            ClockV2: await StargateNFTClockLibV2.getAddress(),
            LevelsV2: await StargateNFTLevelsLibV2.getAddress(),
            MintingLogicV2: await StargateNFTMintingLibV2.getAddress(),
            SettingsV2: await StargateNFTSettingsLibV2.getAddress(),
            TokenV2: await StargateNFTTokenLibV2.getAddress(),
            VetGeneratedVthoV2: await StargateNFTVetGeneratedVthoLibV2.getAddress(),
        },
        false
    );

    log("\n✅ Deployed stargateNFTV2 proxy", stargateNFTV2ProxyAddress);

    // deploy stargateDelegation v3 proxy
    // the contract is deprecated, but we didnt
    // update the contract name to StargateDelegationV3
    const stargateDelegationV3ProxyAddress = await deployUpgradeableWithoutInitialization(
        "StargateDelegation",
        {},
        false
    );

    log("\n✅ Deployed stargateDelegationV3 proxy", stargateDelegationV3ProxyAddress);

    // initialize stargateNFT v2
    const stargateNFTV2Contract = (await initializeProxyAllVersions(
        "StargateNFTV2",
        stargateNFTV2ProxyAddress,
        [
            {
                args: [
                    {
                        tokenCollectionName: "StarGate Delegator Token",
                        tokenCollectionSymbol: "SDT",
                        baseTokenURI: config.BASE_TOKEN_URI,
                        admin: config.CONTRACTS_ADMIN_ADDRESS,
                        upgrader: config.CONTRACTS_ADMIN_ADDRESS,
                        pauser: config.CONTRACTS_ADMIN_ADDRESS,
                        levelOperator: config.CONTRACTS_ADMIN_ADDRESS,
                        legacyNodes: legacyNodesContractAddress,
                        stargateDelegation: stargateDelegationV3ProxyAddress,
                        legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                        levelsAndSupplies: config.TOKEN_LEVELS,
                        vthoToken: config.VTHO_TOKEN_ADDRESS,
                    },
                ],
            }, // V1
            {
                args: [config.WHITELIST_ENTRIES_V2],
                version: 2,
            },
        ],
        false
    )) as StargateNFTV2;

    log("\n✅ Initialized stargateNFTV2 contract", await stargateNFTV2Contract.getAddress());

    // initialize stargateDelegation v3
    const stargateDelegationV3Contract = (await initializeProxyAllVersions(
        "StargateDelegation",
        stargateDelegationV3ProxyAddress,
        [
            {
                args: [
                    {
                        upgrader: config.CONTRACTS_ADMIN_ADDRESS,
                        admin: config.CONTRACTS_ADMIN_ADDRESS,
                        stargateNFT: stargateNFTV2ProxyAddress,
                        vthoToken: config.VTHO_TOKEN_ADDRESS,
                        vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
                        delegationPeriod: config.DELEGATION_PERIOD_DURATION,
                        operator: config.STARGATE_DELEGATION_OPERATOR_ADDRESS,
                    },
                ],
            }, // V1
            {
                args: [deployer.address],
                version: 3,
            },
        ],
        false
    )) as StargateDelegation;

    log(
        "\n✅ Initialized stargateDelegationV3 contract",
        await stargateDelegationV3Contract.getAddress()
    );

    // deploy NodeManagementV3
    const nodeManagementV3Contract = (await deployAndUpgrade(
        ["NodeManagementV1", "NodeManagementV2", "NodeManagementV3"],
        [
            [legacyNodesContractAddress, deployer.address, deployer.address],
            [],
            [stargateNFTV2ProxyAddress],
        ],
        {
            versions: [undefined, 2, 3],
            logOutput: false,
        }
    )) as NodeManagementV3;

    log("\n✅ Deployed nodeManagementV3 contract", await nodeManagementV3Contract.getAddress());

    // vtho contract
    const vthoContract = await ethers.getContractAt("MyERC20", config.VTHO_TOKEN_ADDRESS);

    log("\n✅ Deployed vtho contract", await vthoContract.getAddress());

    const contractAddresses: DeployedContractsAddresses = {
        // Below addresses are deployed if not mainnet, hence the default
        TokenAuctionMock: legacyNodesContractAddress,
        ClockAuctionMock: clockAuctionContractAddress,
        NodeManagement: await nodeManagementV3Contract.getAddress(),
        // Below addresses are deployed on all networks
        StargateNFT: stargateNFTV2ProxyAddress,
        StargateDelegation: stargateDelegationV3ProxyAddress,
    };

    console.log("📍 Contract Addresses:");
    Object.entries(contractAddresses).forEach(([name, address]) => {
        if (address !== ethers.ZeroAddress) {
            console.log(`  • ${name}: ${address}`);
        }
    });

    const libraries = {
        StargateNFTClockLib: await StargateNFTClockLibV2.getAddress(),
        StargateNFTSettingsLib: await StargateNFTSettingsLibV2.getAddress(),
        StargateNFTTokenLib: await StargateNFTTokenLibV2.getAddress(),
        StargateNFTMintingLib: await StargateNFTMintingLibV2.getAddress(),
        StargateNFTLevelsLib: await StargateNFTLevelsLibV2.getAddress(),
        StargateNFTTokenManagerLib: await StargateNFTTokenLibV2.getAddress(),
    };

    await saveContractsToFile(contractAddresses as unknown as Record<string, string>, libraries);

    return {
        legacyNodesContract,
        clockAuctionContract,
        stargateNFTV2Contract,
        stargateDelegationV3Contract,
        nodeManagementV3Contract,
        vthoContract,
        deployer,
        otherAccounts,
    };
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
