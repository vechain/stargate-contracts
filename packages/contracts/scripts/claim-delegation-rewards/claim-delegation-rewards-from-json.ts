import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { ethers } from "hardhat";
import {
    ThorClient,
    VeChainProvider,
    ProviderInternalBaseWallet,
    signerUtils,
} from "@vechain/sdk-network";
import { ABIContract, Address, Clause, Mnemonic } from "@vechain/sdk-core";
import path from "path";
import * as fs from "fs";
import { log, writeToFile } from "../helpers";
import { StargateDelegation__factory } from "../../typechain-types";
import { DelegationRewardsData, DelegationRewardsExecutionReport } from "./types";

// 80 is the max number of clauses that can be executed in a single transaction
const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 80;

async function main() {
    if (!process.env.MNEMONIC) {
        throw new Error("Missing MNEMONIC environment variable");
    }
    const executeTransactions = process.env.EXECUTE_TRANSACTIONS === "true";
    const thor = ThorClient.at(config.nodeUrl);
    const listOfWords = process.env.MNEMONIC.split(" ");
    const privateKey = Mnemonic.toPrivateKey(listOfWords, "m/44'/818'/0'/0/0");
    const address = Address.ofMnemonic(listOfWords, "m/44'/818'/0'/0/0");
    const wallet = new ProviderInternalBaseWallet([
        {
            privateKey: privateKey,
            address: address.toString(),
        },
    ]);
    const provider = new VeChainProvider(thor, wallet, false);
    const signer = await provider.getSigner(address.toString());

    if (!signer) {
        throw new Error("Failed to get signer");
    }

    const inputPath = path.join(
        __dirname,
        `/data/delegation-rewards-data-${config.environment}.json`
    );
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }
    const inputData: DelegationRewardsData = JSON.parse(fs.readFileSync(inputPath, "utf8"));

    log(`🔍 Loaded rewards data from: ${inputPath}`);
    log(`📊 Environment: ${inputData.environment}`);
    log(`🌐 Network: ${inputData.network}`);
    log(`📝 Total rewards to process: ${inputData.rewardsData.length}`);

    const stargateDelegationContract = await ethers.getContractAt(
        "StargateDelegation",
        config.stargateDelegationContractAddress
    );

    const stargateNFTContract = await ethers.getContractAt(
        "StargateNFTV2",
        config.stargateNFTContractAddress
    );

    const outputData: DelegationRewardsExecutionReport = {
        environment: inputData.environment,
        network: inputData.network,
        stargateNFTAddress: inputData.stargateNFTAddress,
        stargateDelegationAddress: inputData.stargateDelegationAddress,
        timestamp: new Date().toISOString(),
        totalRewardsToClaim: inputData.rewardsData.length,
        successfulRewardsClaimed: 0,
        failedRewardsClaimed: 0,
        results: [],
    };

    log(`\n🚀 Starting rewards claiming process...\n`);

    const totalBatches = Math.ceil(inputData.rewardsData.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        log(`🔍 Processing batch ${batchIndex + 1} of ${totalBatches}`);
        const percentCompleted = ((batchIndex + 1) / totalBatches) * 100;
        log(`🔍 Progress: ${percentCompleted.toFixed(2)}%`);
        const start = batchIndex * BATCH_SIZE;
        const end = start + BATCH_SIZE;

        const batchRewards = inputData.rewardsData.slice(start, end);

        const validRewards = [];
        // Validate rewards
        for (const reward of batchRewards) {
            log(`🔍 Claiming rewards for tokenId: ${reward.tokenId}`);
            // if no rewards to claim, skip
            if (reward.claimableRewards === "0") {
                outputData.results.push({
                    tokenId: reward.tokenId,
                    owner: reward.owner,
                    status: "error",
                    error: "No rewards to claim",
                });
                outputData.failedRewardsClaimed++;
                continue;
            }
            // check if the claimable rewards are different from the expected rewards skip
            const currentClaimableDelegationRewards =
                await stargateDelegationContract.claimableRewards(reward.tokenId);
            if (currentClaimableDelegationRewards.toString() !== reward.claimableRewards) {
                outputData.results.push({
                    tokenId: reward.tokenId,
                    owner: reward.owner,
                    status: "error",
                    error: "Claimable delegation rewards mismatch",
                });
                outputData.failedRewardsClaimed++;
                continue;
            }
            // if token does not exist, skip
            const exists = await stargateNFTContract.tokenExists(reward.tokenId);
            if (!exists) {
                outputData.results.push({
                    tokenId: reward.tokenId,
                    owner: reward.owner,
                    status: "error",
                    error: "Token does not exist",
                });
                outputData.failedRewardsClaimed++;
                continue;
            }
            validRewards.push(reward);
        }
        // Build clauses
        const stargateDelegationAddress = Address.of(config.stargateDelegationContractAddress);

        // Written as any because we were having type issues with the getFunction method
        const stargateDelegationClaimRewardsFunction = ABIContract.ofAbi(
            StargateDelegation__factory.abi
        ).getFunction("claimRewards") as any;
        const clauses: Clause[] = [];
        for (const reward of validRewards) {
            // Claim delegation rewards
            clauses.push(
                Clause.callFunction(
                    stargateDelegationAddress,
                    stargateDelegationClaimRewardsFunction,
                    [reward.tokenId]
                )
            );
        }

        try {
            // If dry run mode, skip transaction execution
            if (!executeTransactions) {
                log(`🔍 Dry run mode. Skipping transaction execution.`);
                for (const reward of validRewards) {
                    outputData.results.push({
                        tokenId: reward.tokenId,
                        owner: reward.owner,
                        status: "success",
                        dryRun: true,
                    });
                }
                outputData.successfulRewardsClaimed += validRewards.length;

                continue;
            }
            // Estimate gas
            const gasResult = await thor.gas.estimateGas(clauses, await signer.getAddress(), {
                gasPadding: 1,
            });

            // Build transaction body
            const txBody = await thor.transactions.buildTransactionBody(
                clauses,
                gasResult.totalGas
            );

            // Convert transaction body to transaction request input
            const txInput = signerUtils.transactionBodyToTransactionRequestInput(
                txBody,
                await signer.getAddress()
            );

            // Sign transaction
            const rawSignedTransaction = await signer.signTransaction(txInput);

            // Send raw transaction
            const tx = await thor.transactions.sendRawTransaction(rawSignedTransaction);

            // Wait for transaction receipt
            const txReceipt = await tx.wait();

            // Check if transaction receipt is null
            if (!txReceipt) {
                log("❌ Transaction receipt is null");
                throw new Error("Transaction receipt is null");
            }

            // Check if transaction receipt is reverted
            if (txReceipt.reverted) {
                log("❌ Transaction reverted");
                throw new Error("Transaction failed");
            }

            // Add results to output data
            for (const reward of validRewards) {
                outputData.results.push({
                    tokenId: reward.tokenId,
                    owner: reward.owner,
                    status: "success",
                    txHash: txReceipt.meta.txID,
                    dryRun: false,
                    blockNumber: txReceipt.meta.blockNumber,
                    claimedRewards: reward.claimableRewards,
                });
                outputData.successfulRewardsClaimed++;
            }

            // If execute transactions mode, execute the transactions
        } catch (error) {
            // Add results to output data
            log(`❌ Rewards claiming script failed: ${error}`);
            for (const reward of validRewards) {
                outputData.results.push({
                    tokenId: reward.tokenId,
                    owner: reward.owner,
                    status: "error",
                    error: error instanceof Error ? error.message : String(error),
                });
                outputData.failedRewardsClaimed++;
            }
        }
    }

    log(`\n📊 Delegation rewards claiming process completed!\n`);
    log(`🏁 Total rewards claimed: ${outputData.successfulRewardsClaimed}`);
    log(`🏁 Total rewards failed to claim: ${outputData.failedRewardsClaimed}`);
    // Write results to file
    const outputFileName = executeTransactions
        ? "delegation-rewards-results"
        : "delegation-rewards-dryrun";

    await writeToFile(__dirname, outputFileName, outputData, config.environment, "results");
    log(`🏁 Rewards data written to: data/${outputFileName}-${config.environment}.json`);
}

main().catch((error) => {
    console.error("❌ Rewards claiming script failed:", error);
    process.exitCode = 1;
});
