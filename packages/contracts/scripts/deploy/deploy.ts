import { ContractsConfig } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import {
  deployAndUpgrade,
  saveContractsToFile,
  addToken,
  parseTokenMetadata,
  deployUpgradeableWithoutInitialization,
  initializeProxyAllVersions,
} from "../helpers";
import { StargateNFT, StargateDelegation, NodeManagementV3 } from "../../typechain-types";
import { HttpNetworkConfig } from "hardhat/types";
import { StrengthLevel } from "@repo/config/contracts/VechainNodes";
import { deployStargateNFTLibraries } from "./libraries";

interface DeployedContractsAddresses {
  TokenAuctionMock: string;
  ClockAuctionMock: string;
  ERC721Mock: string;
  ERC1155Mock: string;
  StargateNFT: string;
  StargateDelegation: string;
  NodeManagement: string;
}

export async function deployAll(config: ContractsConfig): Promise<DeployedContractsAddresses> {
  const start = performance.now();

  console.log("================ START deployment");

  const networkConfig = network.config as HttpNetworkConfig;
  console.log(
    `Network and config: ${network.name} (${networkConfig.url}) with ${config.VITE_APP_ENV} configurations `
  );

  const [deployer, ...otherAccounts] = await ethers.getSigners();
  console.log(`Address used to deploy: ${deployer.address}`);
  console.log(
    "/// TODO: Before mainnet we need to correctly setup deployer addresses and roles in the contracts"
  );

  // ---------------------- Deploy Mocks if not mainnet ----------------------
  let vechainNodesMockAddress, clockAuctionMockAddress, erc721MockAddress, erc1155MockAddress;

  let vechainNodesMock = await ethers.getContractAt(
    "TokenAuction",
    config.TOKEN_AUCTION_CONTRACT_ADDRESS
  );

  const deployMocks = network.name !== "vechain_mainnet";
  if (deployMocks) {
    console.log("================ Deploying mocked contracts...");

    const TokenAuctionFactory = await ethers.getContractFactory("TokenAuction");
    vechainNodesMock = await TokenAuctionFactory.deploy();
    await vechainNodesMock.waitForDeployment();

    vechainNodesMockAddress = await vechainNodesMock.getAddress();
    console.log(`Mocked Nodes contract deployed at: ${vechainNodesMockAddress}`);

    const ClockAuctionFactory = await ethers.getContractFactory("ClockAuction");
    const clockAuctionMock = await ClockAuctionFactory.deploy(
      vechainNodesMockAddress,
      deployer.address
    );
    await clockAuctionMock.waitForDeployment();

    clockAuctionMockAddress = await clockAuctionMock.getAddress();
    console.log(`Mocked Clock Auction contract deployed at: ${clockAuctionMockAddress}`);

    // Configure Mocked Nodes contract
    await vechainNodesMock.setSaleAuctionAddress(clockAuctionMockAddress);
    await vechainNodesMock.addOperator(deployer.address);

    const ERC721Factory = await ethers.getContractFactory("MyERC721");
    const erc721Mock = await ERC721Factory.deploy(deployer.address);
    await erc721Mock.waitForDeployment();

    erc721MockAddress = await erc721Mock.getAddress();
    console.log(`Mocked ERC721 contract deployed at: ${erc721MockAddress}`);

    const ERC1155Factory = await ethers.getContractFactory("MyERC1155");
    const erc1155Mock = await ERC1155Factory.deploy(deployer.address);
    await erc1155Mock.waitForDeployment();

    erc1155MockAddress = await erc1155Mock.getAddress();
    console.log(`Mocked ERC1155 contract deployed at: ${erc1155MockAddress}`);
  }

  // If we are on hardhat, we need to deploy the VTHO token
  let vthoAddress;
  if (network.name === "hardhat") {
    // Deploy VTHO token
    const VTHOFactory = await ethers.getContractFactory("MyERC20");
    const vtho = await VTHOFactory.deploy(deployer.address, deployer.address);
    await vtho.waitForDeployment();

    vthoAddress = await vtho.getAddress();
    console.log(`VTHO token deployed at: ${vthoAddress}`);
  } else {
    vthoAddress = config.VTHO_TOKEN_ADDRESS;
  }

  // ---------------------- Deploy Project contracts ----------------------
  console.log(`================ Deploying project contracts...`);

  console.log("Deploying the StargateNFT libraries...");
  const {
    StargateNFTClockLib,
    StargateNFTLevelsLib,
    StargateNFTMintingLib,
    StargateNFTSettingsLib,
    StargateNFTTokenLib,
    StargateNFTVetGeneratedVthoLib,
  } = await deployStargateNFTLibraries({ logOutput: true, latestVersionOnly: true });

  console.log("Deploying latest implementation of StargateNFT...");
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
    true
  );

  console.log(`Deploying latest implementation of StargateDelegation...`);
  const stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
    "StargateDelegation",
    {},
    true
  );

  console.log("Initializing proxies...");

  // For mainnet, grab WHITELIST_ENTRIES_V2 from config, otherwise set dummy whitelist entry
  const initV2Data = config.WHITELIST_ENTRIES_V2.length
    ? config.WHITELIST_ENTRIES_V2
    : [{ owner: otherAccounts[7].address, tokenId: 777, levelId: StrengthLevel.MjolnirX }];

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
        args: [initV2Data],
        version: 2,
      },
    ],
    true
  )) as StargateNFT;

  (await initializeProxyAllVersions(
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
    true
  )) as StargateDelegation;

  // WARNING: The NodeManagement contract is already deployed in production, with current version 2,
  // so we deploy it only on testnet and local, while on mainnet we upgrade to version 3
  let nodeManagementContractAddress;
  if (network.name !== "vechain_mainnet") {
    console.log("Deploying NodeManagement...");
    const nodeManagement = (await deployAndUpgrade(
      ["NodeManagementV1", "NodeManagementV2", "NodeManagementV3"],
      [
        [
          vechainNodesMockAddress || config.TOKEN_AUCTION_CONTRACT_ADDRESS,
          deployer.address,
          deployer.address,
        ],
        [],
        [stargateNFTProxyAddress],
      ],
      {
        versions: [undefined, 2, 3],
        logOutput: true,
      }
    )) as NodeManagementV3;
    nodeManagementContractAddress = await nodeManagement.getAddress();
  } else {
    nodeManagementContractAddress = config.NODE_MANAGEMENT_CONTRACT_ADDRESS;
    console.log("/// TODO: Upgrade NodeManagement to version 3 on mainnet");
  }

  console.log("Deployment completed successfully!");
  console.log("================================================================================");

  if (network.name !== "vechain_mainnet") {
    console.log("================ Seeding...");

    // Mint legacy NFTs
    console.log("[1/4]: mint legacy NFTs...");

    await Promise.all([
      addToken(vechainNodesMock, otherAccounts[0].address, StrengthLevel.Strength, false), // Strength, not upgrading
      addToken(vechainNodesMock, otherAccounts[1].address, StrengthLevel.VeThorX, false), // VeThorX, not upgrading
      addToken(vechainNodesMock, otherAccounts[2].address, StrengthLevel.Mjolnir, false), // Mjolnir, not upgrading
      addToken(vechainNodesMock, otherAccounts[3].address, StrengthLevel.StrengthX, false), // StrengthX, not upgrading
      addToken(vechainNodesMock, otherAccounts[4].address, StrengthLevel.Strength, true), // Strength, upgrading
      addToken(vechainNodesMock, otherAccounts[5].address, StrengthLevel.Thunder, false), // Thunder, not upgrading
      addToken(vechainNodesMock, otherAccounts[6].address, StrengthLevel.MjolnirX, false), // MjolnirX is the max level!
    ]);

    // Print token metadata for all tokens
    const tokenIds = [1, 2, 3, 4, 5, 6, 7];
    for (const tokenId of tokenIds) {
      const tokenMetadata = await vechainNodesMock.getMetadata(tokenId);
      const metadataParsed = parseTokenMetadata(tokenMetadata);
      console.log(
        `Account ${otherAccounts[tokenId - 1].address} - ID ${tokenId} - LV ${metadataParsed.level} - onUpgrade ${metadataParsed.onUpgrade}`
      );
    }

    // Update lead time
    console.log("[2/4]: set leadtime to 0 on Legacy Token Auction...");
    await vechainNodesMock.setLeadTime(0);

    // Set Stargate NFT as operator of Legacy Token Auction
    console.log("[3/4]: set Stargate NFT as operator of Legacy Token Auction...");
    await vechainNodesMock.addOperator(stargateNFTProxyAddress);

    console.log("[4/4]: Trying to deposit 1000 VTHO to Stargate Delegation...");
    try {
      const vthoToken = await ethers.getContractAt("MyERC20", vthoAddress);
      if (network.name === "hardhat") {
        await vthoToken.mint(
          stargateDelegationProxyAddress,
          ethers.parseUnits("1000000000000000000000")
        );
      } else if (network.name === "vechain_testnet" || network.name === "vechain_solo") {
        await vthoToken.transferFrom(
          deployer.address,
          stargateDelegationProxyAddress,
          ethers.parseUnits("1000000000000000000000")
        );
      }

      console.log("VTHO deposited to Stargate Delegation");
    } catch (error) {
      console.error("Error depositing VTHO to Stargate Delegation:", error);
      console.log("Continue with deployment...");
    }
  }

  const date = new Date(performance.now() - start);
  console.log(
    `================  Contracts deployed in ${date.getMinutes()}m ${date.getSeconds()}s `
  );

  const contractAddresses: DeployedContractsAddresses = {
    // Below addresses are deployed if not mainnet, hence the default
    TokenAuctionMock: vechainNodesMockAddress || config.TOKEN_AUCTION_CONTRACT_ADDRESS,
    ClockAuctionMock: clockAuctionMockAddress || config.CLOCK_AUCTION_CONTRACT_ADDRESS,
    ERC721Mock: erc721MockAddress || ethers.ZeroAddress,
    ERC1155Mock: erc1155MockAddress || ethers.ZeroAddress,
    NodeManagement: nodeManagementContractAddress,
    // Below addresses are deployed on all networks
    StargateNFT: stargateNFTProxyAddress,
    StargateDelegation: stargateDelegationProxyAddress,
  };
  console.log("Contracts", contractAddresses);

  const libraries = {
    StargateNFTClockLib: await StargateNFTClockLib.getAddress(),
    StargateNFTSettingsLib: await StargateNFTSettingsLib.getAddress(),
    StargateNFTTokenLib: await StargateNFTTokenLib.getAddress(),
    StargateNFTMintingLib: await StargateNFTMintingLib.getAddress(),
    StargateNFTVetGeneratedVthoLib: await StargateNFTVetGeneratedVthoLib.getAddress(),
    StargateNFTLevelsLib: await StargateNFTLevelsLib.getAddress(),
  };
  console.log("Libraries", libraries);

  await saveContractsToFile(contractAddresses as unknown as Record<string, string>, libraries);

  const end = new Date(performance.now() - start);
  console.log(`================ Total deployment time: ${end.getMinutes()}m ${end.getSeconds()}s`);

  return contractAddresses;
}
