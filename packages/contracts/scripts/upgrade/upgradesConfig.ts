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
    versions: ["v2"],
    descriptions: {
      v2: "Fix: Correctly update rewards accumulation start block when claiming delegation rewards.",
    },
  },
} as const;
