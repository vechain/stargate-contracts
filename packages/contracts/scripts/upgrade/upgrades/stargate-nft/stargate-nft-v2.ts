import { network } from "hardhat";
import { getConfig } from "@repo/config";
import { EnvConfig, getContractsConfig } from "@repo/config/contracts";
import { deployStargateNFTLibraries } from "../../../deploy/libraries";
import { upgradeProxy } from "../../../helpers";
import { StargateNFT } from "../../../../typechain-types";

async function main() {
  if (!process.env.VITE_APP_ENV) {
    throw new Error("Missing VITE_APP_ENV");
  }

  const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
  const contractsConfig = getContractsConfig(process.env.VITE_APP_ENV as EnvConfig);
  
  // Deploy libraries
  const { 
    StargateNFTClockLib,
    StargateNFTLevelsLib,
    StargateNFTMintingLib,
    StargateNFTSettingsLib,
    StargateNFTTokenLib,
    StargateNFTVetGeneratedVthoLib,
  } = await deployStargateNFTLibraries({ logOutput: true, latestVersionOnly: true });

  console.log(
    `Upgrading StargateNFT contract at address: ${config.stargateNFTContractAddress} on network: ${config.network.name} with hardhat network set to: ${network.name}`
  );

  const stargateNFTV2 = (await upgradeProxy(
    "StargateNFTV1",
    "StargateNFT",
    config.stargateNFTContractAddress,
    [
        contractsConfig.WHITELIST_ENTRIES_V2,
    ],
    {
      version: 2,
      libraries: {
        Clock: await StargateNFTClockLib.getAddress(),
        Levels: await StargateNFTLevelsLib.getAddress(),
        MintingLogic: await StargateNFTMintingLib.getAddress(),
        Settings: await StargateNFTSettingsLib.getAddress(),
        Token: await StargateNFTTokenLib.getAddress(),
        VetGeneratedVtho: await StargateNFTVetGeneratedVthoLib.getAddress(),
      },
      logOutput: true,
    }
  )) as StargateNFT;

  console.log(`StargateNFT upgraded`);

  // check that upgrade was successful
  const version = await stargateNFTV2.version();
  console.log(`New StargateNFT version: ${version}`);

  if (version !== 2n) {
    throw new Error(`StargateNFT version is not 2: ${version}`);
  }

  console.log("Execution completed");
  process.exit(0);
}

// Execute the main function
main();
