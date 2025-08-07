import { ethers, network } from "hardhat";
import { StargateDelegation, StargateNFT } from "../../../typechain-types";
import { getConfig } from "@repo/config";

// Event interfaces for type safety
interface TokenEvent {
  type:
    | "minted"
    | "delegationStarted"
    | "rewardsClaimed"
    | "delegationExit"
    | "transfer"
    | "unstake";
  tokenId: string;
  blockNumber: number;
  transactionHash: string;
  data: any;
}

interface BugInstance {
  tokenId: string;
  owner: string; // Owner at the time of the bug
  delegationStartBlock: number;
  rewardsAccumulationStartBlock: number;
  claimBlock: number;
  expectedAccumulationStartBlock: number;
  lostBlocks: number;
  lostRewards: bigint;
  rewardRate: bigint;
  delegationStartTx: string;
  claimTx: string;
  tags: string[]; // Array of tags instead of single type
}

// Helper function to fetch events in chunks
async function fetchEventsInChunks(
  contract: any,
  filter: any,
  fromBlock: number,
  toBlock: number,
  chunkSize: number = 100000
): Promise<any[]> {
  const allEvents: any[] = [];
  let currentBlock = fromBlock;
  const totalBlocks = toBlock - fromBlock + 1;
  let processedBlocks = 0;

  // Conditional logging function
  const log = (...args: any[]) => {
    const verbose = process.env.VERBOSE === "true";
    if (verbose) {
      console.log(...args);
    }
  };

  log(`    📊 Processing ${totalBlocks} blocks in chunks of ${chunkSize}...`);

  while (currentBlock <= toBlock) {
    const endChunk = Math.min(currentBlock + chunkSize - 1, toBlock);
    const chunkBlocks = endChunk - currentBlock + 1;
    processedBlocks += chunkBlocks;

    const progress = ((processedBlocks / totalBlocks) * 100).toFixed(1);
    log(`    📡 [${progress}%] Fetching events from block ${currentBlock} to ${endChunk}...`);

    const events = await contract.queryFilter(filter, currentBlock, endChunk);
    allEvents.push(...events);

    if (events.length > 0) {
      log(`    ✅ Found ${events.length} events in this chunk`);
    }

    currentBlock = endChunk + 1;
  }

  return allEvents;
}

export async function main() {
  const startTime = Date.now();

  // Environment variables
  const startBlockInput = process.env.START_BLOCK || "0";
  const endBlockInput = process.env.END_BLOCK || "latest";
  const debugTokenId = process.env.DEBUG_TOKEN_ID || null;
  const verbose = process.env.VERBOSE === "true";

  // Conditional logging function
  const log = (...args: any[]) => {
    if (verbose) {
      console.log(...args);
    }
  };

  if (!startBlockInput) {
    log(
      "Usage: START_BLOCK=<block> [END_BLOCK=<block>] [DEBUG_TOKEN_ID=<id>] [VERBOSE=true|false] yarn calculate-lost-rewards:mainnet"
    );
    process.exit(1);
  }

  // Get network config
  const config = getConfig();
  log(`🔗 Using network: ${network.name}`);
  log(`📋 Environment: ${config.environment}`);

  // Get contract instances
  const stargateDelegation = (await ethers.getContractAt(
    "StargateDelegation",
    config.stargateDelegationContractAddress!
  )) as StargateDelegation;

  const stargateNFT = (await ethers.getContractAt(
    "StargateNFT",
    config.stargateNFTContractAddress!
  )) as StargateNFT;

  // Step 0: Get delegation period from contract
  const delegationPeriod = Number(await stargateDelegation.getDelegationPeriod());
  log(`📅 Delegation period: ${delegationPeriod} blocks`);

  // Parse block range
  const startBlock =
    startBlockInput === "latest"
      ? await ethers.provider.getBlockNumber()
      : parseInt(startBlockInput);
  const endBlock =
    endBlockInput === "latest" ? await ethers.provider.getBlockNumber() : parseInt(endBlockInput);

  log(`🔍 Analyzing blocks ${startBlock} to ${endBlock}`);
  log(`🎯 Debug token: ${debugTokenId || "none"}`);

  // Step 1: Fetch all relevant events in parallel
  log(`\n📊 Step 1: Fetching all relevant events...`);

  const [
    tokenMintedEvents,
    delegationStartedEvents,
    rewardsClaimedEvents,
    delegationExitEvents,
    transferEvents,
    unstakeEvents,
  ] = await Promise.all([
    fetchEventsInChunks(stargateNFT, stargateNFT.filters.TokenMinted(), startBlock, endBlock, 500),
    fetchEventsInChunks(
      stargateDelegation,
      stargateDelegation.filters.DelegationSimulationStarted(),
      startBlock,
      endBlock,
      500
    ),
    fetchEventsInChunks(
      stargateDelegation,
      stargateDelegation.filters.DelegationRewardsClaimed(),
      startBlock,
      endBlock,
      500
    ),
    fetchEventsInChunks(
      stargateDelegation,
      stargateDelegation.filters.DelegationExitRequested(),
      startBlock,
      endBlock,
      500
    ),
    fetchEventsInChunks(stargateNFT, stargateNFT.filters.Transfer(), startBlock, endBlock, 500),
    fetchEventsInChunks(stargateNFT, stargateNFT.filters.TokenBurned(), startBlock, endBlock, 500),
  ]);

  log(`✅ Found ${tokenMintedEvents.length} token minted events`);
  log(`✅ Found ${delegationStartedEvents.length} delegation started events`);
  log(`✅ Found ${rewardsClaimedEvents.length} rewards claimed events`);
  log(`✅ Found ${delegationExitEvents.length} delegation exit events`);
  log(`✅ Found ${transferEvents.length} transfer events`);
  log(`✅ Found ${unstakeEvents.length} unstake events`);

  // Step 2: Process and organize events by tokenId
  log(`\n📊 Step 2: Processing and organizing events by token...`);

  const tokenEvents = new Map<string, TokenEvent[]>();
  const tokenLevels = new Map<string, number>();

  // Process TokenMinted events
  for (const event of tokenMintedEvents) {
    const tokenId = event.args!.tokenId.toString();
    const owner = event.args!.owner;
    const levelId = Number(event.args!.levelId);
    const migrated = event.args!.migrated;

    tokenLevels.set(tokenId, levelId);

    if (!tokenEvents.has(tokenId)) {
      tokenEvents.set(tokenId, []);
    }

    tokenEvents.get(tokenId)!.push({
      type: "minted",
      tokenId,
      blockNumber: event.blockNumber!,
      transactionHash: event.transactionHash!,
      data: { owner, levelId, migrated },
    });
  }

  // Process DelegationStarted events
  for (const event of delegationStartedEvents) {
    const tokenId = event.args!.tokenId.toString();

    if (!tokenEvents.has(tokenId)) {
      tokenEvents.set(tokenId, []);
    }

    tokenEvents.get(tokenId)!.push({
      type: "delegationStarted",
      tokenId,
      blockNumber: event.blockNumber!,
      transactionHash: event.transactionHash!,
      data: {
        delegator: event.args!.delegator,
        rewardsAccumulationStartBlock: Number(event.args!.rewardsAccumulationStartBlock),
        isDelegationForever: event.args!.isDelegationForever,
      },
    });
  }

  // Process RewardsClaimed events
  for (const event of rewardsClaimedEvents) {
    const tokenId = event.args!.tokenId.toString();

    if (!tokenEvents.has(tokenId)) {
      tokenEvents.set(tokenId, []);
    }

    tokenEvents.get(tokenId)!.push({
      type: "rewardsClaimed",
      tokenId,
      blockNumber: event.blockNumber!,
      transactionHash: event.transactionHash!,
      data: {
        rewards: event.args!.rewards,
        claimer: event.args!.claimer,
        recipient: event.args!.recipient,
      },
    });
  }

  // Process DelegationExit events
  for (const event of delegationExitEvents) {
    const tokenId = event.args!.tokenId.toString();

    if (!tokenEvents.has(tokenId)) {
      tokenEvents.set(tokenId, []);
    }

    tokenEvents.get(tokenId)!.push({
      type: "delegationExit",
      tokenId,
      blockNumber: event.blockNumber!,
      transactionHash: event.transactionHash!,
      data: {
        delegationEndBlock: Number(event.args!.delegationEndBlock),
      },
    });
  }

  // Process Transfer events (exclude mint/burn)
  for (const event of transferEvents) {
    const tokenId = event.args!.tokenId.toString();
    const from = event.args!.from;
    const to = event.args!.to;

    // Skip mint (from 0x0) and burn (to 0x0) transfers
    if (from === ethers.ZeroAddress || to === ethers.ZeroAddress) {
      continue;
    }

    if (!tokenEvents.has(tokenId)) {
      tokenEvents.set(tokenId, []);
    }

    tokenEvents.get(tokenId)!.push({
      type: "transfer",
      tokenId,
      blockNumber: event.blockNumber!,
      transactionHash: event.transactionHash!,
      data: { from, to },
    });
  }

  // Process Unstake events (TokenBurned)
  for (const event of unstakeEvents) {
    const tokenId = event.args!.tokenId.toString();

    if (!tokenEvents.has(tokenId)) {
      tokenEvents.set(tokenId, []);
    }

    tokenEvents.get(tokenId)!.push({
      type: "unstake",
      tokenId,
      blockNumber: event.blockNumber!,
      transactionHash: event.transactionHash!,
      data: {
        owner: event.args!.owner,
      },
    });
  }

  // Step 3: Analyze each token for the bug
  log(`\n📊 Step 3: Analyzing tokens for the bug...`);

  const bugInstances: BugInstance[] = [];
  let totalTokensAnalyzed = 0;
  let tokensWithClaims = 0;
  let burnedNftsFound = 0;
  let burnedNftTotalRewards = 0n;
  let burnedNftsWithBugs = 0; // Track how many burned NFTs actually had bugs

  // Filter tokens to analyze
  const tokensToAnalyze = debugTokenId
    ? [debugTokenId]
    : Array.from(tokenEvents.keys()).filter((tokenId) => {
        const events = tokenEvents.get(tokenId)!;
        return events.some((e) => e.type === "rewardsClaimed");
      });

  log(`🎯 Analyzing ${tokensToAnalyze.length} tokens with reward claims...`);

  for (const tokenId of tokensToAnalyze) {
    const events = tokenEvents.get(tokenId) || [];
    const tokenLevel = tokenLevels.get(tokenId);

    if (!tokenLevel) {
      log(`⚠️  No token level found for token ${tokenId}, skipping...`);
      continue;
    }

    totalTokensAnalyzed++;

    // Sort events chronologically
    events.sort((a, b) => a.blockNumber - b.blockNumber);

    log(`\n🔍 DEBUG Token ${tokenId}:`);
    log(`  📊 Total events: ${events.length}`);
    log(`  🎯 Token level: ${tokenLevel}`);

    log(`\n  📋 Event timeline:`);
    events.forEach((e, i) => {
      const eventInfo = (() => {
        switch (e.type) {
          case "minted":
            return `owner: ${e.data.owner}, level: ${e.data.levelId}, migrated: ${e.data.migrated}`;
          case "transfer":
            return `${e.data.from} → ${e.data.to}`;
          case "delegationStarted":
            return `delegator: ${e.data.delegator}, accumulation starts: ${e.data.rewardsAccumulationStartBlock} with auto-renewal: ${e.data.isDelegationForever}`;
          case "rewardsClaimed":
            return `claimer: ${e.data.claimer}, recipient: ${e.data.recipient}, amount: ${ethers.formatEther(e.data.rewards)} VTHO`;
          case "delegationExit":
            return `ends at block: ${e.data.delegationEndBlock}`;
          case "unstake":
            return `owner: ${e.data.owner}`;
          default:
            return "";
        }
      })();
      log(`    ${i + 1}. Block ${e.blockNumber}: ${e.type.toUpperCase()} - ${eventInfo}`);
    });

    log(`\n  🔬 Detailed analysis starting...`);

    // Check if token was burned
    const isBurnedNft = events.some((e) => e.type === "unstake");
    if (isBurnedNft) {
      burnedNftsFound++;
    }

    // Analyze the token for bug instances
    const tokenBugInstances = await analyzeTokenForBug(
      tokenId,
      events,
      tokenLevel,
      delegationPeriod,
      stargateDelegation,
      verbose
    );

    if (tokenBugInstances.length > 0) {
      tokensWithClaims++;
      bugInstances.push(...tokenBugInstances);

      // Track burned NFT compensation with detailed logging
      if (isBurnedNft) {
        burnedNftsWithBugs++;
        const tokenRewards = tokenBugInstances.reduce((sum, bug) => sum + bug.lostRewards, 0n);
        burnedNftTotalRewards += tokenRewards;

        if (verbose) {
          log(
            `🔥 Burned NFT ${tokenId} has ${tokenBugInstances.length} bug instances, total rewards: ${ethers.formatEther(tokenRewards)} VTHO`
          );
        }
      }
    } else if (isBurnedNft && verbose) {
      log(`🔥 Burned NFT ${tokenId} has no bug instances`);
    }

    // Show debug summary for this token
    if (debugTokenId === tokenId) {
      log(`\n  📊 ANALYSIS SUMMARY for Token ${tokenId}:`);
      log(`    🔥 Burned NFT: ${isBurnedNft ? "Yes" : "No"}`);
      log(`    🐛 Bug instances found: ${tokenBugInstances.length}`);

      if (tokenBugInstances.length > 0) {
        const totalLost = tokenBugInstances.reduce((sum, bug) => sum + bug.lostRewards, 0n);
        log(`    💸 Total compensation: ${ethers.formatEther(totalLost)} VTHO`);

        log(`\n    🎯 Compensation breakdown:`);
        tokenBugInstances.forEach((bug, i) => {
          log(`      ${i + 1}. Owner ${bug.owner}: ${ethers.formatEther(bug.lostRewards)} VTHO`);
          log(`         📅 Claim at block ${bug.claimBlock}, lost ${bug.lostBlocks} blocks`);
        });

        // Show unique owners for this token
        const uniqueOwners = [...new Set(tokenBugInstances.map((bug) => bug.owner))];
        if (uniqueOwners.length > 1) {
          log(`\n    👥 Multiple owners affected: ${uniqueOwners.length}`);
          uniqueOwners.forEach((owner) => {
            const ownerBugs = tokenBugInstances.filter((bug) => bug.owner === owner);
            const ownerTotal = ownerBugs.reduce((sum, bug) => sum + bug.lostRewards, 0n);
            log(
              `      • ${owner}: ${ethers.formatEther(ownerTotal)} VTHO (${ownerBugs.length} instances)`
            );
          });
        }
      } else {
        log(`    ✅ No compensation needed`);
      }
      log(`\n` + "=".repeat(80));
    }
  }

  // Analysis and output...
  log(`\n📈 Analysis complete!`);
  log(`📊 Total tokens analyzed: ${totalTokensAnalyzed}`);
  log(`💰 Tokens with claims: ${tokensWithClaims}`);
  log(`🐛 Bug instances found: ${bugInstances.length}`);
  log(`🔥 Burned NFTs found: ${burnedNftsFound}`);
  log(`🔥 Burned NFTs with bugs: ${burnedNftsWithBugs}`);
  if (burnedNftsFound > 0) {
    log(`💸 Burned NFT total compensation: ${ethers.formatEther(burnedNftTotalRewards)} VTHO`);
  }

  if (bugInstances.length > 0) {
    // Calculate totals
    const totalLostRewards = bugInstances.reduce((sum, bug) => sum + bug.lostRewards, 0n);

    // Analyze multi-cycle bug impact
    const tokenBugCounts = new Map<string, number>();
    const multiCycleBugInstances: { tokenId: string; instances: BugInstance[] }[] = [];

    // Count bug instances per token
    for (const bug of bugInstances) {
      const currentCount = tokenBugCounts.get(bug.tokenId) || 0;
      tokenBugCounts.set(bug.tokenId, currentCount + 1);
    }

    // Find tokens with multiple bug instances (multi-cycle impacts)
    for (const [tokenId, count] of tokenBugCounts.entries()) {
      if (count > 1) {
        const instances = bugInstances.filter((bug) => bug.tokenId === tokenId);
        multiCycleBugInstances.push({ tokenId, instances });
      }
    }

    // Add multiple_occurrences tag for tokens with multiple bug instances
    for (const bug of bugInstances) {
      const tokenBugCount = tokenBugCounts.get(bug.tokenId) || 1;
      if (tokenBugCount > 1 && !bug.tags.includes("multiple_occurrences")) {
        bug.tags.push("multiple_occurrences");
      }
    }

    // Analyze compensation by owner
    const ownerCompensation = new Map<
      string,
      {
        totalRewards: bigint;
        tokens: Set<string>;
        bugCount: number;
        bugInstances: { tokenId: string; claimBlock: number; rewards: bigint }[];
      }
    >();

    for (const bug of bugInstances) {
      // Track by owner at time of bug
      if (!ownerCompensation.has(bug.owner)) {
        ownerCompensation.set(bug.owner, {
          totalRewards: 0n,
          tokens: new Set(),
          bugCount: 0,
          bugInstances: [],
        });
      }
      const ownerData = ownerCompensation.get(bug.owner)!;
      ownerData.totalRewards += bug.lostRewards;
      ownerData.tokens.add(bug.tokenId);
      ownerData.bugCount += 1;
      ownerData.bugInstances.push({
        tokenId: bug.tokenId,
        claimBlock: bug.claimBlock,
        rewards: bug.lostRewards,
      });
    }

    log(`\n🔄 Multi-Cycle Bug Analysis:`);
    log(
      `📊 Tokens with single bug instance: ${tokenBugCounts.size - multiCycleBugInstances.length}`
    );
    log(`🎯 Tokens with multiple bug instances (multi-cycle): ${multiCycleBugInstances.length}`);

    if (multiCycleBugInstances.length > 0) {
      log(`\n🔥 Multi-Cycle Bug Victims (first 10):`);
      multiCycleBugInstances.slice(0, 10).forEach(({ tokenId, instances }, i) => {
        const totalLoss = instances.reduce((sum, bug) => sum + bug.lostRewards, 0n);
        log(`  ${i + 1}. Token ${tokenId}: ${instances.length} cycles affected`);
        log(`     💸 Total loss: ${ethers.formatEther(totalLoss)} VTHO`);
        instances.forEach((bug, j) => {
          log(
            `     🔄 Cycle ${j + 1}: ${ethers.formatEther(bug.lostRewards)} VTHO (${bug.lostBlocks} blocks) at block ${bug.claimBlock}`
          );
        });
      });

      const totalMultiCycleLoss = multiCycleBugInstances.reduce(
        (sum, { instances }) =>
          sum + instances.reduce((instanceSum, bug) => instanceSum + bug.lostRewards, 0n),
        0n
      );
      const averageCycles =
        multiCycleBugInstances.reduce((sum, { instances }) => sum + instances.length, 0) /
        multiCycleBugInstances.length;

      log(`\n📊 Multi-cycle impact summary:`);
      log(`💸 Total loss from multi-cycle bugs: ${ethers.formatEther(totalMultiCycleLoss)} VTHO`);
      log(`📈 Average cycles per affected token: ${averageCycles.toFixed(1)}`);
    }

    log(`\n👤 COMPENSATION BY OWNER (at time of bug):`);
    log(`📊 Unique owners affected: ${ownerCompensation.size}`);

    // Sort owners by compensation amount (descending)
    const sortedOwners = Array.from(ownerCompensation.entries())
      .sort(([, a], [, b]) => Number(b.totalRewards - a.totalRewards))
      .slice(0, 10); // Top 10

    sortedOwners.forEach(([owner, data], i) => {
      log(
        `  ${i + 1}. ${owner}: ${ethers.formatEther(data.totalRewards)} VTHO (${data.tokens.size} tokens, ${data.bugCount} instances)`
      );
    });

    log(`\n💸 Total lost rewards: ${ethers.formatEther(totalLostRewards)} VTHO`);

    // Show top worst cases
    const sortedBugs = bugInstances.sort((a, b) => Number(b.lostRewards - a.lostRewards));
    log(`\n🔝 Top 10 worst cases:`);
    for (let i = 0; i < Math.min(10, sortedBugs.length); i++) {
      const bug = sortedBugs[i];
      log(
        `  ${i + 1}. Token ${bug.tokenId} (${bug.tags.join(", ")}): ${ethers.formatEther(bug.lostRewards)} VTHO (${bug.lostBlocks} blocks)`
      );
    }

    // Generate and save JSON output
    log(`\n💾 Generating JSON output...`);

    // Calculate tag distribution
    const tagDistribution = {
      base: bugInstances.filter((bug) => bug.tags.includes("base")).length,
      burned_nft: bugInstances.filter((bug) => bug.tags.includes("burned_nft")).length,
      multiple_occurrences: bugInstances.filter((bug) => bug.tags.includes("multiple_occurrences"))
        .length,
      multiple_transfers: bugInstances.filter((bug) => bug.tags.includes("multiple_transfers"))
        .length,
      multiple_claims_in_delegation: bugInstances.filter((bug) =>
        bug.tags.includes("multiple_claims_in_delegation")
      ).length,
      transferred: bugInstances.filter((bug) => bug.tags.includes("transferred")).length,
    };

    // Show bug tag distribution
    log(`\n🏷️  Bug Tag Distribution:`);
    log(`📊 Base bugs: ${tagDistribution.base}`);
    log(`🔥 Burned NFT bugs: ${tagDistribution.burned_nft}`);
    log(`🔄 Multiple occurrence bugs: ${tagDistribution.multiple_occurrences}`);
    log(`↔️  Multiple transfer bugs: ${tagDistribution.multiple_transfers}`);
    log(`📈 Multiple claims in delegation bugs: ${tagDistribution.multiple_claims_in_delegation}`);
    log(`📤 Transferred NFT bugs: ${tagDistribution.transferred}`);

    // Generate output data
    const outputData = {
      summary: {
        totalBugInstances: bugInstances.length,
        uniqueTokensAffected: tokenBugCounts.size,
        singleCycleTokens: tokenBugCounts.size - multiCycleBugInstances.length,
        multiCycleTokens: multiCycleBugInstances.length,
        uniqueOwnersAffected: ownerCompensation.size,
        burnedNftsFound: burnedNftsFound,
        burnedNftTotalRewards: burnedNftTotalRewards.toString(),
        burnedNftTotalRewardsEther: ethers.formatEther(burnedNftTotalRewards),
        totalLostRewards: totalLostRewards.toString(),
        totalLostRewardsEther: ethers.formatEther(totalLostRewards),
        bugTagDistribution: tagDistribution,
        generatedAt: new Date().toISOString(),
        blockRange: `${startBlock}-${endBlock}`,
        network: network.name,
        environment: config.environment,
      },
      compensationByOwner: Array.from(ownerCompensation.entries()).map(([owner, data]) => ({
        owner,
        totalRewards: data.totalRewards.toString(),
        totalRewardsEther: ethers.formatEther(data.totalRewards),
        tokenCount: data.tokens.size,
        bugInstanceCount: data.bugCount,
        tokens: Array.from(data.tokens),
        bugInstances: data.bugInstances.map((instance) => ({
          tokenId: instance.tokenId,
          claimBlock: instance.claimBlock,
          rewards: instance.rewards.toString(),
        })),
      })),
      compensations: bugInstances.map((bug) => ({
        tokenId: bug.tokenId,
        owner: bug.owner, // Owner at time of bug
        lostRewards: bug.lostRewards.toString(),
        lostRewardsEther: ethers.formatEther(bug.lostRewards),
        lostBlocks: bug.lostBlocks,
        claimBlock: bug.claimBlock,
        delegationStartBlock: bug.delegationStartBlock,
        rewardsAccumulationStartBlock: bug.rewardsAccumulationStartBlock,
        expectedAccumulationStartBlock: bug.expectedAccumulationStartBlock,
        delegationStartTx: bug.delegationStartTx,
        claimTx: bug.claimTx,
        tags: bug.tags,
      })),
    };

    // Write to file
    const fs = await import("fs");
    const path = await import("path");

    // Delete existing file if it exists
    const outputPath = path.join(__dirname, `lost-rewards-compensation-${config.environment}.json`);
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
      log(`🗑️  Deleted existing file: ${outputPath}`);
    }

    fs.writeFileSync(outputPath, JSON.stringify(outputData, null, 2));
    log(`💾 Compensation data written to: ${outputPath}`);
  } else {
    log(`\n✅ No bug instances found - no compensation needed!`);
  }

  const executionTime = (Date.now() - startTime) / 1000;
  log(
    `\n⏱️  EXECUTION TIME: ${executionTime.toFixed(2)}s (${(executionTime / 60).toFixed(2)} minutes)`
  );
  log(
    `📊 Performance: ${bugInstances.length > 0 ? (bugInstances.length / executionTime).toFixed(1) : 0} bug instances analyzed per second`
  );
}

// Analyze a single token for bug instances
async function analyzeTokenForBug(
  tokenId: string,
  events: TokenEvent[],
  tokenLevel: number,
  delegationPeriod: number,
  delegationContract: StargateDelegation,
  verbose: boolean = true
): Promise<BugInstance[]> {
  const bugInstances: BugInstance[] = [];

  // Conditional logging function
  const log = (...args: any[]) => {
    if (verbose) {
      console.log(...args);
    }
  };

  // Track delegation state and ownership
  let currentDelegationStart: TokenEvent | null = null;
  let currentDelegationEndBlock: number | null = null;
  let currentOwner = "";
  let delegationCount = 0;
  let claimsInCurrentDelegation: TokenEvent[] = []; // Track claims within current delegation

  // Get reward rate for this token level
  const rewardRate = await delegationContract.getVthoRewardPerBlock(tokenLevel);

  if (rewardRate === 0n) {
    log(`    ⚠️  Token ${tokenId} has 0 reward rate, skipping bug analysis`);

    return [];
  }

  log(`    📋 Processing ${events.length} events for token ${tokenId}...`);

  for (const event of events) {
    log(`    📝 Block ${event.blockNumber}: ${event.type}`);

    switch (event.type) {
      case "minted":
        currentOwner = event.data.owner;

        log(`      👤 Initial owner: ${currentOwner}`);

        break;

      case "transfer":
        const previousOwner = currentOwner;
        currentOwner = event.data.to;

        log(`      🔄 Owner transferred: ${previousOwner} → ${currentOwner}`);
        if (currentDelegationStart) {
          log(
            `      🔗 Transfer during active delegation (started at block ${currentDelegationStart.blockNumber})`
          );
        }

        break;

      case "delegationStarted":
        delegationCount++;
        currentDelegationStart = event;
        currentDelegationEndBlock = null; // Reset explicit exit block
        claimsInCurrentDelegation = []; // Reset claims for new delegation

        // If auto-renewal is OFF, calculate when delegation will automatically end
        if (!event.data.isDelegationForever) {
          const autoEndBlock = event.data.rewardsAccumulationStartBlock + delegationPeriod;
          currentDelegationEndBlock = autoEndBlock;

          log(`      🚀 Delegation #${delegationCount} started by ${event.data.delegator}`);
          log(`      👤 Current owner at delegation start: ${currentOwner}`);
          log(
            `      📍 Rewards accumulation starts at block: ${event.data.rewardsAccumulationStartBlock}`
          );
          log(`      ⚠️  Auto-renewal OFF - delegation will auto-end at block: ${autoEndBlock}`);
        } else {
          log(`      🚀 Delegation #${delegationCount} started by ${event.data.delegator}`);
          log(`      👤 Current owner at delegation start: ${currentOwner}`);
          log(
            `      📍 Rewards accumulation starts at block: ${event.data.rewardsAccumulationStartBlock}`
          );
          log(`      🔄 Auto-renewal ON - delegation continues indefinitely`);
        }
        break;

      case "delegationExit":
        // Explicit exit request - this overrides any auto-end calculation
        currentDelegationEndBlock = event.data.delegationEndBlock;

        log(`      🚪 Delegation #${delegationCount} explicit exit requested`);
        log(`      📅 Delegation will end at block: ${currentDelegationEndBlock}`);

        break;

      case "rewardsClaimed":
        if (currentDelegationStart) {
          // Check if the claim happened during active delegation
          const isDelegationActive =
            currentDelegationEndBlock === null || event.blockNumber < currentDelegationEndBlock;

          log(`      💰 Rewards claimed by ${event.data.claimer} → ${event.data.recipient}`);
          log(`      👤 Current owner at time of claim: ${currentOwner}`);
          log(`      🔗 Delegation #${delegationCount} active: ${isDelegationActive}`);
          if (!isDelegationActive) {
            const autoRenewal = currentDelegationStart.data.isDelegationForever;
            const reason = autoRenewal
              ? "explicit exit"
              : "auto-renewal OFF (delegation auto-ended)";
            log(
              `      ⏰ Claim after delegation ended (${reason} at block ${currentDelegationEndBlock})`
            );
          }

          if (isDelegationActive) {
            // Add this claim to the current delegation's claims
            claimsInCurrentDelegation.push(event);

            log(`      🔍 Analyzing claim for bug (delegation #${delegationCount})...`);
            log(`      📊 Claims in this delegation so far: ${claimsInCurrentDelegation.length}`);

            // Analyze this claim for the bug, considering previous claims in this delegation
            const bugInstance = await analyzeClaim(
              tokenId,
              currentDelegationStart,
              event,
              currentOwner, // Owner at time of claim
              delegationPeriod,
              rewardRate,
              delegationCount,
              claimsInCurrentDelegation, // Pass all claims in current delegation
              events, // All events for this token to determine context
              verbose
            );

            if (bugInstance) {
              bugInstances.push(bugInstance);

              log(
                `      🐛 Bug #${bugInstances.length} detected for delegation #${delegationCount}!`
              );
              log(
                `      💸 Owner ${currentOwner} lost ${ethers.formatEther(bugInstance.lostRewards)} VTHO`
              );
            }
          } else {
            const autoRenewal = currentDelegationStart!.data.isDelegationForever;
            const reason = autoRenewal ? "explicit exit" : "auto-renewal was OFF";
            log(`      ✅ No compensation - claim after delegation ended (${reason})`);
          }
        } else {
          log(`      ⚠️  Claim found but no active delegation - skipping`);
        }
        break;

      case "unstake":
        log(`      🔥 Token burned by ${event.data.owner}`);
        log(`      ⚰️  Final owner before burn: ${currentOwner}`);

        break;
    }
  }

  log(
    `    📊 Analysis complete: ${bugInstances.length} bug instances found across ${delegationCount} delegations`
  );
  if (bugInstances.length > 0) {
    bugInstances.forEach((bug, i) => {
      log(
        `      Bug ${i + 1}: Owner ${bug.owner} lost ${ethers.formatEther(bug.lostRewards)} VTHO at block ${bug.claimBlock}`
      );
    });
  }

  return bugInstances;
}

// Analyze a specific claim for the bug
async function analyzeClaim(
  tokenId: string,
  delegationStartEvent: TokenEvent,
  claimEvent: TokenEvent,
  ownerAtTimeOfClaim: string,
  delegationPeriod: number,
  rewardRate: bigint,
  delegationNumber: number,
  claimsInDelegation: TokenEvent[], // All claims in the current delegation
  allEvents: TokenEvent[], // All events for this token to determine context
  verbose: boolean = true
): Promise<BugInstance | null> {
  // Conditional logging function
  const log = (...args: any[]) => {
    if (verbose) {
      console.log(...args);
    }
  };

  const delegationStartBlock = delegationStartEvent.blockNumber;
  const originalRewardsAccumulationStartBlock =
    delegationStartEvent.data.rewardsAccumulationStartBlock;
  const claimBlock = claimEvent.blockNumber;

  // Find the effective accumulation start block, accounting for previous bugs
  let effectiveAccumulationStartBlock = originalRewardsAccumulationStartBlock;

  // Check if there were previous claims in this delegation before this claim
  const previousClaims = claimsInDelegation
    .filter((claim) => claim.blockNumber < claimBlock)
    .sort((a, b) => a.blockNumber - b.blockNumber);

  log(`        🔍 Analyzing claim for delegation #${delegationNumber}:`);
  log(`        📍 Delegation started: block ${delegationStartBlock}`);
  log(
    `        📍 Original rewards accumulation started: block ${originalRewardsAccumulationStartBlock}`
  );
  log(`        📍 Claim happened: block ${claimBlock}`);
  log(`        👤 Owner at time of claim: ${ownerAtTimeOfClaim}`);
  log(`        📊 Previous claims in this delegation: ${previousClaims.length}`);

  // If there were previous claims, the last claim would have reset the accumulation start
  if (previousClaims.length > 0) {
    const lastPreviousClaimBlock = previousClaims[previousClaims.length - 1].blockNumber;

    // Check if the previous claim was a bug (late claim)
    // We need to calculate this to see if it reset the accumulation
    const blocksSinceOriginalStart = lastPreviousClaimBlock - originalRewardsAccumulationStartBlock;
    const completePeriodsAtPreviousClaim = Math.floor(blocksSinceOriginalStart / delegationPeriod);

    if (completePeriodsAtPreviousClaim > 0) {
      const expectedPreviousClaimEndBlock =
        originalRewardsAccumulationStartBlock + completePeriodsAtPreviousClaim * delegationPeriod;

      if (lastPreviousClaimBlock > expectedPreviousClaimEndBlock) {
        // Previous claim was late (bug), so it reset the accumulation start
        effectiveAccumulationStartBlock = lastPreviousClaimBlock;

        log(
          `        ⚠️  Previous claim at block ${lastPreviousClaimBlock} was late (expected: ${expectedPreviousClaimEndBlock})`
        );
        log(
          `        🔄 Effective accumulation start reset to: block ${effectiveAccumulationStartBlock}`
        );
      } else {
        log(`        ✅ Previous claim at block ${lastPreviousClaimBlock} was on time`);
        log(
          `        📍 Using original accumulation start: block ${effectiveAccumulationStartBlock}`
        );
      }
    } else {
      log(`        📍 Previous claim was in first period, no reset occurred`);
      log(`        📍 Using original accumulation start: block ${effectiveAccumulationStartBlock}`);
    }
  } else {
    log(
      `        📍 First claim in this delegation, using original accumulation start: block ${effectiveAccumulationStartBlock}`
    );
  }

  // Calculate how many complete periods have passed from the effective start
  const blocksSinceEffectiveStart = claimBlock - effectiveAccumulationStartBlock;
  const completePeriods = Math.floor(blocksSinceEffectiveStart / delegationPeriod);

  log(`        📊 Blocks since effective accumulation start: ${blocksSinceEffectiveStart}`);
  log(`        📊 Complete periods from effective start: ${completePeriods}`);

  if (completePeriods === 0) {
    // No complete periods yet - no bug possible

    log(`        ✅ Claim within first period from effective start - no bug possible`);

    return null;
  }

  // Calculate where the last completed period ended from effective start
  const lastCompletedPeriodEndBlock =
    effectiveAccumulationStartBlock + completePeriods * delegationPeriod;

  log(`        📅 Last completed period ended at: block ${lastCompletedPeriodEndBlock}`);

  if (claimBlock <= lastCompletedPeriodEndBlock) {
    // Claim was on time - no bug

    log(`        ✅ Claim was on time - no bug`);

    return null;
  }

  // Bug detected! User claimed late and lost rewards
  const lostBlocks = claimBlock - lastCompletedPeriodEndBlock;
  const lostRewards = rewardRate * BigInt(lostBlocks);

  // Determine all applicable tags for this bug scenario
  const bugTags: string[] = ["base"]; // Always include base

  // Check if this token was burned/unstaked
  const isTokenBurned = allEvents.some((e) => e.type === "unstake");

  // Check if there were transfers during the delegation
  const transfersDuringDelegation = allEvents.filter(
    (e) =>
      e.type === "transfer" && e.blockNumber >= delegationStartBlock && e.blockNumber <= claimBlock
  );

  // Check if there were transfers after the claim (bug occurred) but before any burn
  const transfersAfterClaim = allEvents.filter(
    (e) => e.type === "transfer" && e.blockNumber > claimBlock
  );

  // Check if the current owner (at time of claim) transferred the token after the bug
  // This is different from just checking if the token was eventually burned by someone else
  const ownerTransferredAfterClaim = transfersAfterClaim.some(
    (e) => e.data.from === ownerAtTimeOfClaim
  );

  // Check if the current owner (at time of claim) burned the token
  const ownerBurnedToken =
    isTokenBurned &&
    allEvents.some((e) => e.type === "unstake" && e.data.owner === ownerAtTimeOfClaim);

  // Check if there were multiple claims in this delegation
  const hasMultipleClaimsInDelegation = claimsInDelegation.length > 1;

  // Add all applicable tags
  if (isTokenBurned) {
    bugTags.push("burned_nft");
  }

  if (ownerTransferredAfterClaim) {
    bugTags.push("transferred");
  }

  if (hasMultipleClaimsInDelegation) {
    bugTags.push("multiple_claims_in_delegation");
  }

  if (transfersDuringDelegation.length > 0) {
    bugTags.push("multiple_transfers");
  }

  // Note: "multiple_occurrences" will be determined later when we have all bug instances

  log(`        🐛 BUG DETECTED in delegation #${delegationNumber}!`);
  log(`        🏷️  Bug tags: ${bugTags.join(", ")}`);
  log(`        💸 Lost blocks: ${lostBlocks}`);
  log(`        💰 Reward rate: ${ethers.formatEther(rewardRate)} VTHO/block`);
  log(`        💸 Lost rewards: ${ethers.formatEther(lostRewards)} VTHO`);
  log(`        👤 Compensation goes to: ${ownerAtTimeOfClaim}`);
  log(`        ⚠️  This claim will reset next period to start from block ${claimBlock}`);
  if (isTokenBurned) {
    log(`        🔥 Token was burned/unstaked`);
  }
  if (transfersDuringDelegation.length > 0) {
    log(`        🔄 ${transfersDuringDelegation.length} transfers during delegation`);
  }
  if (transfersAfterClaim.length > 0) {
    log(`        📤 ${transfersAfterClaim.length} transfers after claim (bug)`);
  }
  if (ownerTransferredAfterClaim) {
    log(`        🔄 Owner transferred token after experiencing bug`);
  }
  if (ownerBurnedToken) {
    log(`        🔥 Owner burned token after experiencing bug`);
  }
  if (isTokenBurned && !ownerBurnedToken) {
    log(`        ⚰️  Token was eventually burned by someone else`);
  }
  if (hasMultipleClaimsInDelegation) {
    log(`        📊 ${claimsInDelegation.length} claims in this delegation`);
  }

  return {
    tokenId,
    owner: ownerAtTimeOfClaim, // Owner at time of the bug occurrence
    delegationStartBlock,
    rewardsAccumulationStartBlock: effectiveAccumulationStartBlock, // Use effective start
    claimBlock,
    expectedAccumulationStartBlock: lastCompletedPeriodEndBlock,
    lostBlocks,
    lostRewards,
    rewardRate,
    delegationStartTx: delegationStartEvent.transactionHash,
    claimTx: claimEvent.transactionHash,
    tags: bugTags,
  };
}

if (require.main === module) {
  main().catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
}
