import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts } from "../helpers/deploy";
import { ethers, expect } from "hardhat";
import { mineBlocks } from "../helpers/common";
import {
  MaliciousReentrancyContract,
  MyERC20,
  StargateDelegation,
  StargateNFT,
} from "../../typechain-types";
import { TransactionResponse } from "ethers/lib.commonjs/providers";
  import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

/**
 * StargateNFT Reentrancy Reward Theft Security Tests
 *
 * These tests focus specifically on whether malicious actors can steal or double-claim
 * rewards through reentrancy attacks during NFT transfers. Key scenarios tested:
 *
 * 1. Can attackers double claim rewards with a transfer in the ERC721Received callback?
 * 2. Can attackers double claim rewards with a claimRewards in the ERC721Received callback?
 * 3. Can attackers double claim rewards with a unstake in the ERC721Received callback?
 */
describe("shard10000: Reentrancy Reward Theft Security Tests", () => {
  let maliciousContract: MaliciousReentrancyContract;
  let stargateNFTContract: StargateNFT;
  let stargateDelegationContract: StargateDelegation;
  let mockedVthoToken: MyERC20;
  let deployer: HardhatEthersSigner;
  let otherAccounts: HardhatEthersSigner[];
  let tx: TransactionResponse;

  beforeEach(async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 7; // 7 blocks
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for easier testing
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");
    config.TOKEN_LEVELS[1].level.maturityBlocks = 0;

    const contracts = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    stargateNFTContract = contracts.stargateNFTContract;
    stargateDelegationContract = contracts.stargateDelegationContract;
    mockedVthoToken = contracts.mockedVthoToken;
    deployer = contracts.deployer;
    otherAccounts = contracts.otherAccounts;

    // Deploy malicious contract
    const MaliciousReentrancyContractFactory = await ethers.getContractFactory(
      "MaliciousReentrancyContract"
    );
    maliciousContract = await MaliciousReentrancyContractFactory.deploy(
      await stargateNFTContract.getAddress(),
      await stargateDelegationContract.getAddress(),
      await mockedVthoToken.getAddress()
    );

    // Fund malicious contract with ETH for potential staking attacks
    tx = await deployer.sendTransaction({
      to: await maliciousContract.getAddress(),
      value: ethers.parseEther("10"),
    });
    await tx.wait();

    // Fund both contracts with VTHO for rewards payout
    tx = await mockedVthoToken.mint(
      await stargateNFTContract.getAddress(),
      ethers.parseEther("1000000")
    );
    await tx.wait();

    tx = await mockedVthoToken.mint(
      await stargateDelegationContract.getAddress(),
      ethers.parseEther("1000000")
    );
    await tx.wait();
  });

  describe("Claim Callback Reward Theft Attack", () => {
    /**
     * Scnerio: User stakes NFT, accumulates base rewards, transfers NFT to a malicious contract
     * that has a callback function to claim rewards again.
     * Expected behaviour: User should get the rewards on the transfer, then the malicious contract
     * should get any other rewards accumulated in the seconds after the first claim and the second
     * claim in the callback (because base rewards are based on timestamps).
     */
    it("should prevent base reward reward theft during NFT transfer with claim callback", async () => {
      // Create NFT with accumulated base rewards (no delegation)
      tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });

      let receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      // Retrieve the block where the transaction was included
      let block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");
      let stakeBlockTimestamp = block.timestamp;
      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Wait for base rewards to accumulate
      await mineBlocks(20);

      const baseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      expect(baseRewards).to.be.gt(0);
      expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.false; // Unlocked

      // Enable attack: try to claim base rewards during onERC721Received
      tx = await maliciousContract.enableAttack(2, otherAccounts[1].address);
      await tx.wait();

      const maliciousAddress = await maliciousContract.getAddress();

      // Get initial balances
      const initialMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const initialDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);

      // Transfer NFT - this should trigger automatic reward claim for original owner
      tx = await stargateNFTContract["safeTransferFrom(address,address,uint256)"](
        deployer.address,
        maliciousAddress,
        tokenId
      );
      receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");

      // Retrieve the block where the transaction was included
      block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");
      let transferBlockTimestamp = block.timestamp;
      let expectedRewardsAtTimestamp = await stargateNFTContract.calculateVTHO(
        stakeBlockTimestamp,
        transferBlockTimestamp,
        ethers.parseEther("1")
      );

      tx = await maliciousContract.disableAttack();
      await tx.wait();

      // Verify attack was attempted but failed to steal rewards
      expect(await maliciousContract.attackCount()).to.be.gt(0);

      const finalMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const finalDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);

      // CRITICAL: Attacker should get NO rewards
      expect(finalMaliciousBalance).to.equal(initialMaliciousBalance);

      // CRITICAL: Original owner should get all rewards
      const rewardsClaimed = finalDeployerBalance - initialDeployerBalance;
      expect(rewardsClaimed).to.equal(expectedRewardsAtTimestamp);

      // No rewards left to claim (attacker can't claim them later)
      // In solo mode, whenever a tx is sent a block is minted the timestamp increases 1 day
      // in hardhat only 1 second is added, so we must use the higher value
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.be.lte(
        ethers.parseEther("0.000018")
      );
    });

    /**
     * Scnerio: User stakes NFT, delegates it, accumulates base and delegation rewards,
     * transfers NFT to a malicious contract that has a callback function to claim rewards (both) again.
     * Expected behaviour: User should get the rewards on the transfer, then the malicious contract
     * should get any other base rewards accumulated in the seconds after the first claim and the second
     * claim in the callback (because base rewards are based on timestamps). The malicious contract should
     * not get any delegation rewards and no extra rewards should be claimed.
     */
    it("should prevent theft of delegation rewards from unlocked NFT", async () => {
      // Create NFT and delegate it for one cycle to accumulate delegation rewards
      tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
      let receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      // Retrieve the block where the transaction was included
      let block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");
      let stakeBlockTimestamp = block.timestamp;
      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Single cycle delegation (not forever)
      tx = await stargateDelegationContract.delegate(tokenId, false);
      await tx.wait();

      await mineBlocks(8); // Wait for delegation cycle to complete

      // Verify NFT is unlocked with delegation rewards
      expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.false;

      const baseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      const delegationRewards = await stargateDelegationContract.claimableRewards(tokenId);

      expect(baseRewards).to.be.gt(0);
      expect(delegationRewards).to.be.gt(0);

      // Enable attack: try to steal BOTH types of rewards
      tx = await maliciousContract.enableAttack(2, otherAccounts[1].address);
      await tx.wait();

      const maliciousAddress = await maliciousContract.getAddress();

      const initialMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const initialDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);

      // Transfer NFT with both reward types available
      tx = await stargateNFTContract["safeTransferFrom(address,address,uint256)"](
        deployer.address,
        maliciousAddress,
        tokenId
      );
      receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");

      // Retrieve the block where the transaction was included
      block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");
      let transferBlockTimestamp = block.timestamp;
      let expectedBaseRewardsAtTimestamp = await stargateNFTContract.calculateVTHO(
        stakeBlockTimestamp,
        transferBlockTimestamp,
        ethers.parseEther("1")
      );
      tx = await maliciousContract.disableAttack();
      await tx.wait();
      // Verify attack was attempted but failed
      expect(await maliciousContract.attackCount()).to.be.gt(0);

      const finalMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const finalDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);

      // CRITICAL: Attacker steals NO rewards
      expect(finalMaliciousBalance).to.equal(initialMaliciousBalance);

      // CRITICAL: Original owner gets BOTH reward types
      const totalRewardsClaimed = finalDeployerBalance - initialDeployerBalance;
      expect(totalRewardsClaimed).to.equal(expectedBaseRewardsAtTimestamp + delegationRewards);

      // No rewards left for attacker to claim later
      // In solo mode, whenever a tx is sent a block is minted the timestamp increases 1 day
      // in hardhat only 1 second is added, so we must use the higher value
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.be.lte(
        ethers.parseEther("0.000018")
      );
      expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);
    });

    it("should prevent reward theft through multiple attack vectors simultaneously", async () => {
      // Create multiple NFTs with different reward profiles for comprehensive testing
      const tokenIds = [];

      // NFT 1: Only base rewards (never delegated)
      tx = await stargateNFTContract.stake(1, {
        value: ethers.parseEther("1"),
        gasLimit: 10_000_000,
      });
      await tx.wait();
      tokenIds.push(Number(await stargateNFTContract.getCurrentTokenId()));
      await mineBlocks(1);

      // NFT 2: With delegation rewards (single cycle)
      tx = await stargateNFTContract.stake(1, {
        value: ethers.parseEther("1"),
        gasLimit: 10_000_000,
      });
      await tx.wait();
      tokenIds.push(Number(await stargateNFTContract.getCurrentTokenId()));
      tx = await stargateDelegationContract.delegate(tokenIds[1], false);
      await tx.wait();
      // NFT 3: With delegation rewards (single cycle)
      tx = await stargateNFTContract.stake(1, {
        value: ethers.parseEther("1"),
        gasLimit: 10_000_000,
      });
      await tx.wait();
      tokenIds.push(Number(await stargateNFTContract.getCurrentTokenId()));
      tx = await stargateDelegationContract.delegate(tokenIds[2], false);
      await tx.wait();

      // Let everything accumulate rewards
      await mineBlocks(10);

      // Calculate total expected rewards across all NFTs
      let totalExpectedRewards = 0n;
      for (const tokenId of tokenIds) {
        const baseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
        const delegationRewards = await stargateDelegationContract.claimableRewards(tokenId);
        totalExpectedRewards += baseRewards + delegationRewards;
      }

      expect(totalExpectedRewards).to.be.gt(0);

      // Enable comprehensive attack: try to steal rewards during transfers
      tx = await maliciousContract.enableAttack(2, otherAccounts[1].address);
      await tx.wait();

      const maliciousAddress = await maliciousContract.getAddress();

      const initialMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const initialDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);

      // Rapid-fire transfers to trigger maximum attack attempts
      for (const tokenId of tokenIds) {
        tx = await stargateNFTContract["safeTransferFrom(address,address,uint256)"](
          deployer.address,
          maliciousAddress,
          tokenId
        );
        await tx.wait();
      }

      tx = await maliciousContract.disableAttack();
      await tx.wait();

      // Verify comprehensive attacks were attempted (limited by malicious contract's maxAttackAttempts = 2)
      expect(await maliciousContract.attackCount()).to.equal(2);

      const finalMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const finalDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);

      // CRITICAL: Even maximum coordinated attack fails to steal any rewards
      expect(finalMaliciousBalance).to.equal(initialMaliciousBalance);

      // CRITICAL: All rewards go to original owner, no reward theft occurs
      const actualRewardsClaimed = finalDeployerBalance - initialDeployerBalance;
      expect(actualRewardsClaimed).to.be.closeTo(totalExpectedRewards, ethers.parseEther("0.001"));

      // Verify no rewards remain claimable (attacker can't claim them later)
      for (const tokenId of tokenIds) {
        // In solo mode, whenever a tx is sent a block is minted the timestamp increases 1 day
        // in hardhat only 1 second is added, so we must use the higher value
        expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.be.lte(
          ethers.parseEther("0.000054")
        );
        expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);
      }
    });
  });

  describe("Unstake Callback Reward Theft Attack", () => {
    /**
     * Scnerio: User stakes NFT, delegates it, accumulates base and delegation rewards. Then exits delegation and
     * transfers NFT to a malicious contract that has a callback function to unstake the NFT.
     * This is not a malicious attack per se, but we want to make sure there are no extra rewards claimed
     * when the NFT is unstaked.
     * Expected behaviour: User should get the rewards on the transfer, then the malicious contract
     * should get any other base rewards accumulated in the seconds after the first claim and the second
     * claim in the callback (because base rewards are based on timestamps). The malicious contract should
     * not get any delegation rewards and no extra rewards should be claimed. The NFT should be unstaked
     * and the user should get the rewards. And the malicious contract should receive the VET used as collateral
     * of the NFT since he is the new owner.
     */
    // TODO this test fails on solo because the onERC721Received callback is not called
    // on the malicious contract, so the attack the nft is not unstaked.
    it.skip("should prevent reward theft during unstake callback", async () => {
      // Create NFT and delegate it for one cycle to accumulate delegation rewards
      tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
      let receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      // Retrieve the block where the transaction was included
      let block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");
      let stakeBlockTimestamp = block.timestamp;
      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Single cycle delegation (not forever)
      tx = await stargateDelegationContract.delegate(tokenId, false);
      await tx.wait();
      await mineBlocks(8); // Wait for delegation cycle to complete

      // Verify NFT is unlocked with delegation rewards
      expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.false;

      const baseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      const delegationRewards = await stargateDelegationContract.claimableRewards(tokenId);

      expect(baseRewards).to.be.gt(0);
      expect(delegationRewards).to.be.gt(0);

      // Enable attack: try to unstake during onERC721Received
      tx = await maliciousContract.enableAttack(3, otherAccounts[1].address);
      await tx.wait();

      const maliciousAddress = await maliciousContract.getAddress();

      const initialMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const initialDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);
      const initialDeployerEthBalance = await ethers.provider.getBalance(deployer.address);
      const initialMaliciousEthBalance = await ethers.provider.getBalance(maliciousAddress);

      // Transfer NFT with both reward types available
      tx = await stargateNFTContract["safeTransferFrom(address,address,uint256)"](
        deployer.address,
        maliciousAddress,
        tokenId
      );
      receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      const txCost = receipt.gasUsed * receipt.gasPrice;

      // Retrieve the block where the transaction was included
      block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");
      let transferBlockTimestamp = block.timestamp;
      let expectedBaseRewardsAtTimestamp = await stargateNFTContract.calculateVTHO(
        stakeBlockTimestamp,
        transferBlockTimestamp,
        ethers.parseEther("1")
      );

      // Verify attack was attempted but failed
      expect(await maliciousContract.attackCount()).to.be.gt(0);

      const finalMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const finalDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);
      const finalDeployerEthBalance = await ethers.provider.getBalance(deployer.address);
      const finalMaliciousEthBalance = await ethers.provider.getBalance(maliciousAddress);
      // CRITICAL: Attacker steals NO rewards
      expect(finalMaliciousBalance).to.equal(initialMaliciousBalance);

      // CRITICAL: Original owner gets BOTH reward types
      const totalRewardsClaimed = finalDeployerBalance - initialDeployerBalance;
      expect(totalRewardsClaimed).to.equal(expectedBaseRewardsAtTimestamp + delegationRewards);
      // NFT should be successfully unstaked
      await expect(stargateNFTContract.ownerOf(tokenId))
        .to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken")
        .withArgs(tokenId);

      // Previous owner should not receive back any ETH used to stake the NFT
      expect(finalDeployerEthBalance).to.equal(initialDeployerEthBalance - BigInt(txCost));
      // The new owner (the malicious contract) should receive the ETH used to stake the NFT
      // (since he is the new owner)
      expect(finalMaliciousEthBalance).to.equal(
        initialMaliciousEthBalance + ethers.parseEther("1")
      );

      // No rewards left for attacker to claim later
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.equal(0);
      expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);

      tx = await maliciousContract.disableAttack();
      await tx.wait();
    });
  });

  describe("Transfer Callback Reward Theft Attack", () => {
    /**
     * Scnerio: User stakes NFT, accumulates base rewards and delegation rewards, transfers NFT to a malicious
     * contract that has a callback function to transfer the NFT again with the intent to claim the same rewards twice.
     * Expected behaviour: User should get the rewards on the transfer, then the malicious contract
     * should get any other rewards accumulated in the seconds after the first claim and the second
     * claim in the callback (because base rewards are based on timestamps).
     * But same rewards should not be claimed twice.
     * Also the the target receipient should own the NFT. And should have 0 rewards claimed.
     */
    it("should prevent reward theft during transfer callback", async () => {
      // Create NFT and delegate it for one cycle to accumulate delegation rewards
      let tx = await stargateNFTContract.stake(1, { value: ethers.parseEther("1") });
      let receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      // Retrieve the block where the transaction was included
      let block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");
      let stakeBlockTimestamp = block.timestamp;
      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Single cycle delegation (not forever)
      await stargateDelegationContract.delegate(tokenId, false);
      await mineBlocks(8); // Wait for delegation cycle to complete

      // Verify NFT is unlocked with delegation rewards
      expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.false;

      const baseRewards = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      const delegationRewards = await stargateDelegationContract.claimableRewards(tokenId);

      expect(baseRewards).to.be.gt(0);
      expect(delegationRewards).to.be.gt(0);

      // Enable attack: try to transfer during onERC721Received
      await maliciousContract.enableAttack(1, otherAccounts[1].address);
      const maliciousAddress = await maliciousContract.getAddress();

      const initialMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const initialDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);
      const initialTargetReceiverBalance = await mockedVthoToken.balanceOf(
        otherAccounts[1].address
      );

      // Transfer NFT with both reward types available
      tx = await stargateNFTContract["safeTransferFrom(address,address,uint256)"](
        deployer.address,
        maliciousAddress,
        tokenId
      );
      receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");
      const txCost = receipt.gasUsed * receipt.gasPrice;

      // Retrieve the block where the transaction was included
      block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");
      let transferBlockTimestamp = block.timestamp;
      let expectedBaseRewardsAtTimestamp = await stargateNFTContract.calculateVTHO(
        stakeBlockTimestamp,
        transferBlockTimestamp,
        ethers.parseEther("1")
      );

      const finalMaliciousBalance = await mockedVthoToken.balanceOf(maliciousAddress);
      const finalDeployerBalance = await mockedVthoToken.balanceOf(deployer.address);
      const finalTargetReceiverBalance = await mockedVthoToken.balanceOf(otherAccounts[1].address);

      // CRITICAL: Attacker steals NO rewards
      expect(finalMaliciousBalance).to.equal(initialMaliciousBalance);

      // CRITICAL: Original owner gets BOTH reward types
      const totalRewardsClaimed = finalDeployerBalance - initialDeployerBalance;
      expect(totalRewardsClaimed).to.equal(expectedBaseRewardsAtTimestamp + delegationRewards);

      // Target receiver should not have any rewards claimed
      expect(finalTargetReceiverBalance).to.equal(initialTargetReceiverBalance);

      await maliciousContract.disableAttack();
    });
  });
});
