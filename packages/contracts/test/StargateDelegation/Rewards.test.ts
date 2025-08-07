import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { mineBlocks } from "../helpers/common";
import { ethers } from "hardhat";
import { TransactionResponse } from "ethers";

describe("shard104: StargateDelegation Rewards", () => {
  let tx: TransactionResponse;
  it("should provide extra VTHO rewards based on NFT tier and lockup", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7; // 7 blocks (for test simplicity)
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity for simplicity
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("10");

    const { stargateDelegationContract, stargateNFTContract } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    // Mint Tier 1 NFT
    tx = await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();

    const tier1TokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Mint Tier 2 NFT
    tx = await stargateNFTContract.stake(2, {
      value: ethers.parseEther("10"),
    });
    await tx.wait();

    const tier2TokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation for both NFTs
    tx = await stargateDelegationContract.delegate(tier1TokenId, true);
    await tx.wait();

    const blockWhenTier1Delegated = await stargateDelegationContract.clock();

    tx = await stargateDelegationContract.delegate(tier2TokenId, true);
    await tx.wait();

    const blockWhenTier2Delegated = await stargateDelegationContract.clock();

    // Mine some blocks to accumulate rewards
    const blocksPassed = 10;
    await mineBlocks(blocksPassed);

    // Check accumulated delegation rewards for both tiers
    const tier1DelegationRewards = await stargateDelegationContract.accumulatedRewards(
      tier1TokenId
    );
    const tier2DelegationRewards = await stargateDelegationContract.accumulatedRewards(
      tier2TokenId
    );

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
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the contracts with VTHO for rewards
    const initialVTHOBalance = ethers.parseEther("1000");
    tx = await mockedVthoToken.transfer(stargateDelegationContract.target, initialVTHOBalance);
    await tx.wait();
    tx = await mockedVthoToken.transfer(stargateNFTContract.target, initialVTHOBalance);
    await tx.wait();

    // Mint NFT
    tx = await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    tx = await stargateDelegationContract.delegate(tokenId, true);
    await tx.wait();
    // Mine fewer blocks than the delegation period
    await mineBlocks(3);

    // Check that rewards are accumulating but not yet claimable
    const accumulatedRewardsBeforePeriodEnd = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );
    const claimableRewardsBeforePeriodEnd = await stargateDelegationContract.claimableRewards(
      tokenId
    );

    expect(accumulatedRewardsBeforePeriodEnd).to.be.gt(0);
    expect(claimableRewardsBeforePeriodEnd).to.equal(0);

    // Try to claim delegation rewards before the delegation period ends should get no rewards
    const balanceBeforeRewardsClaim = await mockedVthoToken.balanceOf(deployer.address);
    await stargateDelegationContract.claimRewards(tokenId);
    const balanceAfterRewardsClaim = await mockedVthoToken.balanceOf(deployer.address);
    expect(balanceAfterRewardsClaim).to.equal(balanceBeforeRewardsClaim);

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
    tx = await stargateNFTContract.claimVetGeneratedVtho(tokenId);
    await tx.wait();

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
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    // Mint NFT
    tx = await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    tx = await stargateDelegationContract.delegate(tokenId, true);
    await tx.wait();

    // Check rewards at different block heights
    const initialDelegationRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    const initialBaseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);

    // Mine 1 block and check that rewards increased

    await mineBlocks(1);
    const delegationRewardsAfter1Block = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );
    const baseRewardsAfter1Block = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);

    expect(delegationRewardsAfter1Block).to.be.gt(initialDelegationRewards);
    expect(baseRewardsAfter1Block).to.be.gt(initialBaseRewards);

    // Mine 2 more blocks and check again
    await mineBlocks(2);

    const delegationRewardsAfter3Blocks = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );
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
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract with VTHO for rewards
    const initialVTHOBalance = ethers.parseEther("1000");
    tx = await mockedVthoToken.transfer(stargateDelegationContract.target, initialVTHOBalance);
    await tx.wait();

    // Mint NFT
    tx = await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    tx = await stargateDelegationContract.delegate(tokenId, true);
    await tx.wait();

    // Mine blocks to complete a delegation period
    await mineBlocks(7);

    // Check claimable rewards
    const claimableRewardsBefore = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewardsBefore).to.be.gt(0);

    // Claim rewards
    tx = await stargateDelegationContract.claimRewards(tokenId);
    await tx.wait();

    // Check that claimable rewards reset to 0
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);
    // Accumulated rewards should be of 1 block (the current block that was mined)
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock
    );

    // Mine a few more blocks
    await mineBlocks(3);

    // Verify that rewards start accumulating again from 0
    const newAccumulatedRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(newAccumulatedRewards).to.be.gt(0);

    // Verify that the new accumulation started from the claim block
    const rewardRate = await stargateDelegationContract.getVthoRewardPerBlock(1);
    expect(newAccumulatedRewards).to.be.closeTo(rewardRate * 4n, 10n);
  });

  it("should stop accumulating delegation rewards after reward accumulation end block is set", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7;
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract with VTHO for rewards
    tx = await mockedVthoToken.transfer(
      stargateDelegationContract.target,
      ethers.parseEther("1000")
    );
    await tx.wait();

    // Mint NFT
    tx = await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    tx = await stargateDelegationContract.delegate(tokenId, true);
    await tx.wait();

    // Accumulate some rewards
    await mineBlocks(3);
    const initialRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(initialRewards).to.be.gt(0);

    // Set the rewards accumulation end block to current block + 2
    const currentBlock = await stargateDelegationContract.clock();
    const endBlock = currentBlock + 2n;
    tx = await stargateDelegationContract.setRewardsAccumulationEndBlock(endBlock);
    await tx.wait();

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
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

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
    tx = await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Start delegation
    tx = await stargateDelegationContract.delegate(tokenId, true);
    await tx.wait();

    // Accumulate some rewards
    await mineBlocks(config.DELEGATION_PERIOD_DURATION);
    const initialRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(initialRewards).to.be.gt(0);
    const claimableRewardsBefore = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewardsBefore).to.be.gt(0);

    const ownerBalanceBeforeClaim = await mockedVthoToken.balanceOf(deployer.address);

    // Claim rewards
    tx = await stargateDelegationContract.connect(randomUser).claimRewards(tokenId);
    await tx.wait();

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

    const { stargateDelegationContract, stargateNFTContract } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    const latestTokenId = await stargateNFTContract.getCurrentTokenId();

    // Mint NFT
    tx = await stargateNFTContract.stake(1, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();

    const tokenId = latestTokenId + 1n;

    // Verify NFT is under maturity period
    expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;
    const maturityEndBlock = await stargateNFTContract.maturityPeriodEndBlock(tokenId);

    const currentBlock = await stargateDelegationContract.clock();

    expect(maturityEndBlock).to.be.gt(currentBlock);

    // Start delegation while under maturity period
    tx = await stargateDelegationContract.delegate(tokenId, true);
    await tx.wait();

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

    const { stargateDelegationContract, stargateNFTContract, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract
    tx = await mockedVthoToken.transfer(
      stargateDelegationContract.target,
      ethers.parseEther("1000")
    );
    await tx.wait();
    // Mint NFT and delegate
    const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;
    tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
    await tx.wait();
    tx = await stargateDelegationContract.delegate(tokenId, true);
    await tx.wait();

    // Accumulate some rewards and complete a delegation period
    await mineBlocks(10);
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.be.gt(0);

    // Set rewards accumulation end block to current block
    const currentBlock = await stargateDelegationContract.clock();
    tx = await stargateDelegationContract.setRewardsAccumulationEndBlock(currentBlock);
    await tx.wait();
    // Claim rewards after the end block is set
    tx = await stargateDelegationContract.claimRewards(tokenId);
    await tx.wait();

    // Mine more blocks - should not accumulate any rewards since last claim was after end block
    await mineBlocks(5);
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.equal(0);
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);
  });

  it("should return 0 rewards when blocksPassed is 0", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10;
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    // Mint NFT and delegate
    tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
    await tx.wait();

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

    const { stargateDelegationContract, stargateNFTContract, deployer } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
        mintVtho: false,
      });

    const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

    // Mint NFT and delegate
    tx = await stargateNFTContract.stakeAndDelegate(levelId, true, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();
    // Mine blocks to complete a delegation period
    await mineBlocks(config.DELEGATION_PERIOD_DURATION);

    // Check claimable rewards
    const claimableRewardsBefore = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewardsBefore).to.be.gt(0);

    await expect(stargateDelegationContract.connect(deployer).claimRewards(tokenId)).to.be.reverted;
  });

  it("cannot claim additional rewards if rewards accumulation end block is reached", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10;
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const levelId = config.TOKEN_LEVELS[0].level.id;

    const { stargateDelegationContract, stargateNFTContract, deployer } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

    // Mint NFT and delegate
    tx = await stargateNFTContract.stakeAndDelegate(levelId, true, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();
    // Mine blocks to complete a delegation period
    await mineBlocks(config.DELEGATION_PERIOD_DURATION);

    // Check claimable rewards
    const claimableRewardsBefore = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewardsBefore).to.be.gt(0);

    tx = await stargateDelegationContract.setRewardsAccumulationEndBlock(
      await stargateDelegationContract.clock()
    );
    await tx.wait();

    await expect(stargateDelegationContract.connect(deployer).claimRewards(tokenId)).to.emit(
      stargateDelegationContract,
      "DelegationRewardsClaimed"
    );

    await mineBlocks(1);

    expect(await stargateDelegationContract.connect(deployer).accumulatedRewards(tokenId)).to.equal(
      0
    );
  });

  it("Claiming rewards late should not cause loss of rewards and should not reset delegation cycle", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks per delegation period
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract with VTHO for rewards
    tx = await mockedVthoToken.transfer(
      stargateDelegationContract.target,
      ethers.parseEther("1000")
    );
    await tx.wait();
    // Mint NFT and start delegation
    tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
    await tx.wait();

    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    tx = await stargateDelegationContract.delegate(tokenId, true);
    await tx.wait();
    const delegationStartBlock = await stargateDelegationContract.clock();
    const initialAccumulationStartBlock =
      await stargateDelegationContract.getRewardsAccumulationStartBlock(tokenId);
    expect(initialAccumulationStartBlock).to.equal(delegationStartBlock);

    // Mine exactly 10 blocks to complete the first delegation period
    await mineBlocks(config.DELEGATION_PERIOD_DURATION);
    const firstPeriodEndBlock = await stargateDelegationContract.clock();
    expect(firstPeriodEndBlock).to.equal(
      delegationStartBlock + BigInt(config.DELEGATION_PERIOD_DURATION)
    );

    // Check claimable rewards after first period completion
    const claimableAfterFirstPeriod = await stargateDelegationContract.claimableRewards(tokenId);
    const accumulatedAfterFirstPeriod = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );
    expect(claimableAfterFirstPeriod).to.be.gt(0);
    expect(accumulatedAfterFirstPeriod).to.be.equal(claimableAfterFirstPeriod);

    // Instead of claiming immediately, wait 5 more blocks (simulating user claiming late)
    await mineBlocks(5);

    // Check rewards before claiming late
    const claimableBeforeLateClaim = await stargateDelegationContract.claimableRewards(tokenId);
    const accumulatedBeforeLateClaim = await stargateDelegationContract.accumulatedRewards(tokenId);

    // The user should still only be able to claim rewards for the completed period
    // but accumulated should include the extra 5 blocks
    expect(claimableBeforeLateClaim).to.equal(claimableAfterFirstPeriod); // Same as before
    expect(accumulatedBeforeLateClaim).to.be.gt(accumulatedAfterFirstPeriod); // More accumulated

    // Get user balance before claiming
    const userBalanceBeforeClaim = await mockedVthoToken.balanceOf(deployer.address);

    // Claim rewards late (at block 15 instead of block 10)
    tx = await stargateDelegationContract.claimRewards(tokenId);
    await tx.wait();
    const claimBlock = await stargateDelegationContract.clock();

    // Check user balance after claim
    const userBalanceAfterClaim = await mockedVthoToken.balanceOf(deployer.address);
    const rewardsClaimed = userBalanceAfterClaim - userBalanceBeforeClaim;
    expect(rewardsClaimed).to.be.gt(0);

    // Accumulated rewards should not be reset (and be grater than accumulated after first period, considering the extra block of the claim tx)
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.be.gt(
      accumulatedBeforeLateClaim - claimableAfterFirstPeriod
    );

    // Check what the contract set as the new accumulation start block
    const newAccumulationStartBlock =
      await stargateDelegationContract.getRewardsAccumulationStartBlock(tokenId);

    // New accumulation start block should be the end of the first period, and not the clock()
    expect(newAccumulationStartBlock).to.equal(firstPeriodEndBlock);
    // The contract should not set the accumulation start to the claim block (15)
    // instead of the proper start of the next period (10)
    expect(newAccumulationStartBlock).to.not.equal(claimBlock);

    const delegationPeriodEndBlock =
      await stargateDelegationContract.currentDelegationPeriodEndBlock(tokenId);

    // Since we waited 6 blocks into the new delegation period to claim rewards, than it should be
    // enough to wait another 4 blocks to complete the second period
    await mineBlocks(4);

    expect(delegationPeriodEndBlock).to.equal(await stargateDelegationContract.clock());

    // Check accumulated rewards after second period completion is the same as the first period
    const accumulatedAfterSecondPeriod = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );
    expect(accumulatedAfterSecondPeriod).to.equal(accumulatedAfterFirstPeriod);

    // Check claimable rewards after second period completion
    const claimableAfterSecondPeriod = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableAfterSecondPeriod).to.be.gt(0);
    expect(claimableAfterSecondPeriod).to.be.equal(accumulatedAfterSecondPeriod);

    // User can claim and since this is the end of the second period
    tx = await stargateDelegationContract.claimRewards(tokenId);
    await tx.wait();

    // after the claim the claimable rewards should be 0
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.be.equal(0);

    // after the claim the accumulated rewards should be the rewards for one block (then block when we claimed)
    const accumulatedAfterClaim = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(accumulatedAfterClaim).to.be.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock
    );

    // ==========================================
    // Test scenario: Wait for 2 full delegation periods without claiming
    // ==========================================

    // Mine 19 more blocks to complete 2 full delegation periods from the last claim
    // (we're currently 1 block into the third period, so we need 19 more to complete periods 3 and 4)
    await mineBlocks(19);

    // Check that we can claim rewards for exactly 2 delegation periods
    const claimableAfterTwoPeriods = await stargateDelegationContract.claimableRewards(tokenId);
    const accumulatedAfterTwoPeriods = await stargateDelegationContract.accumulatedRewards(tokenId);

    // Should be able to claim rewards for exactly 2 delegation periods (20 blocks)
    const expectedRewardsForTwoPeriods =
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * BigInt(20);
    expect(claimableAfterTwoPeriods).to.equal(expectedRewardsForTwoPeriods);
    expect(accumulatedAfterTwoPeriods).to.equal(expectedRewardsForTwoPeriods);

    // Get user balance before claiming the two periods
    const balanceBeforeTwoPeriodsClaimu = await mockedVthoToken.balanceOf(deployer.address);

    // Claim rewards for the two completed periods
    tx = await stargateDelegationContract.claimRewards(tokenId);
    await tx.wait();
    // Verify the correct amount was claimed
    const balanceAfterTwoPeriodsClaim = await mockedVthoToken.balanceOf(deployer.address);
    const rewardsClaimedForTwoPeriods = balanceAfterTwoPeriodsClaim - balanceBeforeTwoPeriodsClaimu;
    expect(rewardsClaimedForTwoPeriods).to.equal(expectedRewardsForTwoPeriods);

    // Check that the accumulation start block was set correctly
    // It should be set to the end of the last completed period (not the claim block)
    const newAccumulationStartAfterTwoPeriods =
      await stargateDelegationContract.getRewardsAccumulationStartBlock(tokenId);
    const expectedStartBlockAfterTwoPeriods = firstPeriodEndBlock + BigInt(30); // End of 4th period (we simulated 3)
    expect(newAccumulationStartAfterTwoPeriods).to.equal(expectedStartBlockAfterTwoPeriods);

    // Verify that claimable rewards are now 0
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);

    // Verify that accumulated rewards only account for the claim transaction block
    const accumulatedAfterTwoPeriodsClaimu = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );
    expect(accumulatedAfterTwoPeriodsClaimu).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock
    );

    // ==========================================
    // Test scenario: Verify next period works correctly after claiming 2 periods
    // ==========================================

    // Mine 8 more blocks to almost complete the next delegation period (the final one will be the claim tx)
    await mineBlocks(8);

    // Should have accumulated rewards but not be claimable yet (period not complete)
    const accumulatedAfterEightMoreBlocks = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );
    const claimableAfterEightMoreBlocks = await stargateDelegationContract.claimableRewards(
      tokenId
    );

    expect(accumulatedAfterEightMoreBlocks).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * BigInt(9) // 8 + 1 from claim block
    );
    expect(claimableAfterEightMoreBlocks).to.equal(0);

    // Mine 1 more block to complete the delegation period
    await mineBlocks(1);

    // Now should be able to claim rewards for exactly 1 delegation period
    const claimableAfterFifthPeriod = await stargateDelegationContract.claimableRewards(tokenId);
    const accumulatedAfterFifthPeriod = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );

    const expectedRewardsForOnePeriod =
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * BigInt(10);
    expect(claimableAfterFifthPeriod).to.equal(expectedRewardsForOnePeriod);
    expect(accumulatedAfterFifthPeriod).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * BigInt(10) // 10 for period
    );

    // Final claim to verify everything still works
    tx = await stargateDelegationContract.claimRewards(tokenId);
    await tx.wait();
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock
    );
  });

  it("should handle delegation exit request and reward claiming correctly", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks per delegation period
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract with VTHO for rewards
    tx = await mockedVthoToken.transfer(
      stargateDelegationContract.target,
      ethers.parseEther("1000")
    );
    await tx.wait();
    // Mint NFT and start delegation
    tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
    await tx.wait();
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    tx = await stargateDelegationContract.delegate(tokenId, true); // Delegate forever
    await tx.wait();
    const delegationStartBlock = await stargateDelegationContract.clock();

    // Verify delegation is active
    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.true;
    expect(await stargateDelegationContract.getDelegationEndBlock(tokenId)).to.equal(
      ethers.MaxUint256
    );
    expect(await stargateDelegationContract.currentDelegationPeriodEndBlock(tokenId)).to.equal(
      delegationStartBlock + BigInt(config.DELEGATION_PERIOD_DURATION)
    );

    // Mine exactly 10 blocks to complete the first delegation period
    await mineBlocks(config.DELEGATION_PERIOD_DURATION);
    const firstPeriodEndBlock = await stargateDelegationContract.clock();
    expect(firstPeriodEndBlock).to.equal(
      delegationStartBlock + BigInt(config.DELEGATION_PERIOD_DURATION)
    );

    // Verify delegation is still active and rewards are claimable
    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.true;
    const claimableAfterFirstPeriod = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableAfterFirstPeriod).to.be.gt(0);
    expect(claimableAfterFirstPeriod).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * BigInt(10)
    );

    // Mine 3 more blocks into the second period
    await mineBlocks(3);

    // Check accumulated rewards before exit request
    const accumulatedBeforeExit = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(accumulatedBeforeExit).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * BigInt(13) // 10 + 3
    );

    // Request delegation exit
    await expect(stargateDelegationContract.requestDelegationExit(tokenId)).to.emit(
      stargateDelegationContract,
      "DelegationExitRequested"
    );

    // Check delegation details after exit request
    const delegationEndBlock = await stargateDelegationContract.getDelegationEndBlock(tokenId);
    const expectedExitBlock = firstPeriodEndBlock + BigInt(config.DELEGATION_PERIOD_DURATION); // End of second period
    expect(delegationEndBlock).to.equal(expectedExitBlock);

    // Delegation should still be active until the exit block is reached
    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.true;

    // Claimable rewards should still be available for the completed first period
    const claimableAfterExitRequest = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableAfterExitRequest).to.equal(claimableAfterFirstPeriod); // Same as before exit request

    // Accumulated rewards should include the exit request transaction block
    const accumulatedAfterExitRequest = await stargateDelegationContract.accumulatedRewards(
      tokenId
    );
    expect(accumulatedAfterExitRequest).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * BigInt(14) // 10 + 3 + 1 (exit request block)
    );

    // Get user balance before claiming
    const userBalanceBeforeClaim = await mockedVthoToken.balanceOf(deployer.address);

    // Claim rewards for the completed first period
    tx = await stargateDelegationContract.claimRewards(tokenId);
    await tx.wait();
    // Get the block when the claim was made
    const claimBlock = await stargateDelegationContract.clock();

    // Verify the correct amount was claimed
    const userBalanceAfterClaim = await mockedVthoToken.balanceOf(deployer.address);
    const rewardsClaimed = userBalanceAfterClaim - userBalanceBeforeClaim;
    expect(rewardsClaimed).to.equal(claimableAfterFirstPeriod);

    // Check that rewards accumulation start was set correctly (should be the next block after the end of first period)
    const newAccumulationStartBlock =
      await stargateDelegationContract.getRewardsAccumulationStartBlock(tokenId);
    expect(newAccumulationStartBlock).to.equal(firstPeriodEndBlock);

    // Verify delegation is still active (exit hasn't been processed yet)
    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.true;

    // Check accumulated rewards after claim (should account for blocks since first period end)
    const accumulatedAfterClaim = await stargateDelegationContract.accumulatedRewards(tokenId);
    const blocksSinceFirstPeriodEnd = claimBlock - firstPeriodEndBlock;
    expect(accumulatedAfterClaim).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * blocksSinceFirstPeriodEnd
    );

    // Mine enough blocks to reach the delegation exit block
    const blocksToMineForExit = Number(delegationEndBlock - claimBlock);
    if (blocksToMineForExit > 0) {
      await mineBlocks(blocksToMineForExit);
    }

    // Now delegation should be inactive
    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.false;

    // Check final accumulated rewards (should be calculated up to the exit block)
    const finalAccumulatedRewards = await stargateDelegationContract.accumulatedRewards(tokenId);
    const totalBlocksFromFirstPeriodEndToExit = delegationEndBlock - firstPeriodEndBlock;
    expect(finalAccumulatedRewards).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock *
        totalBlocksFromFirstPeriodEndToExit
    );

    // Check claimable rewards (should be 0 since we haven't completed another full period)
    const finalClaimableRewards = await stargateDelegationContract.claimableRewards(tokenId);
    expect(finalClaimableRewards).to.be.gt(0);

    // Claim rewards for the completed first period
    tx = await stargateDelegationContract.claimRewards(tokenId);
    await tx.wait();
    const accumulatedAfterClaim2 = await stargateDelegationContract.accumulatedRewards(tokenId);
    expect(accumulatedAfterClaim2).to.equal(0);
    expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);
    const latestAccumulationStartBlock =
      await stargateDelegationContract.getRewardsAccumulationStartBlock(tokenId);
    expect(latestAccumulationStartBlock).to.equal(delegationEndBlock);

    // Verify that delegation can be restarted after exit
    tx = await stargateDelegationContract.delegate(tokenId, false); // Delegate for one period only
    await tx.wait();
    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.true;
    expect(await stargateDelegationContract.getRewardsAccumulationStartBlock(tokenId)).to.equal(
      await stargateDelegationContract.clock()
    );
  });

  it("user should not be able to claim rewards in the same block when he delegates", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks per delegation period
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

    // Fund the delegation contract with VTHO for rewards
    tx = await mockedVthoToken.transfer(
      stargateDelegationContract.target,
      ethers.parseEther("1000")
    );
    await tx.wait();
    // Mint NFT and start delegation
    tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
    await tx.wait();
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    tx = await stargateDelegationContract.delegate(tokenId, true); // Delegate forever
    await tx.wait();
    const claimableRewards = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewards).to.equal(0);

    // Try to claim rewards in the same block when he delegates, should get no rewards
    const balanceBeforeRewardsClaim = await mockedVthoToken.balanceOf(deployer.address);
    await expect(stargateDelegationContract.claimRewards(tokenId)).to.not.emit(
      stargateDelegationContract,
      "DelegationRewardsClaimed"
    );
    const balanceAfterRewardsClaim = await mockedVthoToken.balanceOf(deployer.address);
    expect(balanceAfterRewardsClaim).to.equal(balanceBeforeRewardsClaim);

    await mineBlocks(config.DELEGATION_PERIOD_DURATION);

    const claimableRewards2 = await stargateDelegationContract.claimableRewards(tokenId);
    expect(claimableRewards2).to.equal(
      config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock *
        BigInt(config.DELEGATION_PERIOD_DURATION)
    );

    await expect(stargateDelegationContract.claimRewards(tokenId))
      .to.emit(stargateDelegationContract, "DelegationRewardsClaimed")
      .withArgs(tokenId, claimableRewards2, deployer.address, deployer.address);
  });
});
