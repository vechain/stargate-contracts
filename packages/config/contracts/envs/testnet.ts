import { defineConfig } from "../defineConfig";
import { ethers } from "ethers";
import { BLOCKS_PER_DAY, TokenLevelId } from "../type";

export function createTestnetConfig() {
  return defineConfig({
    VITE_APP_ENV: "testnet",
    CONTRACTS_ADMIN_ADDRESS: "0xffE563D2d0B4e61CE482F54E46c44429AaB8993E",
    // Legacy contracts
    TOKEN_AUCTION_CONTRACT_ADDRESS:
      "0x0000000000000000000000000000000000000000",
    CLOCK_AUCTION_CONTRACT_ADDRESS:
      "0x0000000000000000000000000000000000000000",
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
    STARGATE_DELEGATION_OPERATOR_ADDRESS:
      "0xf077b491b355E64048cE21E3A6Fc4751eEeA77fa",
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
          vetAmountRequiredToStake: ethers.parseEther("1000000"),
          scaledRewardFactor: 150,
          maturityBlocks: BLOCKS_PER_DAY * 30,
        },
        cap: 1382, // 2500 - (1100 + 18 None upgrading),
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.Thunder,
          name: "Thunder",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("5000000"),
          scaledRewardFactor: 250,
          maturityBlocks: BLOCKS_PER_DAY * 45,
        },
        cap: 234, // 300 - (60 + 6 Strength upgrading)
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.Mjolnir,
          name: "Mjolnir",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("15000000"),
          scaledRewardFactor: 350,
          maturityBlocks: BLOCKS_PER_DAY * 60,
        },
        cap: 13, // 100 - (82 + 5 Thunder upgrading)
        circulatingSupply: 0,
      },
      // Legacy X Levels
      {
        level: {
          id: TokenLevelId.VeThorX,
          name: "VeThorX",
          isX: true,
          vetAmountRequiredToStake: ethers.parseEther("600000"),
          scaledRewardFactor: 200,
          maturityBlocks: 0,
        },
        cap: 0, // 735
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.StrengthX,
          name: "StrengthX",
          isX: true,
          vetAmountRequiredToStake: ethers.parseEther("1600000"),
          scaledRewardFactor: 300,
          maturityBlocks: 0,
        },
        cap: 0, // 831 + 12 VeThorX upgrading is 843
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.ThunderX,
          name: "ThunderX",
          isX: true,
          vetAmountRequiredToStake: ethers.parseEther("5600000"),
          scaledRewardFactor: 400,
          maturityBlocks: 0,
        },
        cap: 0, // 175 + 12 StrengthX upgrading is 187
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.MjolnirX,
          name: "MjolnirX",
          isX: true,
          vetAmountRequiredToStake: ethers.parseEther("15600000"),
          scaledRewardFactor: 500,
          maturityBlocks: 0,
        },
        cap: 0, // 152 + 6 ThunderX upgrading is 158
        circulatingSupply: 0,
      },
      // New levels
      {
        level: {
          id: TokenLevelId.Dawn,
          name: "Dawn",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("10000"),
          scaledRewardFactor: 100,
          maturityBlocks: BLOCKS_PER_DAY * 2,
        },
        cap: 500000,
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.Lightning,
          name: "Lightning",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("50000"),
          scaledRewardFactor: 115,
          maturityBlocks: BLOCKS_PER_DAY * 5,
        },
        cap: 100000,
        circulatingSupply: 0,
      },
      {
        level: {
          id: TokenLevelId.Flash,
          name: "Flash",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("200000"),
          scaledRewardFactor: 130,
          maturityBlocks: BLOCKS_PER_DAY * 15,
        },
        cap: 25000,
        circulatingSupply: 0,
      },
    ],
    LEGACY_LAST_TOKEN_ID: 15611,
    BASE_TOKEN_URI:
      "ipfs://bafybeibmpgruasnoqgyemcprpkygtelvxl3b5d2bf5aqqciw6dds33yw7y/metadata/",
    WHITELIST_ENTRIES_V2: [], // Overwritten on deploy
    // NodeManagement contract
    NODE_MANAGEMENT_CONTRACT_ADDRESS:
      "0x0000000000000000000000000000000000000000",
    PROTOCOL_STAKER_CONTRACT_ADDRESS:
      "0x00000000000000000000000000005374616B6572",
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
