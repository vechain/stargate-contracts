#!/usr/bin/env ts-node

import { ethers, network } from "hardhat";
import { fastForwardValidatorPeriods } from "../../test/helpers/common";
import { getConfig } from "@repo/config";
import { isValid } from "@repo/utils/AddressUtils";

/**
 * Script to fast-forward validator periods on VeChain Solo network
 * Usage: yarn contracts:fast-forward-periods (default: 1 period)
 * Custom: PERIODS=3 yarn contracts:fast-forward-periods
 *
 * Environment variables:
 * - PERIODS: Number of additional periods to complete (default: 1)
 * - VALIDATOR_ADDRESS: Validator address to check (optional, uses first active validator if not specified)
 */
async function main() {
    // Check if we're running on vechain_solo
    if (network.name !== "vechain_solo") {
        console.error("❌ This script can only be run on vechain_solo network");
        console.error(`Current network: ${network.name}`);
        console.error(
            "Please use: npx hardhat run scripts/thor-solo/fast-forward-periods.ts --network vechain_solo"
        );
        process.exit(1);
    }

    // Get number of periods from environment variable with default
    const periodsToComplete = parseInt(process.env.PERIODS || "1");

    if (isNaN(periodsToComplete) || periodsToComplete < 0) {
        console.error("❌ Invalid number of periods. Please provide a non-negative integer.");
        process.exit(1);
    }

    const validatorAddress =
        process.env.VALIDATOR_ADDRESS || "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa";
    if (!isValid(validatorAddress)) {
        console.error("❌ Invalid validator address. Please provide a valid address.");
        process.exit(1);
    }

    console.log(
        `⏭️  Fast-forwarding ${periodsToComplete} periods for validator ${validatorAddress} on ${network.name}...`
    );

    try {
        // Get network config
        const config = getConfig();

        // Get protocol staker contract to read validator info
        const protocolStakerContract = await ethers.getContractAt(
            "IProtocolStaker",
            config.protocolStakerContractAddress!
        );

        // Get validator period details
        const [period, startBlock, exitBlock, completedPeriods] =
            await protocolStakerContract.getValidationPeriodDetails(validatorAddress);

        console.log(`📊 Validator period details:`);
        console.log(`  🕒 Period length: ${period} blocks`);
        console.log(`  🚀 Start block: ${startBlock}`);
        console.log(`  🏁 Exit block: ${exitBlock}`);
        console.log(`  ✅ Completed periods: ${completedPeriods}`);
        console.log(`  🔄 Current ongoing period: ${Number(completedPeriods) + 1}`);

        // Get current block before fast-forwarding
        const currentBlockBefore = await ethers.provider.getBlockNumber();
        console.log(`📦 Current block before fast-forward: ${currentBlockBefore}`);

        const startTime = Date.now();

        // Fast-forward the periods
        const blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete == 1 ? 0 : periodsToComplete
        );

        const endTime = Date.now();
        const duration = (endTime - startTime) / 1000;

        // Get current block after fast-forwarding
        const currentBlockAfter = await ethers.provider.getBlockNumber();
        console.log(`📦 Current block after fast-forward: ${currentBlockAfter}`);

        // Get updated validator period details
        const [, , , newCompletedPeriods] =
            await protocolStakerContract.getValidationPeriodDetails(validatorAddress);

        console.log(`✅ Successfully fast-forwarded ${periodsToComplete} periods!`);
        console.log(`⛏️  Mined ${blocksMined} blocks in ${duration.toFixed(2)} seconds`);
        console.log(`  ✅ Completed periods: ${newCompletedPeriods}`);
        console.log(`  🔄 Current ongoing period: ${Number(newCompletedPeriods) + 1}`);

        // Verify the expected number of periods were completed
        const actualPeriodsCompleted = Number(newCompletedPeriods) - Number(completedPeriods);
        if (actualPeriodsCompleted < periodsToComplete) {
            console.warn(
                `⚠️  Period completion verification warning: Expected at least ${periodsToComplete} periods, but ${actualPeriodsCompleted} periods were completed`
            );
        }
    } catch (error) {
        console.error("❌ Error fast-forwarding periods:", error);
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
