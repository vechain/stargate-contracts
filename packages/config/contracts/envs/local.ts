import { defineConfig } from "../defineConfig";
import { initialTokenLevels } from "../StargateNFT/local";
import { ethers } from "ethers";

export function createLocalConfig() {
  return defineConfig({
    VITE_APP_ENV: "local",
    CONTRACTS_ADMIN_ADDRESS: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // hardhat default
    // Legacy contracts
    TOKEN_AUCTION_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
    CLOCK_AUCTION_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
    // Stargate delegation contract
    VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL: [
      {
        levelId: 1,
        rewardPerBlock: ethers.parseUnits("0.122399797", 18), // 0.122399797 * 10^18
      },
      {
        levelId: 2,
        rewardPerBlock: ethers.parseUnits("0.975076104", 18), // 0.975076104 * 10^18
      },
      {
        levelId: 3,
        rewardPerBlock: ethers.parseUnits("3.900304414", 18), // 3.900304414 * 10^18
      },
      {
        levelId: 4,
        rewardPerBlock: ethers.parseUnits("0.076674277", 18), // 0.076674277 * 10^18
      },
      {
        levelId: 5,
        rewardPerBlock: ethers.parseUnits("0.313546423", 18), // 0.313546423 * 10^18
      },
      {
        levelId: 6,
        rewardPerBlock: ethers.parseUnits("1.365550482", 18), // 1.365550482 * 10^18
      },
      {
        levelId: 7,
        rewardPerBlock: ethers.parseUnits("4.872526636", 18), // 4.872526636 * 10^18
      },
      // nft
      {
        levelId: 8,
        rewardPerBlock: ethers.parseUnits("0.000697615", 18), // 0.000697615 * 10^18
      },
      {
        levelId: 9,
        rewardPerBlock: ethers.parseUnits("0.003900304", 18), // 0.003900304 * 10^18
      },
      {
        levelId: 10,
        rewardPerBlock: ethers.parseUnits("0.018074581", 18), // 0.018074581 * 10^18
      },
    ],
    DELEGATION_PERIOD_DURATION: 10, // 10 blocks
    VTHO_TOKEN_ADDRESS: "0x0000000000000000000000000000456E65726779",
    STARGATE_DELEGATION_OPERATOR_ADDRESS: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // hardhat default
    // Stargate NFT contract
    TOKEN_COLLECTION_NAME: "StarGate Delegator Token",
    TOKEN_COLLECTION_SYMBOL: "SDT",
    TOKEN_LEVELS: initialTokenLevels,
    LEGACY_LAST_TOKEN_ID: 100000,
    BASE_TOKEN_URI: "ipfs://bafybeibmpgruasnoqgyemcprpkygtelvxl3b5d2bf5aqqciw6dds33yw7y/metadata/",
    WHITELIST_ENTRIES_V2: [], // Overwritten on deploy
    // NodeManagement contract
    NODE_MANAGEMENT_CONTRACT_ADDRESS: "0x45d5CA3f295ad8BCa291cC4ecd33382DE40E4FAc",
  });
}
