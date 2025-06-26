import { StrengthLevel } from "./config";

export interface AddTokenParams {
    addr: string;
    lvl: StrengthLevel;
    onUpgrade: boolean;
    applyUpgradeTime: number;
    applyUpgradeBlockno: number;
}

export type TokenMetadataRaw = [
    string,    // idToOwner (address)
    bigint,    // level
    boolean,   // onUpgrade
    boolean,   // isOnAuction
    bigint,    // lastTransferTime
    bigint,    // createdAt
    bigint     // updatedAt
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
