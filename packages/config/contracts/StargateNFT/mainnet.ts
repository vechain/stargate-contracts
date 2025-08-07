import { ethers } from "ethers";
import { TokenLevelId } from "./config";
import { type LevelAndSupply } from "./types";
import { BLOCKS_PER_DAY } from "../type";

export const initialTokenLevels: LevelAndSupply[] = [
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
];
