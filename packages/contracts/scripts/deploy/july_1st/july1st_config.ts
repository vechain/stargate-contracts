export interface July1stScript {
  name: string;
  description: string;
  turboCommand: string;
  availableNetworks: readonly string[];
}

export const july1stConfig: Record<string, July1stScript> = {
  Deploy: {
    name: "deploy",
    description:
      "Deploy Stargate contracts (testnet with mocks, mainnet with existing legacy contracts)",
    turboCommand: "july1st:deploy",
    availableNetworks: ["testnet", "mainnet"],
  },
  "Node Management Upgrade": {
    name: "node-management-upgrade",
    description: "Upgrade NodeManagement contract to version 3 with Stargate integration",
    turboCommand: "july1st:node-management-upgrade",
    availableNetworks: ["testnet", "mainnet"],
  },
  "Roles Transfer": {
    name: "roles-transfer",
    description:
      "Transfer DEFAULT_ADMIN_ROLE of StargateNFT and StargateDelegation contracts to new admin address and renounce other roles",
    turboCommand: "july1st:roles-transfer",
    availableNetworks: ["testnet", "mainnet"],
  },
} as const;
