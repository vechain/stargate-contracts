import { ContractsConfig } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import {
  saveContractsToFile,
  deployUpgradeableWithoutInitialization,
  initializeProxy,
} from "../../../helpers";
import { StargateNFT, StargateDelegation } from "../../../../typechain-types";
import { HttpNetworkConfig } from "hardhat/types";
import { deployStargateNFTLibraries } from "../../../deploy/libraries";
import { getConfig } from "@repo/config";
import { overrideLocalConfigWithNewContracts } from "../../../overrideConfigFile";

interface DeployedContractsAddresses {
  TokenAuctionMock: string;
  ClockAuctionMock: string;
  ERC721Mock: string;
  ERC1155Mock: string;
  StargateNFT: string;
  StargateDelegation: string;
  NodeManagement: string;
}

export async function deployMainnetRelease(
  config: ContractsConfig
): Promise<DeployedContractsAddresses> {
  const start = performance.now();

  console.log("================ START deployment");

  const networkConfig = network.config as HttpNetworkConfig;
  console.log(
    `Network and config: ${network.name} (${networkConfig.url}) with ${config.VITE_APP_ENV} configurations `
  );

  const [deployer] = await ethers.getSigners();
  console.log(`Address used to deploy: ${deployer.address}`);
  console.log(`Admin will be set to: ${config.CONTRACTS_ADMIN_ADDRESS}`);

  if (network.name !== "vechain_mainnet") {
    throw new Error(
      "This script is only meant to be used on mainnet. Remove this check to continue"
    );
  }

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
        tokenCollectionName: config.TOKEN_COLLECTION_NAME,
        tokenCollectionSymbol: config.TOKEN_COLLECTION_SYMBOL,
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

  console.log("Deployment completed successfully!");
  console.log("================================================================================");

  console.log("Pause StarGate NFT...");
  await stargateNFT.pause();
  if (!(await stargateNFT.paused())) {
    console.log("ERROR: Stargate NFT not paused");
  }
  console.log("Done");
  console.log("================================================================================");

  const date = new Date(performance.now() - start);
  console.log(
    `================  Deployment script run successfully in ${date.getMinutes()}m ${date.getSeconds()}s `
  );

  const contractAddresses: DeployedContractsAddresses = {
    // Below addresses are deployed if not mainnet, hence the default
    TokenAuctionMock: config.TOKEN_AUCTION_CONTRACT_ADDRESS,
    ClockAuctionMock: config.CLOCK_AUCTION_CONTRACT_ADDRESS,
    ERC721Mock: ethers.ZeroAddress,
    ERC1155Mock: ethers.ZeroAddress,
    NodeManagement: config.NODE_MANAGEMENT_CONTRACT_ADDRESS,
    // Below addresses are deployed on all networks
    StargateNFT: await stargateNFT.getAddress(),
    StargateDelegation: await stargateDelegation.getAddress(),
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
  await overrideLocalConfigWithNewContracts(contractAddresses, getConfig().network, false);

  const end = new Date(performance.now() - start);
  console.log(`================ Total deployment time: ${end.getMinutes()}m ${end.getSeconds()}s`);

  return contractAddresses;
}
