export interface UpgradeContract {
  name: string;
  configAddressField: string;
  versions: readonly string[];
  descriptions: Record<string, string>;
}

export const upgradeConfig: Record<string, UpgradeContract> = {
  "Stargate Delegation": {
    name: "stargate-delegation",
    configAddressField: "stargateDelegationContractAddress",
    versions: ["v2", "v3"],
    descriptions: {
      v2: "Fix: Correctly update rewards accumulation start block when claiming delegation rewards.",
      v3: "Feat: Allow claiming lost rewards caused by the v1 implementation",
    },
  },
  "Stargate NFT": {
    name: "stargate-nft",
    configAddressField: "stargateNFTContractAddress",
    versions: ["v2"],
    descriptions: {
      v2: "Feat: Add a route to migrate nodes from whitelist.",
    },
  },
} as const;
