import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { ethers, network } from "hardhat";
import { StargateDelegation__factory, StargateDelegation } from "../../../typechain-types";
import * as path from "path";
import * as fs from "fs";
import {
  ProviderInternalBaseWallet,
  signerUtils,
  ThorClient,
  VeChainProvider,
} from "@vechain/sdk-network";
import { Mnemonic, Address, Clause, ABIContract } from "@vechain/sdk-core";

interface BugInstance {
  tokenId: string;
  claimBlock: number;
  rewards: string;
  type?: string;
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

async function main() {
  if (!process.env.VITE_APP_ENV) {
    throw new Error("Missing VITE_APP_ENV environment variable");
  }

  if (!process.env.MNEMONIC) {
    throw new Error("Missing MNEMONIC environment variable");
  }

  const environment = process.env.VITE_APP_ENV as EnvConfig;
  const config = getConfig(environment);

  // Setup SDK
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

  console.log("\n=== NFT Rewards Claiming Script (Burned + Transferred) ===");
  console.log(`Environment: ${environment}`);
  console.log(`Network: ${config.network.name} (${network.name})`);
  console.log(`Deployer address: ${await signer?.getAddress()}`);
  console.log(`StargateDelegation contract: ${config.stargateDelegationContractAddress}`);

  // Load compensation data
  console.log("\n📂 Loading compensation data...");
  const compensationData = await loadCompensationData(environment);

  console.log(`📊 Data Summary:`);
  console.log(`  • Total bug instances: ${compensationData.summary.totalBugInstances}`);
  console.log(`  • Burned NFTs found: ${compensationData.summary.burnedNftsFound}`);
  console.log(
    `  • Burned NFT total rewards: ${compensationData.summary.burnedNftTotalRewardsEther} VTHO`
  );
  console.log(`  • Network: ${compensationData.summary.network}`);
  console.log(`  • Block range: ${compensationData.summary.blockRange}`);

  // Process the data to find eligible NFT entries (burned or transferred)
  console.log("\n🔄 Processing NFT compensation data (burned + transferred)...");
  const { owners, tokenIds, amounts, totalEntries } = await processBurnedNftData(compensationData);

  if (totalEntries === 0) {
    console.log("❌ No eligible NFT entries found in compensation data");
    console.log(
      "💡 This might mean all rewards were already claimed or there are no eligible NFTs (burned or transferred)"
    );
    process.exit(0);
  }

  console.log(`📋 Eligible NFT entries found: ${totalEntries}`);
  console.log(`  • Unique owners: ${new Set(owners).size}`);
  console.log(
    `  • Total VTHO to claim: ${amounts.reduce((sum: bigint, amount: bigint) => sum + amount, 0n)} wei`
  );

  // Get contract instance for checking claimable rewards
  const stargateDelegation = (await ethers.getContractAt(
    "StargateDelegation",
    config.stargateDelegationContractAddress
  )) as StargateDelegation;

  // Show preview of entries to be claimed
  console.log("\n📋 Preview of eligible NFT entries to be claimed:");
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
  const BATCH_SIZE = 30; // Smaller batch size for individual transactions
  const totalBatches = Math.ceil(totalEntries / BATCH_SIZE);

  console.log(
    `\n🚀 Starting claiming process in ${totalBatches} batches (${BATCH_SIZE} transactions per batch)...\n`
  );

  let successfulClaims = 0;

  for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
    const start = batchIndex * BATCH_SIZE;
    const end = Math.min(start + BATCH_SIZE, totalEntries);

    const batchOwners = owners.slice(start, end);
    const batchTokenIds = tokenIds.slice(start, end);
    const batchAmounts = amounts.slice(start, end);

    console.log(
      `📦 Processing batch ${batchIndex + 1}/${totalBatches} (entries ${start + 1}-${end})...`
    );

    // Pre-validate which entries have claimable rewards to avoid transaction failures
    const validEntries: { owner: string; tokenId: bigint; amount: bigint }[] = [];

    console.log(`  🔍 Pre-validating ${batchOwners.length} entries...`);
    for (let i = 0; i < batchOwners.length; i++) {
      const owner = batchOwners[i];
      const tokenId = batchTokenIds[i];
      const amount = batchAmounts[i];

      try {
        const lostRewards = await stargateDelegation.claimableLostRewards(owner, tokenId);

        if (lostRewards === 0n) {
          console.log(`    ⚠️  No rewards for ${owner.slice(0, 8)}.../${tokenId} - skipping`);
          continue;
        }

        validEntries.push({ owner, tokenId, amount });
      } catch (error: any) {
        console.log(`    ❌ Error checking ${owner.slice(0, 8)}.../${tokenId}: ${error.message}`);
      }
    }

    if (validEntries.length === 0) {
      console.log(`  ⚠️  No valid entries in this batch - skipping`);
      continue;
    }

    console.log(`  ✅ Found ${validEntries.length} valid entries to claim`);

    // Build clauses for individual transactions
    const clauses = [];
    for (const entry of validEntries) {
      const clause = Clause.callFunction(
        Address.of(config.stargateDelegationContractAddress),
        ABIContract.ofAbi(StargateDelegation__factory.abi).getFunction("claimLostRewards"),
        [entry.owner, entry.tokenId]
      );
      clauses.push(clause);
    }

    const totalBatchAmount = validEntries.reduce((sum, e) => sum + e.amount, 0n);

    try {
      console.log(
        `  ⏳ Sending a transaction with ${validEntries.length} claimLostRewards clauses (${totalBatchAmount} wei total)...`
      );

      const gasResult = await thor.gas.estimateGas(clauses, await signer.getAddress(), {
        gasPadding: 1,
      });

      const txBody = await thor.transactions.buildTransactionBody(clauses, gasResult.totalGas);

      const txInput = signerUtils.transactionBodyToTransactionRequestInput(
        txBody,
        await signer.getAddress()
      );

      const rawSignedTransaction = await signer.signTransaction(txInput);

      const tx = await thor.transactions.sendRawTransaction(rawSignedTransaction);
      const txReceipt = await tx.wait();

      if (txReceipt && txReceipt.reverted) {
        throw new Error("Transaction failed");
      }

      console.log(`    ✅ Batch ${batchIndex + 1} completed!`);

      successfulClaims += validEntries.length;
    } catch (error: any) {
      console.error(`    ❌ Error in batch ${batchIndex + 1}:`, error.message);

      throw error;
    }

    // Delay between batches
    if (batchIndex < totalBatches - 1) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Longer delay between batches
    }
  }

  console.log("\n🎉 NFT rewards claiming completed!");
  console.log(`✅ Successful claims: ${successfulClaims}`);
  console.log(`📊 Total entries processed: ${totalEntries}`);

  process.exit(0);
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

async function processBurnedNftData(compensationData: CompensationData) {
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

  const stargateNft = await ethers.getContractAt(
    "StargateNFT",
    getConfig().stargateNFTContractAddress
  );

  // for each entry include entries that are either burned OR where current owner differs from mapping owner
  const eligibleEntries = await Promise.all(
    lostRewardsEntries.map(async (entry) => {
      const tokenExists = await stargateNft.tokenExists(entry.tokenId);

      // If token is burned, include it
      if (!tokenExists) {
        return { ...entry, reason: "burned" };
      }

      // If token exists, check if current owner is different from mapping owner
      try {
        const currentOwner = await stargateNft.ownerOf(entry.tokenId);
        if (currentOwner.toLowerCase() !== entry.owner.toLowerCase()) {
          return { ...entry, reason: "transferred" };
        }
      } catch (error) {
        // If ownerOf fails, token might be burned or in invalid state
        return { ...entry, reason: "invalid_state" };
      }

      // Token exists and owner hasn't changed, exclude it
      return null;
    })
  );

  const filteredOwners = eligibleEntries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => entry.owner);
  const filteredTokenIds = eligibleEntries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => entry.tokenId);
  const filteredAmounts = eligibleEntries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .map((entry) => entry.totalRewards);

  // Log summary of reasons
  const reasonCounts = eligibleEntries
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .reduce(
      (acc, entry) => {
        acc[entry.reason] = (acc[entry.reason] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

  console.log(`Found ${filteredOwners.length} eligible entries:`);
  console.log(`  • Burned NFTs: ${reasonCounts.burned || 0}`);
  console.log(`  • Transferred NFTs: ${reasonCounts.transferred || 0}`);
  console.log(`  • Invalid state NFTs: ${reasonCounts.invalid_state || 0}`);

  return {
    owners: filteredOwners,
    tokenIds: filteredTokenIds,
    amounts: filteredAmounts,
    totalEntries: filteredOwners.length,
    stargateNft,
  };
}

// Handle errors
main().catch((error) => {
  console.error("\n❌ Error during claiming:", error);
  process.exit(1);
});
