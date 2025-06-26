import { defineConfig } from "../defineConfig";
import { initialTokenLevels } from "../StargateNFT/mainnet";
import { ethers } from "ethers";
import { BLOCKS_PER_DAY } from "../type";

export function createMainnetConfig() {
  return defineConfig({
    VITE_APP_ENV: "mainnet",
    CONTRACTS_ADMIN_ADDRESS: "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa", // TODO: Change before mainnet deployment
    // Legacy contracts
    TOKEN_AUCTION_CONTRACT_ADDRESS: "0xb81E9C5f9644Dec9e5e3Cac86b4461A222072302",
    CLOCK_AUCTION_CONTRACT_ADDRESS: "0xE28cE32d637eb93cBDa105f87FBB829E9ef8540B",
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
    DELEGATION_PERIOD_DURATION: BLOCKS_PER_DAY * 7, // 7 days
    VTHO_TOKEN_ADDRESS: "0x0000000000000000000000000000456E65726779",
    STARGATE_DELEGATION_OPERATOR_ADDRESS: "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa", // TODO: Change before mainnet deployment
    // Stargate NFT contract
    TOKEN_COLLECTION_NAME: "StarGate Delegator Token",
    TOKEN_COLLECTION_SYMBOL: "SDT",
    TOKEN_LEVELS: initialTokenLevels,
    LEGACY_LAST_TOKEN_ID: 15556,
    BASE_TOKEN_URI: "ipfs://bafybeiarvgsibacpyvfnjfhyns4vmzy5p2dapzvcan6utoqca4w4k5a2xm/metadata/",
    // NodeManagement contract
    NODE_MANAGEMENT_CONTRACT_ADDRESS: "0xB0EF9D89C6b49CbA6BBF86Bf2FDf0Eee4968c6AB",
  });
}
