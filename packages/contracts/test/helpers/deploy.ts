import { ethers, network } from "hardhat";
import {
    StargateNFT,
    StargateDelegation,
    TokenAuction,
    MyERC20,
    NodeManagementV3,
    ClockAuction,
    Stargate,
    IProtocolStaker,
    IProtocolParams,
} from "../../typechain-types";
import {
    deployAndUpgrade,
    deployUpgradeableWithoutInitialization,
    initializeProxyAllVersions,
} from "../../scripts/helpers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { setBalance } from "@nomicfoundation/hardhat-network-helpers";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { deployStargateNFTLibraries } from "../../scripts/deploy/libraries";
import { getConfig } from "@repo/config";
import { ZeroAddress } from "ethers";

interface DeployedContracts {
    legacyNodesContract: TokenAuction;
    legacyNodesAuctionContract: ClockAuction;
    stargateNFTContract: StargateNFT;
    stargateDelegationContract: StargateDelegation;
    stargateContract: Stargate;
    protocolStakerContract: IProtocolStaker;
    protocolParamsContract: IProtocolParams;
    nodeManagementContract: NodeManagementV3;
    mockedVthoToken: MyERC20;
    deployer: HardhatEthersSigner;
    otherAccounts: HardhatEthersSigner[];
}

let cachedDeployment: DeployedContracts | undefined = undefined;

export async function getOrDeployContracts({
    forceDeploy = false,
    config = createLocalConfig(),
    mintVtho = false,
}): Promise<DeployedContracts> {
    // Get app config
    const appConfig = getConfig();

    // Return cached deployment if available and force deploy is not requested
    if (!forceDeploy && cachedDeployment !== undefined) {
        return cachedDeployment;
    }

    const [deployer, ...otherAccounts] = await ethers.getSigners();
    config.CONTRACTS_ADMIN_ADDRESS = deployer.address;

    if (network.name === "hardhat") {
        // Seed otherAccounts[0..4] with 50M VET - highest node value is currently worth 15.6M VET
        const newBalance = ethers.parseEther("50000000");
        for (let i = 0; i < 5; i++) {
            await setBalance(otherAccounts[i].address, newBalance);
        }
    }

    const overridenVechainNodesMockAddress =
        config.TOKEN_AUCTION_CONTRACT_ADDRESS &&
        config.TOKEN_AUCTION_CONTRACT_ADDRESS != ZeroAddress
            ? config.TOKEN_AUCTION_CONTRACT_ADDRESS
            : undefined;

    // Deploy Mocked Nodes contract
    const TokenAuctionFactory = await ethers.getContractFactory("TokenAuction");
    const vechainNodesMock = await TokenAuctionFactory.deploy();
    await vechainNodesMock.waitForDeployment();
    const vechainNodesMockAddress = await vechainNodesMock.getAddress();

    // Deploy Mocked Clock Auction contract
    const ClockAuctionFactory = await ethers.getContractFactory("ClockAuction");
    const clockAuctionMock = await ClockAuctionFactory.deploy(
        vechainNodesMockAddress,
        deployer.address
    );
    await clockAuctionMock.waitForDeployment();
    const clockAuctionMockAddress = await clockAuctionMock.getAddress();

    // Configure Mocked Nodes contract
    await vechainNodesMock.setSaleAuctionAddress(clockAuctionMockAddress);
    await vechainNodesMock.addOperator(deployer.address);
    // Set the transfer cooldown and lead time to 0 to avoid the need to wait for them
    await vechainNodesMock.setTransferCooldown(0);
    await vechainNodesMock.setLeadTime(0);

    // Deploys the latest implementation of the contracts
    const {
        StargateNFTClockLib,
        StargateNFTLevelsLib,
        StargateNFTMintingLib,
        StargateNFTSettingsLib,
        StargateNFTTokenLib,
        StargateNFTTokenManagerLib,
    } = await deployStargateNFTLibraries({ latestVersionOnly: true });

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
        false
    );

    const stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
        "StargateDelegation",
        {},
        false
    );

    const stargateProxyAddress = await deployUpgradeableWithoutInitialization(
        "Stargate",
        {
            Clock: await StargateNFTClockLib.getAddress(),
        },
        false
    );

    const stargateNFT = (await initializeProxyAllVersions(
        "StargateNFT",
        stargateNFTProxyAddress,
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
                        legacyNodes: overridenVechainNodesMockAddress || vechainNodesMockAddress,
                        stargateDelegation: stargateDelegationProxyAddress,
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
            {
                args: [
                    config.STARGATE_CONTRACT_ADDRESS || stargateProxyAddress,
                    config.STARGATE_NFT_BOOST_LEVEL_IDS || [],
                    config.STARGATE_NFT_BOOST_PRICES_PER_BLOCK || [],
                ],
                version: 3,
            },
        ],
        false
    )) as StargateNFT;

    const stargateNFTContractAddress =
        config.STARGATE_NFT_CONTRACT_ADDRESS || stargateNFTProxyAddress;

    const stargateContract = (await initializeProxyAllVersions(
        "Stargate",
        stargateProxyAddress,
        [
            {
                args: [
                    {
                        admin: config.CONTRACTS_ADMIN_ADDRESS,
                        protocolStakerContract:
                            config.PROTOCOL_STAKER_CONTRACT_ADDRESS ||
                            appConfig.protocolStakerContractAddress,
                        stargateNFTContract: stargateNFTContractAddress,
                        legacyNodesContract:
                            overridenVechainNodesMockAddress || vechainNodesMockAddress,
                        maxClaimablePeriods: config.MAX_CLAIMABLE_PERIODS || 832,
                    },
                ],
            },
        ],
        false
    )) as Stargate;

    const stargateDelegation = (await initializeProxyAllVersions(
        "StargateDelegation",
        stargateDelegationProxyAddress,
        [
            {
                args: [
                    {
                        upgrader: config.CONTRACTS_ADMIN_ADDRESS,
                        admin: config.CONTRACTS_ADMIN_ADDRESS,
                        stargateNFT: stargateNFTProxyAddress,
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

    // Deploy NodeManagement contract
    const nodeManagement = (await deployAndUpgrade(
        ["NodeManagementV1", "NodeManagementV2", "NodeManagementV3"],
        [
            [await vechainNodesMock.getAddress(), deployer.address, deployer.address],
            [],
            [stargateNFTProxyAddress],
        ],
        {
            versions: [undefined, 2, 3],
            logOutput: false,
        }
    )) as NodeManagementV3;

    // Load protocol contracts
    const protocolStakerContract = await ethers.getContractAt(
        "IProtocolStaker",
        appConfig.protocolStakerContractAddress
    );

    const protocolParamsContract = await ethers.getContractAt(
        "IProtocolParams",
        appConfig.protocolParamsContractAddress
    );

    const vtho = await ethers.getContractAt("MyERC20", config.VTHO_TOKEN_ADDRESS);

    // set up
    if (mintVtho) {
        // Seed the contracts with VTHO
        console.log("          Minting VTHO was disabled");
    }

    // Set Stargate contract address in the protocol params contract
    // https://github.com/vechain/thor/blob/06b06a4dc759661e1681ccfb02f930604f221ad3/thor/params.go#L64
    // delegator-contract-address -> 0x00000000000064656c656761746f722d636f6e74726163742d61646472657373
    const paramsKey = ethers.zeroPadValue(ethers.toUtf8Bytes("delegator-contract-address"), 32);
    const paramsVal = BigInt(stargateProxyAddress);
    await protocolParamsContract.set(paramsKey, paramsVal);

    // Cache the deployment
    cachedDeployment = {
        legacyNodesContract: vechainNodesMock,
        legacyNodesAuctionContract: clockAuctionMock,
        stargateNFTContract: stargateNFT,
        stargateDelegationContract: stargateDelegation,
        nodeManagementContract: nodeManagement,
        mockedVthoToken: vtho,
        stargateContract,
        protocolStakerContract,
        protocolParamsContract,
        deployer,
        otherAccounts,
    };

    return cachedDeployment;
}
