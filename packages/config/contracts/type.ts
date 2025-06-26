import { LevelAndSupply } from "./StargateNFT";

export type ContractsConfig = {
  VITE_APP_ENV: "local" | "rewards" | "testnet" | "mainnet";
  CONTRACTS_ADMIN_ADDRESS: string;
  // Legacy contracts
  TOKEN_AUCTION_CONTRACT_ADDRESS: string;
  CLOCK_AUCTION_CONTRACT_ADDRESS: string;
  // Stargate delegation contract
  VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL: StargateDelegationVthoRewardPerBlock[];
  DELEGATION_PERIOD_DURATION: number;
  VTHO_TOKEN_ADDRESS: string;
  STARGATE_DELEGATION_OPERATOR_ADDRESS: string;
  // Stargate NFT contract
  TOKEN_COLLECTION_NAME: string;
  TOKEN_COLLECTION_SYMBOL: string;
  TOKEN_LEVELS: LevelAndSupply[];
  LEGACY_LAST_TOKEN_ID: number;
  BASE_TOKEN_URI: string;
  // NodeManagement contract
  NODE_MANAGEMENT_CONTRACT_ADDRESS: string;
};

export type StargateDelegationVthoRewardPerBlock = {
  levelId: number;
  rewardPerBlock: bigint;
};

export const BLOCKS_PER_DAY = 6 * 60 * 24; // // 6 blocks/min * 60 min/hour * 24 hours/day = 8640 blocks (10s block time)
