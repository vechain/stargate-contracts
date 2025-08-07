import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { mineBlocks } from "../helpers/common";
import { ethers } from "hardhat";
import { ERC20, StargateDelegation, StargateNFT } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ContractsConfig } from "@repo/config/contracts/type";
import { TransactionResponse } from "ethers";
import { compareAddresses } from "@repo/utils/AddressUtils";

describe("shard103: StargateDelegation Delegation", () => {
  let tx: TransactionResponse;
  describe("Scenario: Basic delegation functionality", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tokenId: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 3; // 3 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 3;
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      otherAccounts = contracts.otherAccounts;
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;

      // Mint an NFT to the deployer
      await stargateNFT.stake(levelId, { value: stakeAmount });
    });

    it("should start testing with expected state", async () => {
      // Assert that deployer has the expected NFT
      expect(await stargateNFT.balanceOf(deployer)).to.equal(1);
      expect(compareAddresses(await stargateNFT.ownerOf(tokenId), deployer.address)).to.be.true;

      // NFT should be transferable initially
      expect(await stargateNFT.canTransfer(tokenId)).to.be.true;
    });

    it("user should be able to start delegation if maturity period has ended", async () => {
      // Get the maturity period end block
      const maturityPeriodEndBlock = await stargateNFT.maturityPeriodEndBlock(tokenId);
      const currentBlock = await stargateDelegation.clock();

      // Fast forward to the maturity period end block
      await mineBlocks(Number(maturityPeriodEndBlock - currentBlock));

      // We will need this to check correct event output
      // is clock() + 1n because the call is done 1 before the delegate block
      const nextBlockNumber = (await stargateDelegation.clock()) + 1n;

      // Start delegation
      await expect(stargateDelegation.delegate(tokenId, true))
        .to.emit(stargateDelegation, "DelegationSimulationStarted")
        .withArgs(tokenId, deployer.address, nextBlockNumber, true, deployer.address);

      // Check that everything is lined up correctly
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;
      expect(await stargateDelegation.getRewardsAccumulationStartBlock(tokenId)).to.equal(
        nextBlockNumber
      );
      expect(await stargateDelegation.getDelegationEndBlock(tokenId)).to.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") // infinity
      );

      // Validate currentDelegationPeriodEndBlock for auto-renewal delegation
      const currentPeriodEndBlock = await stargateDelegation.currentDelegationPeriodEndBlock(
        tokenId
      );
      expect(currentPeriodEndBlock).to.equal(
        nextBlockNumber + BigInt(config.DELEGATION_PERIOD_DURATION)
      );

      // NFT should not be transferable
      expect(await stargateNFT.canTransfer(tokenId)).to.be.false;
      await expect(
        stargateNFT
          .connect(deployer)
          .transferFrom(await deployer.getAddress(), otherAccounts[0].address, tokenId)
      ).to.be.reverted;

      const baseURI = await stargateNFT.baseURI();
      const tokenURI = await stargateNFT.tokenURI(tokenId);
      expect(tokenURI).to.equal(`${baseURI}${levelId}_locked.json`);

      // NFT is accumulating rewards
      await mineBlocks(3);
      expect(await stargateDelegation.accumulatedRewards(tokenId)).to.not.equal(0);

      // can get delegation details
      const delegationDetails = await stargateDelegation.getDelegationDetails(tokenId);
      expect(delegationDetails[0]).to.be.true;
      expect(delegationDetails[1]).to.equal(await stargateDelegation.claimableRewards(tokenId));
      expect(delegationDetails[2]).to.equal(nextBlockNumber);
      expect(delegationDetails[3]).to.equal(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      );
    });

    it("cannot delegate if the NFT is already delegated", async () => {
      tx = await stargateDelegation.delegate(tokenId, false);
      await tx.wait();
      // The NFT should already be delegated from the previous test
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;

      // Try to delegate the same NFT again
      await expect(stargateDelegation.delegate(tokenId, false)).to.be.reverted;

      // Also test with auto-renewal enabled
      await expect(stargateDelegation.delegate(tokenId, true)).to.be.reverted;
    });
  });

  describe("Scenario: Maturity period and rewards handling", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let vthoMock: ERC20;
    let deployer: HardhatEthersSigner;
    let tokenId: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 30; // blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 3;
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      vthoMock = contracts.mockedVthoToken;
      deployer = contracts.deployer;
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;

      // Mint an NFT to the deployer
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();
    });

    it("maturity period must end before I can start to accrue rewards", async () => {
      // Get the maturity period end block
      const maturityPeriodEndBlock = await stargateNFT.maturityPeriodEndBlock(tokenId);
      let currentBlock = await stargateDelegation.clock();

      // must still be in the maturity period
      expect(maturityPeriodEndBlock).to.be.greaterThan(currentBlock);
      expect(await stargateNFT.isUnderMaturityPeriod(tokenId)).to.be.true;

      // Start delegation
      await expect(stargateDelegation.delegate(tokenId, true))
        .to.emit(stargateDelegation, "DelegationSimulationStarted")
        .withArgs(tokenId, deployer.address, maturityPeriodEndBlock, true, deployer.address);

      currentBlock = await stargateDelegation.clock();

      // Validate currentDelegationPeriodEndBlock - should be maturity end block + delegation period
      const currentPeriodEndBlock = await stargateDelegation.currentDelegationPeriodEndBlock(
        tokenId
      );
      expect(currentPeriodEndBlock).to.equal(
        maturityPeriodEndBlock + BigInt(config.DELEGATION_PERIOD_DURATION)
      );

      // until we reach the maturity period end block the NFT should not accumulate rewards
      await mineBlocks(Number(maturityPeriodEndBlock - currentBlock));
      expect(await stargateDelegation.accumulatedRewards(tokenId)).to.equal(0);

      // after the maturity period end block the NFT should accumulate rewards
      await mineBlocks(1);
      expect(await stargateDelegation.accumulatedRewards(tokenId)).to.not.equal(0);

      // I can claim the rewards after the delegation period ends, not before
      const currentDelegationPeriodEndBlock =
        await stargateDelegation.currentDelegationPeriodEndBlock(tokenId);
      currentBlock = await stargateDelegation.clock();
      expect(currentDelegationPeriodEndBlock).to.be.greaterThan(currentBlock);

      // try to claim the rewards before the epoch ends, should get no rewards
      const balanceBeforeRewardsClaim = await vthoMock.balanceOf(deployer.address);
      await expect(stargateDelegation.connect(deployer).claimRewards(tokenId)).to.not.emit(
        stargateDelegation,
        "DelegationRewardsClaimed"
      );
      const balanceAfterRewardsClaim = await vthoMock.balanceOf(deployer.address);
      expect(balanceAfterRewardsClaim).to.equal(balanceBeforeRewardsClaim);

      await mineBlocks(Number(currentDelegationPeriodEndBlock - currentBlock));
      const rewards = await stargateDelegation.claimableRewards(tokenId);
      expect(rewards).to.not.equal(0);
      const accumulatedRewards = await stargateDelegation.accumulatedRewards(tokenId);
      expect(accumulatedRewards).to.not.equal(0);

      // Claim the rewards
      await expect(stargateDelegation.connect(deployer).claimRewards(tokenId))
        .to.emit(stargateDelegation, "DelegationRewardsClaimed")
        .withArgs(tokenId, rewards, await deployer.getAddress(), await deployer.getAddress());
      expect(await stargateDelegation.claimableRewards(tokenId)).to.equal(0);
    });
  });

  describe("Scenario: Rewards accumulation end block", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let tokenId: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;

      // Mint an NFT to the deployer
      await stargateNFT.stake(levelId, { value: stakeAmount });

      // Start delegation
      await stargateDelegation.delegate(tokenId, true);
    });

    it("should stop accumulating rewards after rewardsAccumulationEndBlock is reached", async () => {
      // Accumulate some rewards
      await mineBlocks(3);

      // Check that rewards are accumulating
      const initialRewards = await stargateDelegation.accumulatedRewards(tokenId);
      expect(initialRewards).to.be.gt(0);

      // Set the rewards accumulation end block to current block + 2
      const currentBlock = await stargateDelegation.clock();
      const endBlock = currentBlock + 3n; // keep in mind when setRewardsAccumulationEndBlock is called a block is already mined
      await expect(stargateDelegation.setRewardsAccumulationEndBlock(endBlock))
        .to.emit(stargateDelegation, "RewardsAccumulationEndBlockSet")
        .withArgs(endBlock);

      // Verify the end block was set
      expect(await stargateDelegation.getRewardsAccumulationEndBlock()).to.equal(endBlock);

      // Mine one more block - should still accumulate rewards
      await mineBlocks(1);
      const middleRewards = await stargateDelegation.accumulatedRewards(tokenId);
      expect(middleRewards).to.be.gt(initialRewards);

      // Mine one more block to reach the end block
      await mineBlocks(1);
      const endBlockRewards = await stargateDelegation.accumulatedRewards(tokenId);
      expect(endBlockRewards).to.be.gt(middleRewards);

      // Mine more blocks - rewards should not increase anymore
      await mineBlocks(5);
      const finalRewards = await stargateDelegation.accumulatedRewards(tokenId);
      expect(finalRewards).to.equal(endBlockRewards);

      // Claim rewards
      tx = await stargateDelegation.claimRewards(tokenId);
      await tx.wait();

      // Verify no more rewards accumulate after claiming
      await mineBlocks(5);
      expect(await stargateDelegation.accumulatedRewards(tokenId)).to.equal(0);
      expect(await stargateDelegation.claimableRewards(tokenId)).to.equal(0);

      // Test that exit delegation works immediately after end block
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      // Verify delegation is no longer active
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;

      // Verify NFT can be transferred now
      expect(await stargateNFT.canTransfer(tokenId)).to.be.true;
    });
  });

  describe("Scenario: NFT locking and transferability", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tokenId: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      otherAccounts = contracts.otherAccounts;
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;

      // Mint an NFT to the deployer
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();

      // Start delegation
      tx = await stargateDelegation.delegate(tokenId, false);
      await tx.wait();
    });

    it("NFT is locked (not transferable) if delegation is active", async () => {
      // NFT should not be transferable
      expect(await stargateNFT.canTransfer(tokenId)).to.be.false;

      // Validate currentDelegationPeriodEndBlock for non-auto-renewal delegation
      const currentPeriodEndBlock = await stargateDelegation.currentDelegationPeriodEndBlock(
        tokenId
      );
      const currentDelegationEndBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      expect(currentPeriodEndBlock).to.equal(currentDelegationEndBlock);

      // Try to transfer the NFT, expect to be reverted
      await expect(
        stargateNFT
          .connect(deployer)
          .transferFrom(await deployer.getAddress(), otherAccounts[0].address, tokenId)
      ).to.be.reverted;

      // uri should return locked metadata
      let baseURI = await stargateNFT.baseURI();
      let tokenURI = await stargateNFT.tokenURI(tokenId);
      expect(tokenURI).to.equal(`${baseURI}${levelId}_locked.json`);

      // It should be possible to transfer after the delegation ends
      const finalDelegationEndBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      const currentBlock = await stargateDelegation.clock();
      await mineBlocks(Number(finalDelegationEndBlock - currentBlock));
      expect(await stargateNFT.canTransfer(tokenId)).to.be.true;

      // Try to transfer the NFT
      await expect(
        stargateNFT
          .connect(deployer)
          .transferFrom(await deployer.getAddress(), otherAccounts[0].address, tokenId)
      ).to.not.be.reverted;

      const newOwner = await stargateNFT.ownerOf(tokenId);
      expect(newOwner).to.equal(otherAccounts[0].address);

      // uri should return unlocked metadata
      baseURI = await stargateNFT.baseURI();
      tokenURI = await stargateNFT.tokenURI(tokenId);
      expect(tokenURI).to.equal(`${baseURI}${levelId}.json`);
    });
  });

  describe("Scenario: Auto-renewal behavior", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let tokenId1: number;
    let tokenId2: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      tokenId1 = Number(await stargateNFT.getCurrentTokenId()) + 1;
      tokenId2 = tokenId1 + 1;

      // We mint 2 NFTs to the deployer, one will be delegated with auto renew, the other without
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();

      tx = await stargateNFT.stake(levelId, { value: stakeAmount, gasLimit: 10_000_000 });
      await tx.wait();

      // Delegate the first NFT without auto renew
      tx = await stargateDelegation.delegate(tokenId1, false);
      await tx.wait();

      // Delegate the second NFT with auto renew
      tx = await stargateDelegation.delegate(tokenId2, true);
      await tx.wait();
    });

    it("delegation without auto renew should end after a full delegation period", async () => {
      const token1DelegationEndBlock = await stargateDelegation.getDelegationEndBlock(tokenId1);

      // Validate currentDelegationPeriodEndBlock for both tokens before period ends
      const token1CurrentPeriodEnd = await stargateDelegation.getDelegationEndBlock(tokenId1);
      const token2CurrentPeriodEnd = await stargateDelegation.getDelegationEndBlock(tokenId2);

      // Both should have the same current period end since they were delegated in the same setup
      expect(token1CurrentPeriodEnd).to.be.gt(0);
      expect(token2CurrentPeriodEnd).to.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      ); // infinity for auto-renewal

      // Fast forward to the end of the delegation period
      await mineBlocks(config.DELEGATION_PERIOD_DURATION);

      // The first NFT should not be active anymore
      expect(await stargateDelegation.isDelegationActive(tokenId1)).to.be.false;

      // The second NFT should still be active
      expect(await stargateDelegation.isDelegationActive(tokenId2)).to.be.true;

      // The first NFT SHOULD NOT have been renewed
      expect(await stargateDelegation.getDelegationEndBlock(tokenId1)).to.equal(
        token1DelegationEndBlock
      );
      expect(await stargateDelegation.clock()).to.be.greaterThan(token1DelegationEndBlock);
    });
  });

  describe("Scenario: Delegation after rewards accumulation period ends", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let tokenId: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;

      // Mint an NFT to the deployer
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();
    });

    it("cannot delegate if rewards accumulation period has ended", async () => {
      // Set rewards accumulation end block to current block + 5
      const currentBlock = await stargateDelegation.clock();
      const endBlock = currentBlock + 5n;

      await expect(stargateDelegation.setRewardsAccumulationEndBlock(endBlock))
        .to.emit(stargateDelegation, "RewardsAccumulationEndBlockSet")
        .withArgs(endBlock);

      // Fast forward past the rewards accumulation end block
      await mineBlocks(Number(endBlock - currentBlock + 1n));

      // Verify we're past the end block
      const newCurrentBlock = await stargateDelegation.clock();
      expect(newCurrentBlock).to.be.greaterThan(endBlock);

      // Try to delegate - should fail with RewardsAccumulationPeriodEnded
      await expect(stargateDelegation.delegate(tokenId, false)).to.be.reverted;

      // Also test with auto-renewal enabled
      await expect(stargateDelegation.delegate(tokenId, true)).to.be.reverted;

      // Verify the NFT is still not delegated
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
    });
  });

  describe("Scenario: Delegation with invalid NFT level reward rate", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let tokenId: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;

      // Mint an NFT to the deployer
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();
    });

    it("cannot delegate if NFT level has no reward rate set", async () => {
      // Set the reward rate for this level to 0 (no rewards)
      tx = await stargateDelegation.setVthoRewardPerBlockForLevel(levelId, 0);
      await tx.wait();
      // Verify the reward rate is now 0
      const rewardRate = await stargateDelegation.getVthoRewardPerBlock(levelId);
      expect(rewardRate).to.equal(0);

      // Try to delegate - should fail with InvalidNFTLevel
      await expect(stargateDelegation.delegate(tokenId, false)).to.be.reverted;

      // Also test with auto-renewal enabled
      await expect(stargateDelegation.delegate(tokenId, true)).to.be.reverted;

      // Verify the NFT is still not delegated
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
    });
  });

  describe("Scenario: Delegation exit validation", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tokenId1: number;
    let tokenId2: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      otherAccounts = contracts.otherAccounts;
      tokenId1 = Number(await stargateNFT.getCurrentTokenId()) + 1;
      tokenId2 = tokenId1 + 1;

      // Mint two NFTs to the deployer
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();

      tx = await stargateNFT.stake(levelId, { value: stakeAmount, gasLimit: 10_000_000 });
      await tx.wait();

      // Delegate only the second NFT
      tx = await stargateDelegation.delegate(tokenId2, true);
      await tx.wait();
    });

    it("cannot exit delegation if NFT is not being delegated", async () => {
      // Verify the first NFT is not delegated
      expect(await stargateDelegation.isDelegationActive(tokenId1)).to.be.false;

      // Try to exit delegation for non-delegated NFT - should fail
      await expect(stargateDelegation.requestDelegationExit(tokenId1)).to.be.reverted;
    });

    it("cannot get currentDelegationPeriodEndBlock of an NFT that does not exist", async () => {
      const nonExistentTokenId = 999; // This token ID should not exist

      // Try to get currentDelegationPeriodEndBlock for non-existent NFT - should fail
      await expect(stargateDelegation.currentDelegationPeriodEndBlock(nonExistentTokenId)).to.be
        .reverted;
    });

    it("cannot exit delegation if caller is not the owner of the delegated NFT", async () => {
      // Verify the second NFT is delegated and owned by deployer
      expect(await stargateDelegation.isDelegationActive(tokenId2)).to.be.true;
      expect(await stargateNFT.ownerOf(tokenId2)).to.equal(deployer.address);

      const nonOwner = otherAccounts[0];

      // Try to exit delegation as non-owner - should fail
      await expect(stargateDelegation.connect(nonOwner).requestDelegationExit(tokenId2)).to.be
        .reverted;

      // Verify the NFT is still delegated after failed attempt
      expect(await stargateDelegation.isDelegationActive(tokenId2)).to.be.true;
    });

    it("should be able to exit delegation as the owner", async () => {
      // Verify the second NFT is still delegated
      expect(await stargateDelegation.isDelegationActive(tokenId2)).to.be.true;

      // Check currentDelegationPeriodEndBlock before exit
      const periodEndBlockBeforeExit = await stargateDelegation.currentDelegationPeriodEndBlock(
        tokenId2
      );
      expect(periodEndBlockBeforeExit).to.be.gt(0);

      // Exit delegation as the owner - should succeed
      await expect(stargateDelegation.connect(deployer).requestDelegationExit(tokenId2)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      // Verify delegation end block is set (not infinity anymore)
      const exitDelegationEndBlock = await stargateDelegation.getDelegationEndBlock(tokenId2);
      expect(exitDelegationEndBlock).to.not.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );
      expect(exitDelegationEndBlock).to.be.gt(0);

      // Verify currentDelegationPeriodEndBlock remains the same after exit request
      const periodEndBlockAfterExit = await stargateDelegation.currentDelegationPeriodEndBlock(
        tokenId2
      );
      expect(periodEndBlockAfterExit).to.equal(periodEndBlockBeforeExit);

      const delegationEndBlock = await stargateDelegation.getDelegationEndBlock(tokenId2);
      expect(delegationEndBlock).to.equal(periodEndBlockAfterExit);
    });

    it("should still be possible to call accumulatedRewards after delegation exit", async () => {
      // Use tokenId1 which should be available from the setup (not delegated initially)
      // First, let's delegate it
      tx = await stargateDelegation.delegate(tokenId1, true);
      await tx.wait();

      // Accumulate some rewards first
      await mineBlocks(3);

      // Verify delegation is active and rewards are accumulating
      expect(await stargateDelegation.isDelegationActive(tokenId1)).to.be.true;
      const rewardsBeforeExit = await stargateDelegation.accumulatedRewards(tokenId1);
      expect(rewardsBeforeExit).to.be.gt(0);

      // Exit delegation
      await expect(stargateDelegation.requestDelegationExit(tokenId1)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      // Delegation is still active until we reach the exit block
      expect(await stargateDelegation.isDelegationActive(tokenId1)).to.be.true;

      const exitBlock = await stargateDelegation.getDelegationEndBlock(tokenId1);
      const clock = await stargateDelegation.clock();
      await mineBlocks(Number(exitBlock - clock));

      // Now delegation should be inactive
      expect(await stargateDelegation.isDelegationActive(tokenId1)).to.be.false;

      // Verify we can still call accumulatedRewards after exit
      const rewardsAtExit = await stargateDelegation.accumulatedRewards(tokenId1);
      expect(rewardsAtExit).to.be.gte(rewardsBeforeExit);

      // Mine more blocks after exit
      await mineBlocks(5);

      // Verify accumulated rewards remain the same (no more accumulation)
      const rewardsAfterMoreBlocks = await stargateDelegation.accumulatedRewards(tokenId1);
      expect(rewardsAfterMoreBlocks).to.equal(rewardsAtExit);

      // Also verify that claimableRewards works and matches accumulated rewards
      const claimableRewards = await stargateDelegation.claimableRewards(tokenId1);
      expect(claimableRewards).to.equal(rewardsAfterMoreBlocks);

      // Verify we can still get delegation details
      const delegationDetails = await stargateDelegation.getDelegationDetails(tokenId1);
      expect(delegationDetails[0]).to.be.false; // isDelegationActive should be false
      expect(delegationDetails[1]).to.equal(claimableRewards); // claimableRewards
      expect(delegationDetails[2]).to.be.gt(0); // rewardsAccumulationStartBlock should be set
      expect(delegationDetails[3]).to.be.gt(0); // delegationEndBlock should be set (not infinity)
      expect(delegationDetails[3]).to.not.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );
    });

    it("Exit block number should be set correctly when requesting delegation exit", async () => {
      // Delegate the NFT
      tx = await stargateDelegation.delegate(tokenId1, true);
      await tx.wait();

      const delegationStartBlock = await stargateDelegation.clock();
      const rewardsAccumulationStartBlock =
        await stargateDelegation.getRewardsAccumulationStartBlock(tokenId1);
      expect(rewardsAccumulationStartBlock).to.equal(delegationStartBlock);

      // auto renew is enabled, so the exit block should be infinity
      expect(await stargateDelegation.getDelegationEndBlock(tokenId1)).to.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );

      // get the current delegation period end block
      const currentDelegationPeriodEndBlock =
        await stargateDelegation.currentDelegationPeriodEndBlock(tokenId1);
      expect(currentDelegationPeriodEndBlock).to.equal(
        delegationStartBlock + BigInt(config.DELEGATION_PERIOD_DURATION)
      );

      // Request delegation exit
      await stargateDelegation.requestDelegationExit(tokenId1);

      // the exit block should be the current delegation period end block
      const exitBlock = await stargateDelegation.getDelegationEndBlock(tokenId1);
      expect(exitBlock).to.equal(currentDelegationPeriodEndBlock);

      // fast forward to the exit block
      let currentBlock = await stargateDelegation.clock();
      await mineBlocks(Number(exitBlock - currentBlock));
      currentBlock = await stargateDelegation.clock();
      expect(currentBlock).to.equal(exitBlock);

      // Verify the NFT is not delegated anymore
      expect(await stargateDelegation.isDelegationActive(tokenId1)).to.be.false;

      // Check that the user can claim the rewards correctly
      let accumulatedRewards = await stargateDelegation.accumulatedRewards(tokenId1);
      expect(accumulatedRewards).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock *
          BigInt(config.DELEGATION_PERIOD_DURATION)
      );

      let claimableRewards = await stargateDelegation.claimableRewards(tokenId1);
      expect(claimableRewards).to.equal(accumulatedRewards);

      // Claim the rewards
      tx = await stargateDelegation.claimRewards(tokenId1);
      await tx.wait();
      // Verify the rewards accumulation start block is set to the next block after the exit block
      let rewardsAccumulationStartBlockAfterClaim =
        await stargateDelegation.getRewardsAccumulationStartBlock(tokenId1);
      expect(rewardsAccumulationStartBlockAfterClaim).to.equal(exitBlock);

      accumulatedRewards = await stargateDelegation.accumulatedRewards(tokenId1);
      expect(accumulatedRewards).to.equal(0);

      claimableRewards = await stargateDelegation.claimableRewards(tokenId1);
      expect(claimableRewards).to.equal(0);

      // Verify that if user delegates again, there are no issues in rewards accumulation
      tx = await stargateDelegation.delegate(tokenId1, true);
      await tx.wait();
      const newDelegationStartBlock = await stargateDelegation.clock();
      await mineBlocks(config.DELEGATION_PERIOD_DURATION);

      accumulatedRewards = await stargateDelegation.accumulatedRewards(tokenId1);
      expect(accumulatedRewards).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock *
          BigInt(config.DELEGATION_PERIOD_DURATION)
      );

      claimableRewards = await stargateDelegation.claimableRewards(tokenId1);
      expect(claimableRewards).to.equal(accumulatedRewards);

      // Claim the rewards
      tx = await stargateDelegation.claimRewards(tokenId1);
      await tx.wait();

      // Verify the rewards accumulation start block is set to the next block after the exit block
      const lastCompletedPeriodEndBlock =
        await stargateDelegation.calculateLastCompletedPeriodEndBlock(tokenId1);
      expect(lastCompletedPeriodEndBlock).to.equal(
        newDelegationStartBlock + BigInt(config.DELEGATION_PERIOD_DURATION)
      );

      const newAccumulationStartBlock = await stargateDelegation.getRewardsAccumulationStartBlock(
        tokenId1
      );
      expect(newAccumulationStartBlock).to.equal(lastCompletedPeriodEndBlock);

      // since delegation is still active we need to have 1 block of accumulated rewards (the block when we claimed the rewards)
      accumulatedRewards = await stargateDelegation.accumulatedRewards(tokenId1);
      expect(accumulatedRewards).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * 1n
      );

      claimableRewards = await stargateDelegation.claimableRewards(tokenId1);
      expect(claimableRewards).to.equal(0);
    });
  });

  describe("Scenario: Repeatedly call delegation exit", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];

    const levelId = 1;
    let tokenId: number;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      otherAccounts = contracts.otherAccounts;

      // Mint a new NFT for this specific test to avoid interference
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();
    });

    it("if user delegates with autorenew disabled he cannot ask to exit delegation (since it's already planned)", async () => {
      // Delegate the NFT (with no auto renew)
      tx = await stargateDelegation.delegate(tokenId, false);
      await tx.wait();

      const exitBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      expect(exitBlock).to.not.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );

      // Verify delegation is active
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;

      // Request delegation exit - should fail
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.be.reverted;

      // Verify the exit block remains unchanged after failed request
      const exitBlockAfterFailedRequest = await stargateDelegation.getDelegationEndBlock(tokenId);
      expect(exitBlockAfterFailedRequest).to.equal(exitBlock);

      // Verify delegation is still active (hasn't reached exit block yet)
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;

      // Fast forward to the exit block to complete the delegation exit
      const currentBlock = await stargateDelegation.clock();
      await mineBlocks(Number(exitBlock - currentBlock));

      // Verify delegation is now inactive
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
    });

    it("if a user delegates with autorenew enabled, then he cannot repeatedly call exit delegation after first time", async () => {
      // Delegate the NFT again (this time with autorenew) - should work without issues
      await expect(stargateDelegation.delegate(tokenId, true)).to.emit(
        stargateDelegation,
        "DelegationSimulationStarted"
      );

      // Verify delegation is active again
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;

      // Verify NFT is locked again
      expect(await stargateNFT.canTransfer(tokenId)).to.be.false;

      // Get the new delegation end block (should be infinity for non-auto-renewal)
      expect(await stargateDelegation.getDelegationEndBlock(tokenId)).to.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );

      // Request delegation exit again - should succeed
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      // Verify the exit was registered properly
      const exitBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      expect(exitBlock).to.not.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );

      // Try to request delegation exit again (second time) - should fail
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.be.reverted;

      // Verify delegation is still active until second exit block is reached
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;

      // Fast forward to the exit block to complete the delegation exit
      const currentBlock = await stargateDelegation.clock();
      await mineBlocks(Number(exitBlock - currentBlock));

      // Verify delegation is now inactive
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
    });
  });

  describe("Scenario: Delegation exit during maturity period", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let tokenId: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");
    const maturityBlocks = 15; // Longer maturity period to test exit during maturity

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = maturityBlocks; // Set maturity period
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;

      // Mint an NFT to the deployer
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();
    });

    it("should set exit block to maturity period end + delegation cycle when exiting during maturity period", async () => {
      // Start delegation while under maturity period
      tx = await stargateDelegation.delegate(tokenId, false);
      await tx.wait();
      // Verify NFT is under maturity period
      const isUnderMaturity = await stargateNFT.isUnderMaturityPeriod(tokenId);
      expect(isUnderMaturity).to.be.true;

      const maturityEndBlock = await stargateNFT.maturityPeriodEndBlock(tokenId);
      const currentBlock = await stargateDelegation.clock();
      expect(maturityEndBlock).to.be.greaterThan(currentBlock);

      // Verify delegation is active
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;

      expect(await stargateDelegation.getDelegationEndBlock(tokenId)).to.not.equal(
        "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
      );

      expect(await stargateNFT.isUnderMaturityPeriod(tokenId)).to.be.true;

      // Get the current delegation period end block (this is what the contract uses for exit)
      const currentPeriodEndBlock = await stargateDelegation.currentDelegationPeriodEndBlock(
        tokenId
      );

      // Verify the exit block is set to the current delegation period end block
      const exitDelegationEndBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      // it will exit after the last block when the current cycle ends
      expect(exitDelegationEndBlock).to.equal(currentPeriodEndBlock);

      // Verify the calculation is based on maturity end + delegation period
      const expectedEndBlock = maturityEndBlock + BigInt(config.DELEGATION_PERIOD_DURATION);
      expect(exitDelegationEndBlock).to.equal(expectedEndBlock);
    });
  });

  describe("Scenario: Early-exit after delegation exit request when stargate program ends", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let deployer: HardhatEthersSigner;
    let mockedVthoToken: any;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    beforeEach(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 20; // 20 blocks for longer delegation period
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      deployer = contracts.deployer;
      mockedVthoToken = contracts.mockedVthoToken;
    });

    // In case the delegation mode was initially set to forever, and the user requested an early
    // exit from the delegation, and then rewards stopped before the end of the exit period,
    // the user has the opportunity to exit early, instead of waiting for the end of his current
    // delegation period (avoiding the need to wait more than necessary).
    it("User can request early delegation exit even if delegation exit was already requested in the past", async () => {
      const tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();
      // 1. User delegates with forever mode (delegationEndBlock = infinity)
      tx = await stargateDelegation.delegate(tokenId, true);
      await tx.wait();
      // Verify delegation is set to forever
      expect(await stargateDelegation.getDelegationEndBlock(tokenId)).to.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );

      // 2. User requests delegation exit (changes delegationEndBlock to a future block)
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      const exitBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      expect(exitBlock).to.not.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );
      expect(exitBlock).to.be.gt(await stargateDelegation.clock());

      // 3. Some time passes, then rewards accumulation ends BEFORE the scheduled exit
      await mineBlocks(2);
      let currentBlock = await stargateDelegation.clock();
      const earlyEndBlock = currentBlock + 2n; // End rewards before scheduled exit

      // Verify the early end block is before the scheduled exit
      expect(earlyEndBlock).to.be.lt(exitBlock);

      tx = await stargateDelegation.setRewardsAccumulationEndBlock(earlyEndBlock);
      await tx.wait();
      // Fast forward past the rewards end block but before scheduled exit
      await mineBlocks(Number(earlyEndBlock - currentBlock + 1n));

      // Ensure that the stargate program has ended
      const stargateProgramEndBlock = await stargateDelegation.getRewardsAccumulationEndBlock();
      currentBlock = await stargateDelegation.clock();
      expect(stargateProgramEndBlock).to.be.lte(currentBlock);

      // And ensure that the delegation is still active for the user
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;
      expect(await stargateDelegation.getDelegationEndBlock(tokenId)).to.be.greaterThan(
        currentBlock
      );

      // 4. User should be able to exit early since rewards have stopped
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      // Verify delegation is now inactive
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;

      // Verify the exit block is set to the current block
      const exitBlockAfterEarlyExit = await stargateDelegation.getDelegationEndBlock(tokenId);
      currentBlock = await stargateDelegation.clock();
      expect(exitBlockAfterEarlyExit).to.equal(currentBlock);
    });

    // In case of a user delegating without autorenew, where the delegation period happens after
    // the stargate program ends, the user can request an early delegation
    it("User with finite delegation can exit early when rewards stop before scheduled end", async () => {
      // reset the rewards accumulation end block
      tx = await stargateDelegation.setRewardsAccumulationEndBlock(0n);
      await tx.wait();

      const tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();

      // 1. User delegates with finite duration (delegationEndBlock != infinity)
      tx = await stargateDelegation.delegate(tokenId, false);
      await tx.wait();

      const scheduledExitBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      expect(scheduledExitBlock).to.not.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );
      expect(scheduledExitBlock).to.be.gt(await stargateDelegation.clock());

      // 2. Some time passes, then rewards accumulation ends BEFORE the scheduled exit
      await mineBlocks(5);
      let currentBlock = await stargateDelegation.clock();
      const earlyEndBlock = currentBlock + 3n; // End rewards before scheduled exit

      // Verify the early end block is before the scheduled exit
      expect(earlyEndBlock).to.be.lt(scheduledExitBlock);

      tx = await stargateDelegation.setRewardsAccumulationEndBlock(earlyEndBlock);
      await tx.wait();

      // Fast forward past the rewards end block but before scheduled exit
      await mineBlocks(Number(earlyEndBlock - currentBlock + 1n));

      // 3. User should be able to exit early since rewards have stopped,
      //    but the current implementation prevents this because delegationEndBlock != infinity
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      // Verify delegation is now inactive
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;

      // Verify the exit block is set to the current block
      const exitBlockAfterEarlyExit = await stargateDelegation.getDelegationEndBlock(tokenId);
      currentBlock = await stargateDelegation.clock();
      expect(exitBlockAfterEarlyExit).to.equal(currentBlock);
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
    });

    it("User with autorenew can request early delegation exit when stargate program ends before scheduled end", async () => {
      // reset the rewards accumulation end block
      tx = await stargateDelegation.setRewardsAccumulationEndBlock(0n);
      await tx.wait();

      const tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();

      // User delegates with forever mode
      tx = await stargateDelegation.delegate(tokenId, true);
      await tx.wait();

      const scheduledExitBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      expect(scheduledExitBlock).to.equal(
        BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
      );

      // Some time passes, then rewards accumulation ends
      await mineBlocks(5);
      const currentBlock = await stargateDelegation.clock();
      const earlyEndBlock = currentBlock + 2n;

      tx = await stargateDelegation.setRewardsAccumulationEndBlock(earlyEndBlock);
      await tx.wait();

      // Fast forward past the rewards end block
      await mineBlocks(Number(earlyEndBlock - currentBlock + 1n));

      // User should be able to exit immediately when rewards have stopped
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      // Verify immediate exit (delegationEndBlock should be set to current block)
      const exitBlock = await stargateDelegation.getDelegationEndBlock(tokenId);
      const currentBlockAfterExit = await stargateDelegation.clock();

      // The exit should be immediate (within 1 block due to mining)
      expect(exitBlock).to.equal(currentBlockAfterExit);

      // Delegation should be inactive or become inactive very soon
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
    });

    it("should correctly calculate claimable rewards when early exiting due to stargate program ending", async () => {
      // reset the rewards accumulation end block
      tx = await stargateDelegation.setRewardsAccumulationEndBlock(0n);
      await tx.wait();

      const tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;
      tx = await stargateNFT.stake(levelId, { value: stakeAmount });
      await tx.wait();

      // Get reward rate for this level to calculate expected rewards
      const rewardRate = await stargateDelegation.getVthoRewardPerBlock(levelId);
      expect(rewardRate).to.be.gt(0);

      // User delegates with forever mode
      tx = await stargateDelegation.delegate(tokenId, true);
      const delegationReceipt = await tx.wait();
      const delegationBlock = BigInt(delegationReceipt!.blockNumber);

      const rewardsAccumulationStartBlock =
        await stargateDelegation.getRewardsAccumulationStartBlock(tokenId);
      expect(rewardsAccumulationStartBlock).to.equal(delegationBlock);

      // Mine exactly 2 complete delegation periods + a few extra blocks
      const delegationPeriod = BigInt(config.DELEGATION_PERIOD_DURATION);
      const blocksToMine = delegationPeriod * 2n + 5n; // 2 complete periods + 5 extra blocks
      await mineBlocks(Number(blocksToMine));
      // At this point, user has 2 complete delegation periods worth of claimable rewards
      // and is 5 blocks into the 3rd period

      const expectedClaimableBlocks = delegationPeriod * 2n; // 2 complete periods
      const expectedClaimableRewards = rewardRate * expectedClaimableBlocks;

      let claimableRewards = await stargateDelegation.claimableRewards(tokenId);
      expect(claimableRewards).to.equal(expectedClaimableRewards);

      // Now set rewards accumulation to end in the middle of the current (incomplete) 3rd period
      let currentBlock = await stargateDelegation.clock();
      const rewardsEndBlock = currentBlock + 4n; // add 4 blocks buffer

      // rewards will stop 3 blocks from now
      tx = await stargateDelegation.setRewardsAccumulationEndBlock(rewardsEndBlock);
      await tx.wait();
      // user is now 6 blocks into the 3rd period

      // accumulate rewards for 2 blocks
      await mineBlocks(2);
      // user is now 8 blocks into the 3rd period

      // User will early exit delegation 3 blocks before the rewards end block
      await expect(stargateDelegation.requestDelegationExit(tokenId)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );
      // user is now 9 blocks into the 3rd period

      // Verify delegation is now inactive
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;

      await mineBlocks(5);

      // Verify we're past the rewards end block
      currentBlock = await stargateDelegation.clock();
      expect(currentBlock).to.be.gt(rewardsEndBlock);

      // At this point, claimable rewards should be for 2 full complete periods
      // and another partial period of 8 blocks (since the stargate program ended before he could complete it)
      const expectedFinalClaimableRewards = rewardRate * (delegationPeriod * 2n + 9n);
      claimableRewards = await stargateDelegation.claimableRewards(tokenId);
      expect(claimableRewards).to.equal(expectedFinalClaimableRewards);

      // Accumulated rewards should be capped at the rewards end block
      const accumulatedRewards = await stargateDelegation.accumulatedRewards(tokenId);
      const expectedAccumulatedBlocks = rewardsEndBlock - rewardsAccumulationStartBlock;
      const expectedAccumulatedRewards = rewardRate * expectedAccumulatedBlocks;
      expect(accumulatedRewards).to.equal(expectedAccumulatedRewards);

      // Verify user can claim these rewards
      const userBalanceBefore = await mockedVthoToken.balanceOf(deployer.address);

      await expect(stargateDelegation.claimRewards(tokenId))
        .to.emit(stargateDelegation, "DelegationRewardsClaimed")
        .withArgs(tokenId, expectedFinalClaimableRewards, deployer.address, deployer.address);

      const userBalanceAfter = await mockedVthoToken.balanceOf(deployer.address);
      expect(userBalanceAfter - userBalanceBefore).to.equal(expectedFinalClaimableRewards);

      // After claiming, no more rewards should be available
      expect(await stargateDelegation.claimableRewards(tokenId)).to.equal(0);
      expect(await stargateDelegation.accumulatedRewards(tokenId)).to.equal(0);

      // Mine more blocks to verify no additional rewards accumulate
      await mineBlocks(10);
      expect(await stargateDelegation.claimableRewards(tokenId)).to.equal(0);
      expect(await stargateDelegation.accumulatedRewards(tokenId)).to.equal(0);
    });
  });
});
