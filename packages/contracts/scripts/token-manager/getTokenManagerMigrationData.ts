import { ethers } from "hardhat";
import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { log, writeToFile } from "../helpers";
import { TokenManagerMigrationData } from "./types";

const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

async function main() {
    // Get network information from Hardhat
    const network = await ethers.provider.getNetwork();
    log(`Network: ${network.name} (chainId: ${network.chainId})`);
    log(`StargateNFT Address: ${config.stargateNFTContractAddress}`);
    log(`TokenManager Address: ${config.nodeManagementContractAddress}`);

    const stargateNFTContract = await ethers.getContractAt(
        "StargateNFT",
        config.stargateNFTContractAddress
    );
    const nodeManagementV3Contract = await ethers.getContractAt(
        "NodeManagementV3",
        config.nodeManagementContractAddress
    );

    // Get end tokenId from environment variable or get current tokenId from StargateNFT contract
    let endTokenId: bigint;
    if (process.env.END_TOKEN_ID) {
        endTokenId = BigInt(process.env.END_TOKEN_ID);
    } else {
        endTokenId = await stargateNFTContract.getCurrentTokenId();
    }

    log(`End tokenId: ${endTokenId}`);

    const outputData: TokenManagerMigrationData = {
        environment: config.environment,
        network: network.name,
        stargateNFTAddress: config.stargateNFTContractAddress,
        nodeManagementV3Address: config.nodeManagementContractAddress,
        migrations: [],
    };
    for (let tokenId = 0; tokenId <= endTokenId; tokenId++) {
        log(`Getting token manager for tokenId: ${tokenId}`);
        // percent completed
        const percentCompleted = ((tokenId / Number(endTokenId)) * 100).toFixed(2);
        log(`[${tokenId + 1}/${endTokenId}] Processing tokenId: ${tokenId} (${percentCompleted}%)`);
        const tokenExists = await stargateNFTContract.tokenExists(tokenId);
        if (!tokenExists) {
            continue;
        }
        const owner = await stargateNFTContract.getTokenManager(tokenId);
        const nodeManager = await nodeManagementV3Contract.getNodeManager(tokenId);
        if (owner === nodeManager) {
            continue;
        }
        if (nodeManager !== ethers.ZeroAddress) {
            outputData.migrations.push({
                tokenId: tokenId,
                owner: owner,
                tokenManager: nodeManager,
            });
        }
    }
    // Final summary
    log(`\n📊 Migration Summary:`);
    log(`  Total migrations: ${outputData.migrations.length}`);
    log(
        `  Migration data written to: data/token-manager-migration-data-${config.environment}.json`
    );
    await writeToFile(
        __dirname,
        "token-manager-migration-data",
        outputData,
        config.environment,
        "data"
    );
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
