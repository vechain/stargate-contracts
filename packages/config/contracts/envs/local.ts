import { defineConfig } from "../defineConfig";
import { ethers } from "ethers";
import { TokenLevelId } from "../type";

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
    TOKEN_LEVELS: [
      // Legacy normal levels
      {
        level: {
          id: TokenLevelId.Strength,
          name: "Strength",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("100"),
          scaledRewardFactor: 150,
          maturityBlocks: 10, 
        },
        cap: 2499, // 2500 - 1
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.Thunder,
          name: "Thunder",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("500"),
          scaledRewardFactor: 250,
          maturityBlocks: 20,
        },
        cap: 298, // 300 - (1 + 1 Strength upgrading)
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.Mjolnir,
          name: "Mjolnir",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("1500"),
          scaledRewardFactor: 350,
          // change this to 300 for boost tests
          maturityBlocks: 300,
        },
        cap: 99, // 100 - 1
        circulatingSupply: 0,
      },
      // Legacy X Levels
      {
        level: {
          id: TokenLevelId.VeThorX,
          name: "VeThorX",
          isX: true,
          vetAmountRequiredToStake: ethers.parseEther("60"),
          scaledRewardFactor: 200,
          maturityBlocks: 0,
        },
        cap: 0, // 1
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.StrengthX,
          name: "StrengthX",
          isX: true,
          vetAmountRequiredToStake: ethers.parseEther("160"),
          scaledRewardFactor: 300,
          maturityBlocks: 0,
        },
        cap: 0, // 1
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.ThunderX,
          name: "ThunderX",
          isX: true,
          vetAmountRequiredToStake: ethers.parseEther("560"),
          scaledRewardFactor: 400,
          maturityBlocks: 0,
        },
        cap: 0, // No ThunderX
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.MjolnirX,
          name: "MjolnirX",
          isX: true,
          vetAmountRequiredToStake: ethers.parseEther("1560"),
          scaledRewardFactor: 500,
          maturityBlocks: 0,
        },
        cap: 0, // 1
        circulatingSupply: 0,
      },
      // New levels
      {
        level: {
          id: TokenLevelId.Dawn,
          name: "Dawn",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("1"),
          scaledRewardFactor: 100,
          maturityBlocks: 5,
        },
        cap: 500000,
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.Lightning,
          name: "Lightning",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("5"),
          scaledRewardFactor: 115,
          maturityBlocks: 10,
        },
        cap: 100000,
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.Flash,
          name: "Flash",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("20"),
          scaledRewardFactor: 130,
          maturityBlocks: 15,
        },
        cap: 25000,
        circulatingSupply: 0,
      },
    ],
    LEGACY_LAST_TOKEN_ID: 100000,
    BASE_TOKEN_URI: "ipfs://bafybeibmpgruasnoqgyemcprpkygtelvxl3b5d2bf5aqqciw6dds33yw7y/metadata/",
    WHITELIST_ENTRIES_V2: [], // Overwritten on deploy
    // NodeManagement contract
    NODE_MANAGEMENT_CONTRACT_ADDRESS: "0x45d5CA3f295ad8BCa291cC4ecd33382DE40E4FAc",
    PROTOCOL_STAKER_CONTRACT_ADDRESS: "0x00000000000000000000000000005374616B6572",
    MAX_CLAIMABLE_PERIODS: 832,
    STARGATE_NFT_BOOST_LEVEL_IDS: [
      TokenLevelId.Dawn,
      TokenLevelId.Lightning,
      TokenLevelId.Flash,
      TokenLevelId.Strength,
      TokenLevelId.Thunder,
      TokenLevelId.Mjolnir,
    ],
    STARGATE_NFT_BOOST_PRICES_PER_BLOCK: [
      539351851851852n,
      2870370370370370n,
      12523148148148100n,
      75925925925925900n,
      530092592592593000n,
      1995370370370370000n,
    ],
  });
}
