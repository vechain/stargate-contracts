import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import { log, writeToFile } from "../helpers";
import { DelegationRewardsData } from "./types";

const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

async function main() {
    const stargateDelegationContract = await ethers.getContractAt(
        "StargateDelegation",
        config.stargateDelegationContractAddress
    );

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

    const outputData: DelegationRewardsData = {
        environment: config.environment,
        network: network.name,
        stargateNFTAddress: config.stargateNFTContractAddress,
        stargateDelegationAddress: config.stargateDelegationContractAddress,
        rewardsData: [],
    };

    let totalRewards = BigInt(0);

    for (let tokenId = 0; tokenId <= endTokenId; tokenId++) {
        const percentCompleted = ((tokenId / Number(endTokenId)) * 100).toFixed(2);
        log(`[${tokenId}/${endTokenId}] Processing tokenId: ${tokenId} (${percentCompleted}%)`);
        const tokenExists = await stargateNFTContract.tokenExists(tokenId);
        if (!tokenExists) {
            log(`Token ${tokenId} does not exist, skipping...`);
            continue;
        }
        const owner = await stargateNFTContract.ownerOf(tokenId);
        const delegationRewards = await stargateDelegationContract.claimableRewards(tokenId);
        // Skip tokens with no rewards
        if (delegationRewards.toString() === "0") {
            log(`Token ${tokenId} has no delegation rewards, skipping...`);
            continue;
        }
        totalRewards += delegationRewards;
        outputData.rewardsData.push({
            tokenId: tokenId,
            owner: owner,
            claimableRewards: delegationRewards.toString(),
        });
    }
    log(`\n📊 Rewards Summary:`);
    log(`  Total rewards: ${totalRewards.toString()}`);
    log(`  Tokens with pending delegation rewards: ${outputData.rewardsData.length}`);
    log(`  Rewards data written to: data/rewards-data-${config.environment}.json`);
    await writeToFile(__dirname, "delegation-rewards-data", outputData, config.environment, "data");
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
