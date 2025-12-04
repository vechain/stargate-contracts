import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import { log, writeToFile } from "../helpers";
import { BaseRewardsData } from "./types";
import { ThorClient } from "@vechain/sdk-network";
import { StargateNFTV2__factory } from "../../typechain-types";
import { ContractClause } from "@vechain/sdk-core";

const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 80;

async function main() {
    const thor = ThorClient.at(config.nodeUrl);
    const stargateNFTAddress = config.stargateNFTContractAddress;
    const stargateNFTEthersContract = await ethers.getContractAt(
        "StargateNFTV2",
        stargateNFTAddress
    );
    const stargateNFTThorContract = thor.contracts.load(
        stargateNFTAddress,
        StargateNFTV2__factory.abi
    );

    let endTokenId: bigint;
    if (process.env.END_TOKEN_ID) {
        endTokenId = BigInt(process.env.END_TOKEN_ID);
    } else {
        endTokenId = await stargateNFTEthersContract.getCurrentTokenId();
    }
    log(`End tokenId: ${endTokenId}`);

    const outputData: BaseRewardsData = {
        environment: config.environment,
        network: network.name,
        stargateNFTAddress: config.stargateNFTContractAddress,
        stargateDelegationAddress: config.stargateDelegationContractAddress,
        rewardsData: [],
    };
    const totalBatches = Math.ceil(Number(endTokenId) / BATCH_SIZE);
    const validTokenIds = [];

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const percentCompleted = ((batchIndex + 1) / totalBatches) * 100;
        log(
            `Processing batch ${batchIndex + 1} of ${totalBatches}, progress: ${percentCompleted.toFixed(2)}%`
        );
        const clauses: ContractClause[] = [];
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, Number(endTokenId));
        for (let tokenId = start; tokenId < end; tokenId++) {
            clauses.push(stargateNFTThorContract.clause.tokenExists(BigInt(tokenId)));
        }
        const results = await thor.transactions.executeMultipleClausesCall(clauses);
        for (let i = 0; i < results.length; i++) {
            const result = results[i];
            if (result.success && result.result.plain === true) {
                validTokenIds.push(start + i);
            }
        }
    }
    const validIdsBatches = Math.ceil(validTokenIds.length / BATCH_SIZE);
    for (let batchIndex = 0; batchIndex < validIdsBatches; batchIndex++) {
        const percentCompleted = ((batchIndex + 1) / validIdsBatches) * 100;
        log(
            `Processing valid token IDs batch ${batchIndex + 1} of ${validIdsBatches}, progress: ${percentCompleted.toFixed(2)}%`
        );
        const claimableRewardsClauses: ContractClause[] = [];
        const ownerOfClauses: ContractClause[] = [];
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, validTokenIds.length);
        const batchValidTokenIds = validTokenIds.slice(start, end);
        for (let tokenId of batchValidTokenIds) {
            claimableRewardsClauses.push(
                stargateNFTThorContract.clause.claimableVetGeneratedVtho(BigInt(tokenId))
            );
            ownerOfClauses.push(stargateNFTThorContract.clause.ownerOf(BigInt(tokenId)));
        }

        const claimableRewardsResults =
            await thor.transactions.executeMultipleClausesCall(claimableRewardsClauses);
        const ownerOfResults = await thor.transactions.executeMultipleClausesCall(ownerOfClauses);

        for (let i = 0; i < batchValidTokenIds.length; i++) {
            const claimableRewardsResult = claimableRewardsResults[i];
            const ownerOfResult = ownerOfResults[i];
            if (!claimableRewardsResult.success || !ownerOfResult.success) {
                throw new Error(
                    `Failed to get claimable rewards or owner of token ${batchValidTokenIds[i]}`
                );
            }
            if (claimableRewardsResult.result.plain === BigInt(0)) {
                log(`Token ${batchValidTokenIds[i]} has no delegation rewards, skipping...`);
                continue;
            }
            if (
                claimableRewardsResult.success &&
                ownerOfResult.success &&
                claimableRewardsResult.result.plain !== BigInt(0)
            ) {
                const claimableRewards = claimableRewardsResult.result.plain as bigint;
                const owner = ownerOfResult.result.plain as string;
                outputData.rewardsData.push({
                    tokenId: batchValidTokenIds[i],
                    owner: owner,
                    claimableRewards: claimableRewards.toString(),
                });
            }
        }
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
