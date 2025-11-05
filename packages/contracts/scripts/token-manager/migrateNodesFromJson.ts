import * as fs from "fs";
import * as path from "path";
import { ethers } from "hardhat";
import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { TokenManagerMigrationData, MigrationExecutionReport } from "./types";
import { log, writeToFile } from "../helpers";
import { ABIContract, Address, Clause, Mnemonic } from "@vechain/sdk-core";
import { StargateNFT__factory } from "../../typechain-types";
import {
    ProviderInternalBaseWallet,
    signerUtils,
    ThorClient,
    VeChainProvider,
} from "@vechain/sdk-network";

const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
const BATCH_SIZE = process.env.BATCH_SIZE ? parseInt(process.env.BATCH_SIZE) : 30;

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
        `/data/token-manager-migration-data-${config.environment}.json`
    );
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input file not found: ${inputPath}`);
    }

    const inputData: TokenManagerMigrationData = JSON.parse(fs.readFileSync(inputPath, "utf8"));

    log(`🔍 Loaded migration data from: ${inputPath}`);
    log(`📊 Environment: ${inputData.environment}`);
    log(`🌐 Network: ${inputData.network}`);
    log(`📝 Total migrations to process: ${inputData.migrations.length}`);

    // Get network information from Hardhat
    const stargateNFTContract = await ethers.getContractAt(
        "StargateNFT",
        inputData.stargateNFTAddress
    );

    const outputData: MigrationExecutionReport = {
        environment: inputData.environment,
        network: inputData.network,
        stargateNFTAddress: inputData.stargateNFTAddress,
        timestamp: new Date().toISOString(),
        totalMigrations: inputData.migrations.length,
        successfulMigrations: 0,
        failedMigrations: 0,
        results: [],
    };

    log(`\n🚀 Starting migration process...\n`);

    const totalBatches = Math.ceil(inputData.migrations.length / BATCH_SIZE);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
        const start = batchIndex * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, inputData.migrations.length);

        const batchMigrations = inputData.migrations.slice(start, end);

        const validMigrations = [];
        for (const migration of batchMigrations) {
            // Check if token manager address is valid
            if (!ethers.isAddress(migration.tokenManager)) {
                // Add results to output data
                outputData.results.push({
                    tokenId: migration.tokenId,
                    tokenManager: migration.tokenManager,
                    status: "error",
                    error: `Invalid token manager address: ${migration.tokenManager}`,
                });
                outputData.failedMigrations++;
                continue;
            }
            // Check if token exists
            const tokenExists = await stargateNFTContract.tokenExists(migration.tokenId);
            // Check if token exists
            if (!tokenExists) {
                // Add results to output data
                outputData.results.push({
                    tokenId: migration.tokenId,
                    tokenManager: migration.tokenManager,
                    status: "error",
                    error: `Token ${migration.tokenId} does not exist`,
                });
                outputData.failedMigrations++;
                continue;
            }
            // Add valid migrations to the list
            validMigrations.push(migration);
        }

        const clauses: Clause[] = [];

        const stargateNFTAddress = Address.of(config.stargateNFTContractAddress);
        // Written as any because we were having type issues with the getFunction method
        const migrateTokenManagerFunction = ABIContract.ofAbi(StargateNFT__factory.abi).getFunction(
            "migrateTokenManager"
        ) as any;
        for (const migration of validMigrations) {
            const clause = Clause.callFunction(stargateNFTAddress, migrateTokenManagerFunction, [
                migration.tokenId,
                migration.tokenManager,
            ]);
            clauses.push(clause);
        }

        try {
            // If dry run mode, skip transaction execution
            if (!executeTransactions) {
                log(`🔍 Dry run mode. Skipping transaction execution.`);
                for (const migration of validMigrations) {
                    outputData.results.push({
                        tokenId: migration.tokenId,
                        tokenManager: migration.tokenManager,
                        status: "success",
                        dryRun: true,
                    });
                }
                outputData.successfulMigrations += validMigrations.length;

                continue;
            }
            // If execute transactions mode, execute the transactions

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
            for (const migration of validMigrations) {
                outputData.results.push({
                    tokenId: migration.tokenId,
                    tokenManager: migration.tokenManager,
                    status: "success",
                    txHash: txReceipt.meta.txID,
                });
                outputData.successfulMigrations++;
            }
        } catch (error) {
            // Add results to output data
            log(`❌ Migration script failed: ${error}`);
            for (const migration of validMigrations) {
                outputData.results.push({
                    tokenId: migration.tokenId,
                    tokenManager: migration.tokenManager,
                    status: "error",
                    error: error instanceof Error ? error.message : String(error),
                });
                outputData.failedMigrations++;
            }
        }
    }

    // Final summary
    log(`\n📊 Migration Summary:`);
    log(`  Total migrations: ${outputData.totalMigrations}`);
    log(`  Successful: ${outputData.successfulMigrations}`);
    log(`  Failed: ${outputData.failedMigrations}`);

    // Write results to file
    const outputFileName = executeTransactions ? "migration-results" : "migration-dryrun";

    await writeToFile(__dirname, outputFileName, outputData, inputData.environment, "results");
}

main().catch((error) => {
    console.error("❌ Migration script failed:", error);
    process.exitCode = 1;
});
