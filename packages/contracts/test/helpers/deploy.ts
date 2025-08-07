import { ethers, network } from "hardhat";
import {
  MyERC1155,
  MyERC721,
  StargateNFT,
  StargateDelegation,
  TokenAuction,
  MyERC20,
  NodeManagementV3,
  ClockAuction,
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
import { StrengthLevel } from "@repo/config/contracts/VechainNodes";

interface DeployedContracts {
  legacyNodesContract: TokenAuction;
  legacyNodesAuctionContract: ClockAuction;
  stargateNFTContract: StargateNFT;
  stargateDelegationContract: StargateDelegation;
  nodeManagementContract: NodeManagementV3;
  mockedErc721Contract: MyERC721;
  mockedErc1155Contract: MyERC1155;
  mockedVthoToken: MyERC20;
  deployer: HardhatEthersSigner;
  otherAccounts: HardhatEthersSigner[];
}

let cachedDeployment: DeployedContracts | undefined = undefined;

export async function getOrDeployContracts({
  forceDeploy = false,
  config = createLocalConfig(),
  mintVtho = true,
}): Promise<DeployedContracts> {
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

  // Deploy Mocked ERC721
  const ERC721Factory = await ethers.getContractFactory("MyERC721");
  const erc721Mock = await ERC721Factory.deploy(deployer.address);
  await erc721Mock.waitForDeployment();

  // Deploy Mocked ERC1155
  const ERC1155Factory = await ethers.getContractFactory("MyERC1155");
  const erc1155Mock = await ERC1155Factory.deploy(deployer.address);
  await erc1155Mock.waitForDeployment();

  // Deploy VTHO token
  const VTHOFactory = await ethers.getContractFactory("MyERC20");
  const vtho = await VTHOFactory.deploy(deployer.address, deployer.address);
  await vtho.waitForDeployment();
  const vthoAddress = await vtho.getAddress();

  // Deploys the latest implementation of the contracts
  const {
    StargateNFTClockLib,
    StargateNFTLevelsLib,
    StargateNFTMintingLib,
    StargateNFTSettingsLib,
    StargateNFTTokenLib,
    StargateNFTVetGeneratedVthoLib,
  } = await deployStargateNFTLibraries({ latestVersionOnly: true });

  const stargateNFTProxyAddress = await deployUpgradeableWithoutInitialization(
    "StargateNFT",
    {
      Clock: await StargateNFTClockLib.getAddress(),
      Levels: await StargateNFTLevelsLib.getAddress(),
      MintingLogic: await StargateNFTMintingLib.getAddress(),
      Settings: await StargateNFTSettingsLib.getAddress(),
      Token: await StargateNFTTokenLib.getAddress(),
      VetGeneratedVtho: await StargateNFTVetGeneratedVthoLib.getAddress(),
    },
    false
  );

  const stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
    "StargateDelegation",
    {},
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
            legacyNodes: vechainNodesMockAddress || config.TOKEN_AUCTION_CONTRACT_ADDRESS,
            stargateDelegation: stargateDelegationProxyAddress,
            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
            levelsAndSupplies: config.TOKEN_LEVELS,
            vthoToken: vthoAddress,
          },
        ],
      }, // V1
      {
        args: [config.WHITELIST_ENTRIES_V2],
        version: 2,
      },
    ],
    false
  )) as StargateNFT;

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
            vthoToken: vthoAddress,
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

  if (mintVtho) {
    // Seed the contracts with VTHO
    await vtho.mint(stargateDelegationProxyAddress, ethers.parseEther("10000000000000000"));
    await vtho.mint(stargateNFTProxyAddress, ethers.parseEther("10000000000000000"));
  }

  // Make the stargateNFT contract operator of the vechainNodesMock contract
  await vechainNodesMock.addOperator(stargateNFTProxyAddress);

  // Cache the deployment
  cachedDeployment = {
    legacyNodesContract: vechainNodesMock,
    legacyNodesAuctionContract: clockAuctionMock,
    stargateNFTContract: stargateNFT,
    stargateDelegationContract: stargateDelegation,
    nodeManagementContract: nodeManagement,
    mockedErc721Contract: erc721Mock,
    mockedErc1155Contract: erc1155Mock,
    mockedVthoToken: vtho,
    deployer,
    otherAccounts,
  };

  return cachedDeployment;
}
