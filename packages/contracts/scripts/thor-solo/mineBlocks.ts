#!/usr/bin/env ts-node

// Import hardhat dynamically to avoid the HH12 error
import { ethers, network } from "hardhat";
import { mineBlocks } from "../../test/helpers/common";

/**
 * Script to mine blocks on VeChain Solo network
 * Usage: yarn contracts:mine-blocks (default: 5 blocks)
 * Custom: BLOCKS=10 yarn contracts:mine-blocks
 */
async function main() {
    // Check if we're running on vechain_solo
    if (network.name !== "vechain_solo") {
        console.error("❌ This script can only be run on vechain_solo network");
        console.error(`Current network: ${network.name}`);
        console.error(
            "Please use: npx hardhat run scripts/thor-solo/mine-blocks.ts --network vechain_solo"
        );
        process.exit(1);
    }

    // Get number of blocks from environment variable with default
    const blocksEnv = process.env.BLOCKS || "5";
    const blocksToMine = parseInt(blocksEnv);

    if (isNaN(blocksToMine) || blocksToMine <= 0) {
        console.error("❌ Invalid number of blocks. Please provide a positive integer.");
        process.exit(1);
    }

    console.log(`⛏️  Mining ${blocksToMine} blocks on ${network.name}...`);

    // Get current block number before mining
    const currentBlockBefore = await ethers.provider.getBlockNumber();
    console.log(`📦 Current block before mining: ${currentBlockBefore}`);

    const startTime = Date.now();

    try {
        await mineBlocks(blocksToMine);

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        // Get current block number after mining
        const currentBlockAfter = await ethers.provider.getBlockNumber();
        console.log(`📦 Current block after mining: ${currentBlockAfter}`);
        console.log(
            `✅ Successfully mined ${blocksToMine} blocks in ${duration.toFixed(2)} seconds`
        );
        console.log(`⚡ Average: ${(blocksToMine / duration).toFixed(2)} blocks/second`);

        // Verify the expected number of blocks were mined
        const actualBlocksMined = currentBlockAfter - currentBlockBefore;
        if (actualBlocksMined === blocksToMine) {
            console.log(
                `✅ Block mining verification passed: ${actualBlocksMined} blocks mined as expected`
            );
        } else {
            console.warn(
                `⚠️  Block mining verification warning: Expected ${blocksToMine}, but ${actualBlocksMined} blocks were actually mined`
            );
        }
    } catch (error) {
        console.error("❌ Error mining blocks:", error);
        process.exit(1);
    }
}

// Run the script
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("❌ Script failed:", error);
        process.exit(1);
    });
