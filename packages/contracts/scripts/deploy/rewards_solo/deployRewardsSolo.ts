import { ContractsConfig } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import {
  deployAndUpgrade,
  saveContractsToFile,
  deployUpgradeableWithoutInitialization,
  initializeProxy,
} from "../../helpers";
import { StargateNFT, StargateDelegation, NodeManagementV2 } from "../../../typechain-types";
import { HttpNetworkConfig } from "hardhat/types";
import { deployStargateNFTLibraries } from "../libraries";

interface DeployedContractsAddresses {
  TokenAuctionMock: string;
  ClockAuctionMock: string;
  ERC721Mock: string;
  ERC1155Mock: string;
  StargateNFT: string;
  StargateDelegation: string;
  NodeManagement: string;
}

export async function deployRewardsSolo(
  config: ContractsConfig
): Promise<DeployedContractsAddresses> {
  const start = performance.now();

  console.log("================ START rewards solo deployment");

  const networkConfig = network.config as HttpNetworkConfig;
  console.log(
    `Network and config: ${network.name} (${networkConfig.url}) with ${config.VITE_APP_ENV} configurations `
  );

  const [deployer, ...otherAccounts] = await ethers.getSigners();
  console.log(`Address used to deploy: ${deployer.address}`);

  let vechainNodes = await ethers.getContractAt(
    "TokenAuction",
    config.TOKEN_AUCTION_CONTRACT_ADDRESS
  );

  const vthoContract = await ethers.getContractAt("MyERC20", config.VTHO_TOKEN_ADDRESS);

  // ---------------------- Deploy Project contracts ----------------------
  console.log(`================ Deploying project contracts...`);

  console.log("Deploying the StargateNFT libraries...");
  const {
    StargateNFTClockLib,
    StargateNFTSettingsLib,
    StargateNFTTokenLib,
    StargateNFTMintingLib,
    StargateNFTVetGeneratedVthoLib,
    StargateNFTLevelsLib,
  } = await deployStargateNFTLibraries({ logOutput: true });

  console.log("Deploying StargateNFT...");
  const stargateNFTProxyAddress = await deployUpgradeableWithoutInitialization(
    "StargateNFT",
    {
      Clock: await StargateNFTClockLib.getAddress(),
      MintingLogic: await StargateNFTMintingLib.getAddress(),
      Settings: await StargateNFTSettingsLib.getAddress(),
      Token: await StargateNFTTokenLib.getAddress(),
      VetGeneratedVtho: await StargateNFTVetGeneratedVthoLib.getAddress(),
      Levels: await StargateNFTLevelsLib.getAddress(),
    },
    true
  );

  console.log(`Deploying StargateDelegation...`);
  const stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
    "StargateDelegation",
    {},
    true
  );

  console.log("Initializing proxies...");
  const stargateNFT = (await initializeProxy(
    stargateNFTProxyAddress,
    "StargateNFT",
    [
      {
        tokenCollectionName: "StarGate Delegator Token",
        tokenCollectionSymbol: "SDT",
        baseTokenURI: config.BASE_TOKEN_URI,
        admin: config.CONTRACTS_ADMIN_ADDRESS,
        upgrader: config.CONTRACTS_ADMIN_ADDRESS,
        pauser: config.CONTRACTS_ADMIN_ADDRESS,
        levelOperator: config.CONTRACTS_ADMIN_ADDRESS,
        legacyNodes: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
        stargateDelegation: stargateDelegationProxyAddress,
        legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
        levelsAndSupplies: config.TOKEN_LEVELS,
        vthoToken: config.VTHO_TOKEN_ADDRESS,
      },
    ],
    {
      Clock: await StargateNFTClockLib.getAddress(),
      MintingLogic: await StargateNFTMintingLib.getAddress(),
      Settings: await StargateNFTSettingsLib.getAddress(),
      Token: await StargateNFTTokenLib.getAddress(),
      VetGeneratedVtho: await StargateNFTVetGeneratedVthoLib.getAddress(),
      Levels: await StargateNFTLevelsLib.getAddress(),
    }
  )) as StargateNFT;
  console.log("StargateNFT initialized");

  const stargateDelegation = (await initializeProxy(
    stargateDelegationProxyAddress,
    "StargateDelegation",
    [
      {
        upgrader: config.CONTRACTS_ADMIN_ADDRESS,
        admin: config.CONTRACTS_ADMIN_ADDRESS,
        stargateNFT: await stargateNFT.getAddress(),
        vthoToken: config.VTHO_TOKEN_ADDRESS,
        vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
        delegationPeriod: config.DELEGATION_PERIOD_DURATION,
        operator: config.STARGATE_DELEGATION_OPERATOR_ADDRESS,
      },
    ],
    {}
  )) as StargateDelegation;
  console.log("StargateDelegation initialized");

  // Deploy NodeManagement
  console.log("Deploying NodeManagement...");
  const nodeManagement = (await deployAndUpgrade(
    ["NodeManagementV1", "NodeManagementV2", "NodeManagementV3"],
    [
      [config.TOKEN_AUCTION_CONTRACT_ADDRESS, deployer.address, deployer.address],
      [],
      [await stargateNFT.getAddress()],
    ],
    {
      versions: [undefined, 2, 3],
      logOutput: true,
    }
  )) as NodeManagementV2;
  const nodeManagementContractAddress = await nodeManagement.getAddress();

  console.log("Deployment completed successfully!");
  console.log("================================================================================");

  // Set Stargate NFT as operator of Legacy Token Auction
  console.log("Set Stargate NFT as operator of Legacy Token Auction...");
  await vechainNodes.addOperator(await stargateNFT.getAddress());

  // Transfer VTHO to StargateDelegation contract
  console.log("Transfer 1M VTHO to StargateDelegation contract...");
  await vthoContract.transferFrom(
    deployer.address,
    await stargateDelegation.getAddress(),
    ethers.parseEther("1000000000000000000000000") // 1 Million VTHO
  );

  const date = new Date(performance.now() - start);
  console.log(
    `================  Contracts deployed in ${date.getMinutes()}m ${date.getSeconds()}s `
  );

  const contractAddresses: DeployedContractsAddresses = {
    // Below addresses are deployed if not mainnet, hence the default
    TokenAuctionMock: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
    ClockAuctionMock: config.CLOCK_AUCTION_CONTRACT_ADDRESS,
    ERC721Mock: ethers.ZeroAddress,
    ERC1155Mock: ethers.ZeroAddress,
    NodeManagement: nodeManagementContractAddress,
    // Below addresses are deployed on all networks
    StargateNFT: await stargateNFT.getAddress(),
    StargateDelegation: await stargateDelegation.getAddress(),
  };
  console.log("Contracts", contractAddresses);

  await saveContractsToFile(contractAddresses as unknown as Record<string, string>);

  const end = new Date(performance.now() - start);
  console.log(`================ Total deployment time: ${end.getMinutes()}m ${end.getSeconds()}s`);

  return contractAddresses;
}
