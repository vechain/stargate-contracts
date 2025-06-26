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
  bigint, // vetAmountRequiredToStake
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
];

export interface Token {
  tokenId: number;
  levelId: number;
  mintedAtBlock: bigint;
  vetAmountStaked: bigint;
}
