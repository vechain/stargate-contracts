export type DelegationRewardsData = {
    environment: string;
    network: string;
    stargateNFTAddress: string;
    stargateDelegationAddress: string;
    rewardsData: DelegationRewardsDataItem[];
};

type DelegationRewardsDataItem = {
    tokenId: number;
    owner: string;
    claimableRewards: string;
};

export type DelegationRewardsExecutionReport = {
    environment: string;
    network: string;
    stargateNFTAddress: string;
    stargateDelegationAddress: string;
    timestamp: string;
    totalRewardsToClaim: number;
    successfulRewardsClaimed: number;
    failedRewardsClaimed: number;
    results: DelegationRewardsExecutionReportItem[];
};

export type DelegationRewardsExecutionReportItem = {
    tokenId: number;
    owner: string;
    claimedRewards?: string;
    txHash?: string;
    status: "success" | "error";
    blockNumber?: number;
    error?: string;
    dryRun?: boolean;
};
