import { defineConfig } from "../defineConfig";
import { initialTokenLevels } from "../StargateNFT/testnet";
import { ethers } from "ethers";

export function createTestnetConfig() {
  return defineConfig({
    VITE_APP_ENV: "testnet",
    CONTRACTS_ADMIN_ADDRESS: "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa",
    // Legacy contracts
    TOKEN_AUCTION_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
    CLOCK_AUCTION_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
    // Stargate delegation contract
    VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL: [
      {
        levelId: 1,
        rewardPerBlock: ethers.parseUnits("0.000122399", 18),
      },
      {
        levelId: 2,
        rewardPerBlock: ethers.parseUnits("0.000975076", 18),
      },
      {
        levelId: 3,
        rewardPerBlock: ethers.parseUnits("0.000390030", 18),
      },
      {
        levelId: 4,
        rewardPerBlock: ethers.parseUnits("0.000766742", 18),
      },
      {
        levelId: 5,
        rewardPerBlock: ethers.parseUnits("0.000313546", 18),
      },
      {
        levelId: 6,
        rewardPerBlock: ethers.parseUnits("0.000136555", 18),
      },
      {
        levelId: 7,
        rewardPerBlock: ethers.parseUnits("0.000487252", 18),
      },
      // nft
      {
        levelId: 8,
        rewardPerBlock: ethers.parseUnits("0.000697615", 18),
      },
      {
        levelId: 9,
        rewardPerBlock: ethers.parseUnits("0.000390030", 18),
      },
      {
        levelId: 10,
        rewardPerBlock: ethers.parseUnits("0.000180745", 18),
      },
    ],
    DELEGATION_PERIOD_DURATION: 30, // 30 blocks -> 5 minutes
    VTHO_TOKEN_ADDRESS: "0x0000000000000000000000000000456E65726779",
    STARGATE_DELEGATION_OPERATOR_ADDRESS: "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa",
    // Stargate NFT contract
    TOKEN_COLLECTION_NAME: "StarGate Delegator Token",
    TOKEN_COLLECTION_SYMBOL: "SDT",
    TOKEN_LEVELS: initialTokenLevels,
    LEGACY_LAST_TOKEN_ID: 100000,
    BASE_TOKEN_URI: "ipfs://bafybeibmpgruasnoqgyemcprpkygtelvxl3b5d2bf5aqqciw6dds33yw7y/metadata/",
    WHITELIST_ENTRIES_V2: [], // Overwritten on deploy
    // NodeManagement contract
    NODE_MANAGEMENT_CONTRACT_ADDRESS: "0x0000000000000000000000000000000000000000",
  });
}
