import "dotenv/config";
import path from "path";
import { ethers } from "ethers";
import { createObjectCsvWriter } from "csv-writer";
import { confirm, number } from "@inquirer/prompts";
import { coder } from "@vechain/sdk-core";
import { FilterCriteria, type EventCriteria } from "@vechain/sdk-network";
import { getConfig } from "@repo/config";
import {
  StrengthLevel,
  TokenMetadataWithTokenId,
  AugmentedTokenMetadata,
  TokenRipeDays,
} from "@repo/config/contracts/VechainNodes";
import { getLastDaysEvents } from "../helpers/thorEventLogs";
import { getTokenIdOwnersInChunks, getTokenIdMetadatasInChunks } from "../helpers/vechainNodes";
import { TokenAuction__factory } from "../../typechain-types";

const config = getConfig();
const legacyNodesContractAddress = config.legacyNodesContractAddress;
const legacyNodesContractInterface = coder.createInterface(
  JSON.stringify(TokenAuction__factory.abi)
);

const CHUNK_SIZE = 100;
const OUTPUT_DIR = path.join(__dirname, "data");

const findRecentMintingEvents = async (days: number) => {
  // Transfer event emitted upon minting and destroying
  const eventFragment = legacyNodesContractInterface.getEvent("Transfer")!;

  // Criteria for minting events
  const criteria: EventCriteria = {
    address: legacyNodesContractAddress,
    topic0: eventFragment.topicHash,
    topic1: ethers.zeroPadBytes(ethers.ZeroAddress, 32), // From address is the zero address
  };

  // Filter criteria for minting events
  const filterCriteria: FilterCriteria = {
    criteria,
    eventFragment,
  };

  // Get minting events
  return getLastDaysEvents(days, [filterCriteria], "desc");
};

const getUpgradeEndsAt = (levelId: StrengthLevel, updatedAtMs: number) => {
  const ripeDays = TokenRipeDays[(levelId + 1) as StrengthLevel]; // +1 because the upgrade is for getting the next level
  const ripeTimestamp = ripeDays * 24 * 60 * 60 * 1000;
  return new Date(updatedAtMs + ripeTimestamp).toLocaleString("sv-SE", { hour12: false });
};

const augmentTokenMetadatas = (tokenMetadatas: TokenMetadataWithTokenId[]) => {
  return tokenMetadatas.map((tokenMetadata) => {
    return {
      tokenId: tokenMetadata.tokenId,
      owner: tokenMetadata.idToOwner,
      levelId: Number(tokenMetadata.level),
      level: StrengthLevel[Number(tokenMetadata.level)],
      isX: tokenMetadata.level >= StrengthLevel.VeThorX,
      createdAt: new Date(Number(tokenMetadata.createdAt) * 1000).toLocaleString("sv-SE", {
        hour12: false,
      }),
      onUpgrade: tokenMetadata.onUpgrade,
      updatedAt: new Date(Number(tokenMetadata.updatedAt) * 1000).toLocaleString("sv-SE", {
        hour12: false,
      }),
      upgradeEndsAt: tokenMetadata.onUpgrade
        ? getUpgradeEndsAt(Number(tokenMetadata.level), Number(tokenMetadata.updatedAt) * 1000)
        : null,
      onAuction: tokenMetadata.isOnAuction,
      lastTransferTime: new Date(Number(tokenMetadata.lastTransferTime) * 1000).toLocaleString(
        "sv-SE",
        { hour12: false }
      ),
    };
  });
};

const writeTokenMetadatasToCsv = async (
  tokenMetadatas: AugmentedTokenMetadata[],
  filePath: string
) => {
  // Create headers dynamically from first metadata object
  const headers = Object.keys(tokenMetadatas[0]).map((key) => ({
    id: key,
    title: key,
  }));

  // Create the csv writer
  const writer = createObjectCsvWriter({
    path: filePath,
    header: headers,
  });

  // Write the records to the csv file
  await writer.writeRecords(tokenMetadatas);
  console.log(`Successfully exported ${tokenMetadatas.length} records to ${filePath}`);
};

const tokenAuctionNodesMetadata = async () => {
  try {
    // Ask user to confirm environment
    const env = config.environment;
    const envConfirmation = await confirm({
      message: `This script will run in ${env} env. Continue?`,
      default: false,
    });

    if (!envConfirmation) {
      console.log("User cancelled. Exiting...");
      process.exit(0);
    }

    // Ask user to confirm the contract address
    const contractAddressConfirmation = await confirm({
      message: `This is the TokenAuction contract address that will be queried: ${legacyNodesContractAddress}. Continue?`,
      default: false,
    });

    if (!contractAddressConfirmation) {
      console.log("User cancelled. Exiting...");
      process.exit(0);
    }

    // Ask user to specify the number of days to scan
    const daysToScan = await number({
      message: "How many days back do you want to scan for minting events?",
      default: 1,
      max: 14,
    });

    const recentMintingEvents = await findRecentMintingEvents(daysToScan as number);
    console.log("recentMintingEvents", recentMintingEvents);

    if (recentMintingEvents.length === 0) {
      console.log("No recent minting events found. Exiting...");
      process.exit(0);
    }

    // Get the tokenId of the most recent minting event
    const tokenId = recentMintingEvents[0].decodedData?.[2] as unknown as bigint;
    console.log("tokenId", tokenId);

    // Generate an array of all tokenIds
    const tokenIds = Array.from({ length: Number(tokenId) }, (_, i) => i + 1);

    // Filter out all tokenIds that have an owner of zero address
    const filteredTokenIds = await getTokenIdOwnersInChunks(tokenIds, CHUNK_SIZE, 1000);
    console.log("filteredTokenIds size", filteredTokenIds.length, "eg", filteredTokenIds[0]);

    // Get the metadata for the existing tokenIds, and store tokenId to metadata in a map
    const tokenMetadatas = await getTokenIdMetadatasInChunks(filteredTokenIds, CHUNK_SIZE, 2000);
    console.log("tokenMetadatas size", tokenMetadatas.length, "eg", tokenMetadatas[0]);

    // Augment tokenMetadatas
    const augmentedTokenMetadatas = augmentTokenMetadatas(tokenMetadatas);
    console.log(
      "augmentedTokenMetadatas size",
      augmentedTokenMetadatas.length,
      "eg",
      augmentedTokenMetadatas[0]
    );

    // Write the data to a csv file
    const timestamp = new Date().toLocaleString("sv-SE", { hour12: false }).replace(/[: ]/g, "-");
    const fileName = `${timestamp}_total_tokens_${tokenMetadatas.length}.csv`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    await writeTokenMetadatasToCsv(augmentedTokenMetadatas, filePath);
    process.exit(0);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

/**
 * Script to export the metadata of all tokenIds from the token auction contract to a csv file
 * Prompts the user to confirm the environment and
 * specify the number of days back to scan for minting events (default 1, max 10)
 * Run the script
 * from root: npx ts-node packages/contracts/scripts/data_exports/tokenAuctionNodesMetadata.ts
 * env vars will be loaded from .env file thanks to import "dotenv/config";
 */
tokenAuctionNodesMetadata();
