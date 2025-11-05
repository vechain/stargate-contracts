export type BaseRewardsData = {
    environment: string;
    network: string;
    stargateNFTAddress: string;
    stargateDelegationAddress: string;
    rewardsData: BaseRewardsDataItem[];
};

type BaseRewardsDataItem = {
    tokenId: number;
    owner: string;
    claimableRewards: string;
};

export type BaseRewardsExecutionReport = {
    environment: string;
    network: string;
    stargateNFTAddress: string;
    stargateDelegationAddress: string;
    timestamp: string;
    totalRewardsToClaim: number;
    successfulRewardsClaimed: number;
    failedRewardsClaimed: number;
    results: BaseRewardsExecutionReportItem[];
};

export type BaseRewardsExecutionReportItem = {
    tokenId: number;
    owner: string;
    claimedRewards?: string;
    txHash?: string;
    status: "success" | "error";
    blockNumber?: number;
    error?: string;
    dryRun?: boolean;
};
