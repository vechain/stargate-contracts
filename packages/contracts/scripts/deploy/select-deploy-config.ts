export interface SelectDeploy {
    name: string;
    versions: readonly string[];
    descriptions: Record<string, string>;
}

export const selectDeployConfig: Record<string, SelectDeploy> = {
    "Deploy All Contracts": {
        name: "all-contracts",
        versions: ["v2", "v3"],
        descriptions: {
            v2: "Deploy all contracts in their v2 version (pre-Hayabusa)",
            v3: "Deploy all contracts in their v3 version (Hayabusa)",
        },
    },
    Stargate: {
        name: "stargate",
        versions: ["v1"],
        descriptions: {
            v1: "Deploy the Stargate contract (Hayabusa release)",
        },
    },
} as const;
