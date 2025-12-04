export const EnvConfigValues = ["testnet", "mainnet", "local", "devnet"] as const;
export type EnvConfig = (typeof EnvConfigValues)[number];

export type ContractsConfig = {
  VITE_APP_ENV: EnvConfig;
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
  WHITELIST_ENTRIES_V2: WhitelistEntryInit[];
  PROTOCOL_STAKER_CONTRACT_ADDRESS: string;
  STARGATE_NFT_CONTRACT_ADDRESS?: string;
  STARGATE_CONTRACT_ADDRESS?: string;
  STARGATE_NFT_BOOST_LEVEL_IDS?: number[];
  STARGATE_NFT_BOOST_PRICES_PER_BLOCK?: bigint[];
  // NodeManagement contract
  NODE_MANAGEMENT_CONTRACT_ADDRESS: string;
  MAX_CLAIMABLE_PERIODS: number;
};

export type StargateDelegationVthoRewardPerBlock = {
  levelId: number;
  rewardPerBlock: bigint;
};

export const BLOCKS_PER_DAY = 6 * 60 * 24; // // 6 blocks/min * 60 min/hour * 24 hours/day = 8640 blocks (10s block time)

export enum StrengthLevel { // Legacy strengthLevel enum
  None,
  Strength,
  Thunder,
  Mjolnir,
  VeThorX,
  StrengthX,
  ThunderX,
  MjolnirX,
}

export const TokenRipeDays: Record<StrengthLevel, number> = {
  [StrengthLevel.None]: 0,
  [StrengthLevel.Strength]: 10,
  [StrengthLevel.Thunder]: 20,
  [StrengthLevel.Mjolnir]: 30,
  [StrengthLevel.VeThorX]: 0,
  [StrengthLevel.StrengthX]: 30,
  [StrengthLevel.ThunderX]: 60,
  [StrengthLevel.MjolnirX]: 90,
};

export enum TokenLevelId { // Extend legacy strengthLevel enum
  None,
  Strength,
  Thunder,
  Mjolnir,
  VeThorX,
  StrengthX,
  ThunderX,
  MjolnirX,
  Dawn,
  Lightning,
  Flash,
}

export interface LevelAndSupply {
  level: Level;
  cap: number;
  circulatingSupply: number;
}

export type LevelRaw = [
  string, // name
  boolean, // isX
  bigint, // id
  bigint, // maturityBlocks
  bigint, // scaledRewardFactor
  bigint // vetAmountRequiredToStake
];

export interface Level {
  name: string;
  isX: boolean;
  id: number;
  maturityBlocks: number;
  scaledRewardFactor: number;
  vetAmountRequiredToStake: bigint;
}

export type TokenRaw = [
  bigint, // tokenId
  bigint, // levelId
  bigint, // mintedAtBlock
  bigint, // vetAmountStaked
  bigint // lastVthoClaimTimestamp
];

export interface Token {
  tokenId: number;
  levelId: number;
  mintedAtBlock: bigint;
  vetAmountStaked: bigint;
  lastVthoClaimTimestamp: bigint;
}

export interface WhitelistEntryInit {
  owner: string;
  tokenId: number;
  levelId: number;
}

export interface AddTokenParams {
  addr: string;
  lvl: StrengthLevel;
  onUpgrade: boolean;
  applyUpgradeTime: number;
  applyUpgradeBlockno: number;
}

export type TokenMetadataRaw = [
  string, // idToOwner (address)
  bigint, // level
  boolean, // onUpgrade
  boolean, // isOnAuction
  bigint, // lastTransferTime
  bigint, // createdAt
  bigint // updatedAt
];

export interface TokenMetadata {
  idToOwner: string;
  level: bigint;
  onUpgrade: boolean;
  isOnAuction: boolean;
  lastTransferTime: bigint;
  createdAt: bigint;
  updatedAt: bigint;
}

export interface TokenMetadataWithTokenId extends TokenMetadata {
  tokenId: number;
}

export interface AugmentedTokenMetadata {
  tokenId: number;
  owner: string;
  levelId: number;
  level: string;
  isX: boolean;
  createdAt: string;
  onUpgrade: boolean;
  updatedAt: string;
  onAuction: boolean;
  lastTransferTime: string;
}
