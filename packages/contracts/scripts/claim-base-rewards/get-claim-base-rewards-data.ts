import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import { log, writeToFile } from "../helpers";
import { BaseRewardsData } from "./types";

const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

async function main() {
    const stargateNFTContract = await ethers.getContractAt(
        "StargateNFTV2",
        config.stargateNFTContractAddress
    );

    let endTokenId: bigint;
    if (process.env.END_TOKEN_ID) {
        endTokenId = BigInt(process.env.END_TOKEN_ID);
    } else {
        endTokenId = await stargateNFTContract.getCurrentTokenId();
    }

    log(`End tokenId: ${endTokenId}`);

    const outputData: BaseRewardsData = {
        environment: config.environment,
        network: network.name,
        stargateNFTAddress: config.stargateNFTContractAddress,
        stargateDelegationAddress: config.stargateDelegationContractAddress,
        rewardsData: [],
    };

    for (let tokenId = 0; tokenId <= endTokenId; tokenId++) {
        const percentCompleted = ((tokenId / Number(endTokenId)) * 100).toFixed(2);
        log(`[${tokenId}/${endTokenId}] Processing tokenId: ${tokenId} (${percentCompleted}%)`);
        const tokenExists = await stargateNFTContract.tokenExists(tokenId);
        if (!tokenExists) {
            log(`Token ${tokenId} does not exist, skipping...`);
            continue;
        }
        const owner = await stargateNFTContract.ownerOf(tokenId);
        const baseVthoRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
        // Skip tokens with no rewards
        if (baseVthoRewards.toString() === "0") {
            log(`Token ${tokenId} has no base rewards, skipping...`);
            continue;
        }
        outputData.rewardsData.push({
            tokenId: tokenId,
            owner: owner,
            claimableRewards: baseVthoRewards.toString(),
        });
    }
    log(`\n📊 Rewards Summary:`);
    log(`  Tokens with pending base rewards: ${outputData.rewardsData.length}`);
    log(`  Rewards data written to: data/base-rewards-data-${config.environment}.json`);
    await writeToFile(__dirname, "base-rewards-data", outputData, config.environment, "data");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
