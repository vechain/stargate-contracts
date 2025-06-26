import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { mineBlocks } from "../helpers/common";
import { ethers } from "hardhat";

describe("StargateDelegation rewards", () => {
  it("should provide extra VTHO rewards based on NFT tier and lockup", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7; // 7 days in blocks (for test simplicity, we use blocks)
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity for simplicity
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("10");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Mint Tier 1 NFT
    await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    const tier1TokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Mint Tier 2 NFT
    await stargateNFTContract.stake(2, {
      value: ethers.parseEther("10"),
    });
    const tier2TokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation for both NFTs
    await stargateDelegationContract.delegate(tier1TokenId, true);
    const blockWhenTier1Delegated = await stargateDelegationContract.clock();
    await stargateDelegationContract.delegate(tier2TokenId, true);
    const blockWhenTier2Delegated = await stargateDelegationContract.clock();

    // Mine some blocks to accumulate rewards
    const blocksPassed = 10;
    await mineBlocks(blocksPassed);

    // Check accumulated delegation rewards for both tiers
    const tier1DelegationRewards =
      await stargateDelegationContract.accumulatedRewards(tier1TokenId);
    const tier2DelegationRewards =
      await stargateDelegationContract.accumulatedRewards(tier2TokenId);

    // Verify higher tier NFT gets more delegation rewards
    expect(tier2DelegationRewards).to.be.gt(tier1DelegationRewards);

    // Check base VTHO rewards from staked VET (separate from delegation rewards)
    const tier1BaseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tier1TokenId);
    const tier2BaseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tier2TokenId);

    // Verify higher tier NFT with more staked VET gets more base rewards
    expect(tier2BaseRewards).to.be.gt(tier1BaseRewards);

    // Verify that the reward rates for delegation match expectations
    const tier1RewardRate = await stargateDelegationContract.getVthoRewardPerBlock(1);
    const tier2RewardRate = await stargateDelegationContract.getVthoRewardPerBlock(2);

    // Reward rates should reflect the NFT tier
    expect(tier1RewardRate).to.equal(config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock);
    expect(tier2RewardRate).to.equal(config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[1].rewardPerBlock);

    // Verify rewards accumulate at expected rate
    const currentBlock = await stargateDelegationContract.clock();
    const blocksPassedSinceDelegation = currentBlock - blockWhenTier1Delegated;
    const blocksPassedSinceTier2Delegation = currentBlock - blockWhenTier2Delegated;
    expect(tier1DelegationRewards).to.equal(tier1RewardRate * BigInt(blocksPassedSinceDelegation));
    expect(tier2DelegationRewards).to.equal(
      tier2RewardRate * BigInt(blocksPassedSinceTier2Delegation)
    );

    // The total rewards a user would see would be the sum of both types
    const tier1TotalRewards = tier1BaseRewards + tier1DelegationRewards;
    const tier2TotalRewards = tier2BaseRewards + tier2DelegationRewards;

    expect(tier2TotalRewards).to.be.gt(tier1TotalRewards);
  });

  it("should allow claiming delegation rewards every 7 days", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7; // 7 days in blocks
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the contracts with VTHO for rewards
    const initialVTHOBalance = ethers.parseEther("1000");
    await mockedVthoToken.transfer(stargateDelegationContract.target, initialVTHOBalance);
    await mockedVthoToken.transfer(stargateNFTContract.target, initialVTHOBalance);

    // Mint NFT
    await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    await stargateDelegationContract.delegate(tokenId, true);

    // Mine fewer blocks than the delegation period
    await mineBlocks(3);

    // Check that rewards are accumulating but not yet claimable
    const accumulatedRewardsBeforePeriodEnd =
      await stargateDelegationContract.accumulatedRewards(tokenId);
    const claimableRewardsBeforePeriodEnd =
      await stargateDelegationContract.claimableRewards(tokenId);

    expect(accumulatedRewardsBeforePeriodEnd).to.be.gt(0);
    expect(claimableRewardsBeforePeriodEnd).to.equal(0);

    // Try to claim delegation rewards before the delegation period ends
    await expect(stargateDelegationContract.claimRewards(tokenId)).to.be.revertedWithCustomError(
      stargateDelegationContract,
      "NoRewardsToClaim"
    );

    // Mine more blocks to complete the delegation period
    await mineBlocks(4);

    // Now delegation rewards should be claimable
    const claimableDelegationRewards = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableDelegationRewards).to.be.gt(0);

    // Check if base VTHO rewards are available
    const baseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
    expect(baseRewards).to.be.gt(0);

    // Get deployer VTHO balance before claiming
    const deployerVTHOBalanceBefore = await mockedVthoToken.balanceOf(deployer.address);

    // Claim delegation rewards
    await expect(stargateDelegationContract.claimRewards(tokenId))
      .to.emit(stargateDelegationContract, "DelegationRewardsClaimed")
      .withArgs(tokenId, claimableDelegationRewards, deployer.address, deployer.address);

    // Claim base rewards - don't check event, just verify balance change
    await stargateNFTContract.claimVetGeneratedVtho(tokenId);

    // Verify the balance increased after claiming base rewards
    const deployerVTHOBalanceAfter = await mockedVthoToken.balanceOf(deployer.address);
    expect(deployerVTHOBalanceAfter).to.be.gt(
      deployerVTHOBalanceBefore + claimableDelegationRewards
    );

    // Start accumulating for the next period
    await mineBlocks(3);
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.be.gt(0);
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);

    // Complete another period
    await mineBlocks(4);
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.be.gt(0);
  });

  it("should accumulate delegation rewards per block automatically", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7;
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Mint NFT
    await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    await stargateDelegationContract.delegate(tokenId, true);

    // Check rewards at different block heights
    const initialDelegationRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    const initialBaseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);

    // Mine 1 block and check that rewards increased
    await mineBlocks(1);
    const delegationRewardsAfter1Block =
      await stargateDelegationContract.accumulatedRewards(tokenId);
    const baseRewardsAfter1Block = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);

    expect(delegationRewardsAfter1Block).to.be.gt(initialDelegationRewards);
    expect(baseRewardsAfter1Block).to.be.gt(initialBaseRewards);

    // Mine 2 more blocks and check again
    await mineBlocks(2);
    const delegationRewardsAfter3Blocks =
      await stargateDelegationContract.accumulatedRewards(tokenId);
    const baseRewardsAfter3Blocks = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);

    expect(delegationRewardsAfter3Blocks).to.be.gt(delegationRewardsAfter1Block);
    expect(baseRewardsAfter3Blocks).to.be.gt(baseRewardsAfter1Block);

    // Get the reward rate per block for this NFT tier
    const delegationRewardRate = await stargateDelegationContract.getVthoRewardPerBlock(1);

    // Verify delegation rewards are accumulating at the expected rate
    expect(delegationRewardsAfter3Blocks - initialDelegationRewards).to.be.closeTo(
      delegationRewardRate * 3n,
      10n
    );
  });

  it("should reset delegation rewards accumulation after claiming rewards", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7;
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract with VTHO for rewards
    const initialVTHOBalance = ethers.parseEther("1000");
    await mockedVthoToken.transfer(stargateDelegationContract.target, initialVTHOBalance);

    // Mint NFT
    await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    await stargateDelegationContract.delegate(tokenId, true);

    // Mine blocks to complete a delegation period
    await mineBlocks(7);

    // Check claimable rewards
    const claimableRewardsBefore = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewardsBefore).to.be.gt(0);

    // Claim rewards
    await stargateDelegationContract.claimRewards(tokenId);

    // Check that claimable rewards reset to 0
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.equal(0);

    // Mine a few more blocks
    await mineBlocks(3);

    // Verify that rewards start accumulating again from 0
    const newAccumulatedRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(newAccumulatedRewards).to.be.gt(0);

    // Verify that the new accumulation started from the claim block
    const rewardRate = await stargateDelegationContract.getVthoRewardPerBlock(1);
    expect(newAccumulatedRewards).to.be.closeTo(rewardRate * 3n, 10n);
  });

  it("should stop accumulating delegation rewards after reward accumulation end block is set", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7;
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract with VTHO for rewards
    await mockedVthoToken.transfer(stargateDelegationContract.target, ethers.parseEther("1000"));

    // Mint NFT
    await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    await stargateDelegationContract.delegate(tokenId, true);

    // Accumulate some rewards
    await mineBlocks(3);
    const initialRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(initialRewards).to.be.gt(0);

    // Set the rewards accumulation end block to current block + 2
    const currentBlock = await stargateDelegationContract.clock();
    const endBlock = currentBlock + 2n;
    await stargateDelegationContract.setRewardsAccumulationEndBlock(endBlock);

    // Mine one more block - should still accumulate rewards
    await mineBlocks(1);
    const rewardsAfterOneBlock = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(rewardsAfterOneBlock).to.be.gt(initialRewards);

    // Mine past the end block
    await mineBlocks(3);
    const finalRewards = await stargateDelegationContract.accumulatedRewards(tokenId);

    // Delegation rewards should not have increased after the end block
    expect(finalRewards).to.equal(rewardsAfterOneBlock);

    // But base VTHO rewards should continue to accumulate
    const baseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
    expect(baseRewards).to.be.gt(0);
  });

  it("anyone can trigger the rewards claiming but only the owner of the NFT gets the rewards", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7;
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const {
      stargateDelegationContract,
      stargateNFTContract,
      deployer,
      otherAccounts,
      mockedVthoToken,
    } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    const randomUser = otherAccounts[6];

    // Mint NFT
    await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    await stargateDelegationContract.delegate(tokenId, true);

    // Accumulate some rewards
    await mineBlocks(config.DELEGATION_PERIOD_DURATION);
    const initialRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(initialRewards).to.be.gt(0);
    const claimableRewardsBefore = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewardsBefore).to.be.gt(0);

    const ownerBalanceBeforeClaim = await mockedVthoToken.balanceOf(deployer.address);

    // Claim rewards
    await stargateDelegationContract.connect(randomUser).claimRewards(tokenId);

    // Verify the rewards are not claimed by the random user
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);

    // Owner of the NFT should have received the rewards
    const ownerBalanceAfterClaim = await mockedVthoToken.balanceOf(deployer.address);
    expect(ownerBalanceAfterClaim).to.equal(ownerBalanceBeforeClaim + claimableRewardsBefore);

    // The random user should not have received any rewards
    const randomUserBalanceAfterClaim = await mockedVthoToken.balanceOf(randomUser.address);
    expect(randomUserBalanceAfterClaim).to.equal(0);
  });

  it("should not accrue rewards during maturity period", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10;
    config.TOKEN_LEVELS[0].level.maturityBlocks = 5; // Set maturity period to 5 blocks
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    const latestTokenId = await stargateNFTContract.getCurrentTokenId();

    // Mint NFT
    await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    const tokenId = latestTokenId + 1n;

    // Verify NFT is under maturity period
    expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;
    const maturityEndBlock = await stargateNFTContract.maturityPeriodEndBlock(tokenId);

    const currentBlock = await stargateDelegationContract.clock();

    expect(maturityEndBlock).to.be.gt(currentBlock);

    // Start delegation while under maturity period
    await stargateDelegationContract.delegate(tokenId, true);

    // Verify delegation is active but rewards accumulation start is set to maturity end block
    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.true;
    const rewardsAccumulationStartBlock =
      await stargateDelegationContract.getRewardsAccumulationStartBlock(tokenId);
    expect(rewardsAccumulationStartBlock).to.equal(maturityEndBlock);

    // Mine blocks but stay within maturity period
    const blocksToMine = Number(maturityEndBlock - (await stargateNFTContract.clock()) - 1n);
    if (blocksToMine > 0) {
      await mineBlocks(blocksToMine);
    }

    // Verify still under maturity period and no rewards accumulated
    expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.equal(0);
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);

    // Mine one more block to reach the maturity end block
    await mineBlocks(1);

    // Should still be 0 rewards at the exact maturity end block
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.equal(0);

    // Mine one more block to go past maturity period
    await mineBlocks(1);

    // Now rewards should start accumulating
    expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.false;
    const rewardsAfterMaturity = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(rewardsAfterMaturity).to.be.gt(0);

    // Mine a few more blocks and verify rewards continue to accumulate
    await mineBlocks(3);
    const rewardsAfterMoreBlocks = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(rewardsAfterMoreBlocks).to.be.gt(rewardsAfterMaturity);

    // Verify the reward rate matches expectations
    const rewardRate = await stargateDelegationContract.getVthoRewardPerBlock(1);
    expect(rewardsAfterMoreBlocks).to.equal(rewardRate * 4n); // 4 blocks after maturity
  });

  it("should not accrue rewards after rewards accumulation end block is reached", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10;
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract
    await mockedVthoToken.transfer(stargateDelegationContract.target, ethers.parseEther("1000"));

    // Mint NFT and delegate
    const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;
    await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
    await stargateDelegationContract.delegate(tokenId, true);

    // Accumulate some rewards and complete a delegation period
    await mineBlocks(10);
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.be.gt(0);

    // Set rewards accumulation end block to current block
    const currentBlock = await stargateDelegationContract.clock();
    await stargateDelegationContract.setRewardsAccumulationEndBlock(currentBlock);

    // Claim rewards after the end block is set
    await stargateDelegationContract.claimRewards(tokenId);

    // Mine more blocks - should not accumulate any rewards since last claim was after end block
    await mineBlocks(5);
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.equal(0);
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);
  });

  it("should return 0 rewards when blocksPassed is 0", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10;
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Mint NFT and delegate
    await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());
    await stargateDelegationContract.delegate(tokenId, true);

    // Check rewards immediately after delegation (blocksPassed should be 0)
    const immediateRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(immediateRewards).to.equal(0);

    // Mine one block and verify rewards start accumulating
    await mineBlocks(1);
    const rewardsAfterOneBlock = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(rewardsAfterOneBlock).to.be.gt(0);

    // Verify the exact reward calculation
    const rewardRate = await stargateDelegationContract.getVthoRewardPerBlock(1);
    expect(rewardsAfterOneBlock).to.equal(rewardRate * 1n);
  });

  it("should revert rewards claiming if contract does not have enough VTHO", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10;
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const levelId = config.TOKEN_LEVELS[0].level.id;

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
        mintVtho: false,
      });

    const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

    // Mint NFT and delegate
    await stargateNFTContract.stakeAndDelegate(levelId, true, { value: ethers.parseEther("1") });

    // Mine blocks to complete a delegation period
    await mineBlocks(config.DELEGATION_PERIOD_DURATION);

    // Check claimable rewards
    const claimableRewardsBefore = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewardsBefore).to.be.gt(0);

    await expect(
      stargateDelegationContract.connect(deployer).claimRewards(tokenId)
    ).to.be.revertedWithCustomError(
      stargateDelegationContract,
      "InsufficientVthoBalanceForRewardsClaim"
    );
  });

  it("cannot claim additional rewards if rewards accumulation end block is reached", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10;
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const levelId = config.TOKEN_LEVELS[0].level.id;

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

    // Mint NFT and delegate
    await stargateNFTContract.stakeAndDelegate(levelId, true, { value: ethers.parseEther("1") });

    // Mine blocks to complete a delegation period
    await mineBlocks(config.DELEGATION_PERIOD_DURATION);

    // Check claimable rewards
    const claimableRewardsBefore = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewardsBefore).to.be.gt(0);

    await stargateDelegationContract.setRewardsAccumulationEndBlock(
      await stargateDelegationContract.clock()
    );

    await expect(stargateDelegationContract.connect(deployer).claimRewards(tokenId)).to.emit(
      stargateDelegationContract,
      "DelegationRewardsClaimed"
    );

    await mineBlocks(1);

    expect(await stargateDelegationContract.connect(deployer).accumulatedRewards(tokenId)).to.equal(
      0
    );
  });
});
