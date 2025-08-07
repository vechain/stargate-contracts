import { ethers } from "ethers";
import { TokenLevelId } from "./config";
import { type LevelAndSupply } from "./types";

export const initialTokenLevels: LevelAndSupply[] = [
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
      maturityBlocks: 30,
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
];
