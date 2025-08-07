import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import { StargateDelegation } from "../../../typechain-types";
import * as path from "path";
import * as fs from "fs";
import inquirer from "inquirer";

interface BugInstance {
  tokenId: string;
  claimBlock: number;
  rewards: string;
}

interface OwnerCompensation {
  owner: string;
  totalRewards: string;
  totalRewardsEther: string;
  tokenCount: number;
  bugInstanceCount: number;
  tokens: string[];
  bugInstances: BugInstance[];
}

interface CompensationData {
  summary: {
    totalBugInstances: number;
    uniqueTokensAffected: number;
    singleCycleTokens: number;
    multiCycleTokens: number;
    uniqueOwnersAffected: number;
    burnedNftsFound: number;
    burnedNftTotalRewards: string;
    burnedNftTotalRewardsEther: string;
    totalLostRewards: string;
    totalLostRewardsEther: string;
    bugTypeDistribution: Record<string, number>;
    generatedAt: string;
    blockRange: string;
    network: string;
    environment: string;
  };
  compensationByOwner: OwnerCompensation[];
}

async function loadCompensationData(environment: string): Promise<CompensationData> {
  const fileName = `lost-rewards-compensation-${environment}.json`;
  const filePath = path.join(__dirname, "..", "calculate", fileName);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Compensation data file not found: ${filePath}`);
  }

  const fileContent = fs.readFileSync(filePath, "utf8");
  return JSON.parse(fileContent) as CompensationData;
}

function processCompensationData(compensationData: CompensationData) {
  // Process compensationByOwner to handle multiple bug instances per token
  const lostRewardsEntries: { owner: string; tokenId: bigint; totalRewards: bigint }[] = [];

  for (const ownerData of compensationData.compensationByOwner) {
    const owner = ownerData.owner;

    // Group bug instances by tokenId and sum rewards
    const tokenRewards = new Map<string, bigint>();

    for (const bugInstance of ownerData.bugInstances) {
      const tokenId = bugInstance.tokenId;
      const rewards = BigInt(bugInstance.rewards);

      if (tokenRewards.has(tokenId)) {
        tokenRewards.set(tokenId, tokenRewards.get(tokenId)! + rewards);
      } else {
        tokenRewards.set(tokenId, rewards);
      }
    }

    // Add entries for each token
    for (const [tokenId, totalRewards] of tokenRewards) {
      lostRewardsEntries.push({
        owner,
        tokenId: BigInt(tokenId),
        totalRewards,
      });
    }
  }

  // Extract arrays for contract call
  const owners = lostRewardsEntries.map((entry) => entry.owner);
  const tokenIds = lostRewardsEntries.map((entry) => entry.tokenId);
  const amounts = lostRewardsEntries.map((entry) => entry.totalRewards);

  return { owners, tokenIds, amounts, totalEntries: lostRewardsEntries.length };
}

async function main() {
  if (!process.env.VITE_APP_ENV) {
    throw new Error("Missing VITE_APP_ENV environment variable");
  }

  const environment = process.env.VITE_APP_ENV as EnvConfig;
  const config = getConfig(environment);
  const [deployer] = await ethers.getSigners();

  console.log("\n=== Lost Rewards Seeding Script ===");
  console.log(`Environment: ${environment}`);
  console.log(`Network: ${config.network.name} (${network.name})`);
  console.log(`Deployer address: ${deployer.address}`);
  console.log(`StargateDelegation contract: ${config.stargateDelegationContractAddress}`);

  // Load compensation data
  console.log("\n📂 Loading compensation data...");
  const compensationData = await loadCompensationData(environment);

  console.log(`📊 Data Summary:`);
  console.log(`  • Total bug instances: ${compensationData.summary.totalBugInstances}`);
  console.log(`  • Unique tokens affected: ${compensationData.summary.uniqueTokensAffected}`);
  console.log(`  • Unique owners affected: ${compensationData.summary.uniqueOwnersAffected}`);
  console.log(`  • Total lost rewards: ${compensationData.summary.totalLostRewardsEther} VTHO`);
  console.log(`  • Network: ${compensationData.summary.network}`);
  console.log(`  • Block range: ${compensationData.summary.blockRange}`);

  // Process the data
  console.log("\n🔄 Processing compensation data...");
  const { owners, tokenIds, amounts, totalEntries } = processCompensationData(compensationData);

  console.log(`📋 Processed entries: ${totalEntries}`);
  console.log(`  • Unique owners: ${new Set(owners).size}`);
  console.log(`  • Total VTHO to seed: ${amounts.reduce((sum, amount) => sum + amount, 0n)} wei`);

  // Get contract instance
  const stargateDelegation = (await ethers.getContractAt(
    "StargateDelegation",
    config.stargateDelegationContractAddress
  )) as StargateDelegation;

  // Check if deployer has the required role
  console.log("\n🔐 Checking permissions...");
  const LOST_REWARDS_WHITELISTER_ROLE = await stargateDelegation.LOST_REWARDS_WHITELISTER_ROLE();
  const hasRole = await stargateDelegation.hasRole(LOST_REWARDS_WHITELISTER_ROLE, deployer.address);

  if (!hasRole) {
    throw new Error(`Deployer ${deployer.address} does not have LOST_REWARDS_WHITELISTER_ROLE`);
  }
  console.log("✅ Deployer has required permissions");

  // Show preview of entries to be seeded
  console.log("\n📋 Preview of entries to be seeded:");
  for (let i = 0; i < Math.min(5, totalEntries); i++) {
    const entry = { owner: owners[i], tokenId: tokenIds[i], amount: amounts[i] };
    console.log(
      `  ${i + 1}. Owner: ${entry.owner.slice(0, 8)}... | Token: ${entry.tokenId} | Amount: ${entry.amount} wei`
    );
  }
  if (totalEntries > 5) {
    console.log(`  ... and ${totalEntries - 5} more entries`);
  }

  // Batch the operations to avoid gas limits and large transaction issues
  const BATCH_SIZE = 600; // Adjust based on network gas limits
  const totalBatches = Math.ceil(totalEntries / BATCH_SIZE);

  console.log(
    `\n🚀 Starting seeding process in ${totalBatches} batches (${BATCH_SIZE} entries per batch)...\n`
  );

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, totalEntries);

    const batchOwners = owners.slice(start, end);
    const batchTokenIds = tokenIds.slice(start, end);
    const batchAmounts = amounts.slice(start, end);

    console.log(
      `📦 Processing batch ${batchIndex + 1}/${totalBatches} (entries ${start + 1}-${end})...`
    );

    try {
      const tx = await stargateDelegation.addLostRewards(batchOwners, batchTokenIds, batchAmounts, {
        gasLimit: 20000000,
      });
      console.log(`  ⏳ Transaction submitted: ${tx.hash}`);

      const receipt = await tx.wait();
      console.log(
        `  ✅ Batch ${batchIndex + 1} completed! Gas used: ${receipt?.gasUsed.toString()}`
      );

      // Small delay between batches to avoid overwhelming the network
      if (batchIndex < totalBatches - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      console.error(`  ❌ Error in batch ${batchIndex + 1}:`, error);
      throw error;
    }
  }

  console.log("\n🎉 Lost rewards seeding completed successfully!");
  console.log(`✅ Total entries seeded: ${totalEntries}`);
  console.log(`✅ Total owners affected: ${new Set(owners).size}`);
  console.log(
    `✅ Total VTHO amount seeded: ${amounts.reduce((sum, amount) => sum + amount, 0n)} wei`
  );

  process.exit(0);
}

// Handle errors
main().catch((error) => {
  console.error("\n❌ Error during seeding:", error);
  process.exit(1);
});
