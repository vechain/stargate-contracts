import { ThorClient } from "@vechain/sdk-network";
import { getConfig } from "@repo/config";
import { EnvConfig } from "@repo/config/contracts";
import { log } from "../helpers";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
    log("🔍 Network: ", config.network.name);
    log("🔍 Node URL: ", config.nodeUrl);
    const thor = ThorClient.at(config.nodeUrl);
    const currentBlock = await thor.blocks.getBestBlockCompressed();
    if (!currentBlock) {
        throw new Error("❌ Failed to get current block");
    }

    let envBlockNumber = process.env.BLOCK_NUMBER ? parseInt(process.env.BLOCK_NUMBER) : undefined;

    let blockNumber = currentBlock.number;
    if (envBlockNumber !== undefined && !isNaN(envBlockNumber) && envBlockNumber < blockNumber) {
        log("📦 Using environment block number: ", envBlockNumber);
        blockNumber = envBlockNumber;
    } else {
        log("📦 Using current block number: ", blockNumber);
    }

    log("🔍 Getting block timestamp for block: ", blockNumber);
    const block = await thor.blocks.getBlockCompressed(blockNumber);
    if (!block) {
        throw new Error("❌ Failed to get block");
    }

    log("📅 Block timestamp: ", block.timestamp);
}

main();
