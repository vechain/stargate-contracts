import { ethers, network } from "hardhat";
import { deployAll } from "./deploy/deploy";
import { getConfig, getContractsConfig } from "@repo/config";
import { overrideLocalConfigWithNewContracts } from "./overrideConfigFile";

const config = getConfig();

const isSoloNetwork = network.name === "vechain_solo";
const isTestnetNetwork = network.name === "vechain_testnet";

async function main() {
  console.log(`Checking contracts deployment on ${network.name} (${config.network.urls[0]})...`);
  await checkContractsDeployment();
  process.exit(0);
}

// check if the contracts specified in the config file are deployed on the network, if not, deploy them (only on solo network)
async function checkContractsDeployment() {
  try {
    const stargateNFTContractAddress = config.stargateNFTContractAddress;
    const code = stargateNFTContractAddress
      ? await ethers.provider.getCode(stargateNFTContractAddress)
      : "0x";

    if (code === "0x") {
      console.log(`StargateNFT not deployed at address ${stargateNFTContractAddress}`);
      if (isSoloNetwork || isTestnetNetwork) {
        // deploy the contracts and override the config file
        const newAddresses = await deployAll(getContractsConfig(config.environment));

        return await overrideLocalConfigWithNewContracts(newAddresses, config.network);
      } else console.log(`Skipping deployment on ${network.name}. Not solo or testnet.`);
    } else console.log(`StargateNFT contract already deployed, skipping deployment...`);
  } catch (e) {
    console.log(e);
  }
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
