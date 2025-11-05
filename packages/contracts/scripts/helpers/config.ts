import axios from "axios";
import fs from "fs";
import path from "path";
import { ethers, network } from "hardhat";
import { AppConfig, getConfig, getContractsConfig } from "@repo/config";
import { Network } from "@repo/constants";
import { deployAll } from "../deploy/deploy";
import { GenesisBlock } from "../thor-solo/waitForThorSolo";

const config = getConfig();

export const isSoloNetwork = network.name === "vechain_solo";
export const isTestnetNetwork = network.name === "vechain_testnet";
export const isDevnetNetwork = network.name === "vechain_devnet";

export const overrideLocalConfigWithNewContracts = async (
    contracts: Awaited<ReturnType<typeof deployAll>>,
    network: Network
) => {
    const newConfig: AppConfig = {
        ...config,
        legacyNodesContractAddress: contracts.TokenAuctionMock,
        stargateNFTContractAddress: contracts.StargateNFT,
        stargateDelegationContractAddress: contracts.StargateDelegation,
        nodeManagementContractAddress: contracts.NodeManagement,
        stargateContractAddress: contracts.Stargate,
    };

    console.log(`Overriding local config with new contracts...`, newConfig);

    // eslint-disable-next-line
    const toWrite = `import { AppConfig } from \".\" \n const config: AppConfig = ${JSON.stringify(newConfig, null, 2)};
    export default config;`;

    const localConfigPath = path.resolve(`../config/${config.environment}.ts`);
    console.log(`Writing new config file to ${localConfigPath}`);
    fs.writeFileSync(localConfigPath, toWrite);
};

export async function checkContractsDeployment() {
    try {
        const stargateNFTContractAddress = config.stargateNFTContractAddress;
        const code = stargateNFTContractAddress
            ? await ethers.provider.getCode(stargateNFTContractAddress)
            : "0x";

        if (code === "0x") {
            console.log(`StargateNFT not deployed at address ${stargateNFTContractAddress}`);
            if (isSoloNetwork || isTestnetNetwork || isDevnetNetwork) {
                // deploy the contracts and override the config file
                const newAddresses = await deployAll(getContractsConfig(config.environment));

                return await overrideLocalConfigWithNewContracts(newAddresses, config.network);
            } else console.log(`Skipping deployment on ${network.name}. Not solo or testnet.`);
        } else console.log(`StargateNFT contract already deployed, skipping deployment...`);
    } catch (e) {
        console.log(e);
    }
}

/**
 * Validates that the genesis ID in local.ts matches the actual running thor-solo
 */
export async function validateGenesisId(): Promise<boolean> {
    try {
        console.log("🔍 Validating genesis ID on network:", config.network.name);

        // Get the actual genesis block from the running node
        const response = await axios.get(`${config.nodeUrl}/blocks/0`, {
            timeout: 5000,
        });

        if (response.status !== 200 || !response.data) {
            throw new Error("Can't fetch genesis block.");
        }

        const actualGenesis = response.data as GenesisBlock;
        const configGenesis = config.network.genesis;

        if (actualGenesis.id !== configGenesis.id) {
            console.log("❌ Genesis ID mismatch detected:");
            console.log(`   Config genesis ID: ${configGenesis.id}`);
            console.log(`   Actual genesis ID: ${actualGenesis.id}`);
            console.log("");
            console.log("This usually happens when thor node was restarted.");
            return false;
        }

        console.log(`✅ Genesis ID validated: ${actualGenesis.id}`);
        return true;
    } catch (error) {
        console.warn("⚠️  Could not validate genesis ID:", (error as Error).message);
        console.warn("Continuing anyway...");
        return true; // Don't fail if we can't check
    }
}
