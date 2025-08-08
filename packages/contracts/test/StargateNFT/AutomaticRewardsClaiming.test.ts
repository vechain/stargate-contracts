import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts } from "../helpers/deploy";
import { ethers, expect } from "hardhat";
import { mineBlocks } from "../helpers/common";
import { MyERC20, StargateDelegation, StargateNFT } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("shard13: StargateNFT Rewards Auto Claiming", () => {
  let stargateNFTContract: StargateNFT;
  let otherAccounts: HardhatEthersSigner[];
  let mockedVthoToken: MyERC20;
  let stargateDelegationContract: StargateDelegation;

  async function setupTestEnvironment({
    delegationPeriodDuration = 3,
    maturityBlocks = 3,
    vetAmountRequiredToStake = ethers.parseEther("1"),
  }: {
    delegationPeriodDuration?: number;
    maturityBlocks?: number;
    vetAmountRequiredToStake?: bigint;
  }) {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = delegationPeriodDuration;
    config.TOKEN_LEVELS[0].level.maturityBlocks = maturityBlocks;
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = vetAmountRequiredToStake;
    const contracts = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });
    stargateNFTContract = contracts.stargateNFTContract;
    otherAccounts = contracts.otherAccounts;
    mockedVthoToken = contracts.mockedVthoToken;
    stargateDelegationContract = contracts.stargateDelegationContract;
    return config;
  }

  describe("On Transfer", () => {
    it("should automatically claim base rewards (VET generated VTHO) when NFT is transferred and send them to the previous owner", async () => {
      await setupTestEnvironment({});
      const originalOwner = otherAccounts[0];
      const newOwner = otherAccounts[1];

      // Step 1: User stakes and mints an NFT
      await stargateNFTContract.connect(originalOwner).stake(1, {
        value: ethers.parseEther("1"),
      });

      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Verify NFT is owned by original owner
      expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(originalOwner.address);

      // Step 2: Mint VTHO to the contract to simulate VET generated VTHO rewards
      await mockedVthoToken.mint(stargateNFTContract.target, ethers.parseEther("1000000"));

      // Step 3: Let some time pass to accumulate rewards
      await mineBlocks(5); // Wait for 5 blocks to accumulate rewards

      // Step 4: Verify that rewards have accumulated
      const rewardsBeforeTransfer = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      expect(rewardsBeforeTransfer).to.be.gt(0);

      // Get the timestamp when user staked for reward calculation
      const timestampWhenUserStaked =
        await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId);
      expect(timestampWhenUserStaked).to.not.equal(0);

      // Step 5: Check initial VTHO balances
      const originalOwnerBalanceBeforeTransfer = await mockedVthoToken.balanceOf(
        originalOwner.address
      );
      const newOwnerBalanceBeforeTransfer = await mockedVthoToken.balanceOf(newOwner.address);
      expect(originalOwnerBalanceBeforeTransfer).to.equal(0);
      expect(newOwnerBalanceBeforeTransfer).to.equal(0);

      // Step 6: Transfer the NFT to the new owner
      const transferTx = await stargateNFTContract
        .connect(originalOwner)
        .transferFrom(originalOwner.address, newOwner.address, tokenId);
      await transferTx.wait();

      const transferTxBlock = await transferTx.getBlock();
      if (!transferTxBlock) {
        throw new Error("Transfer transaction block not found");
      }

      // Step 7: Verify that the NFT was transferred
      expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(newOwner.address);

      // Step 8: Calculate expected rewards based on the transfer transaction timestamp
      const expectedRewards = await stargateNFTContract.calculateVTHO(
        timestampWhenUserStaked,
        BigInt(transferTxBlock.timestamp),
        ethers.parseEther("1")
      );

      // Step 9: Verify that the original owner received the automatically claimed rewards
      const originalOwnerBalanceAfterTransfer = await mockedVthoToken.balanceOf(
        originalOwner.address
      );
      expect(originalOwnerBalanceAfterTransfer).to.equal(expectedRewards);

      // Step 10: Verify that the new owner did not receive any rewards from the transfer
      const newOwnerBalanceAfterTransfer = await mockedVthoToken.balanceOf(newOwner.address);
      expect(newOwnerBalanceAfterTransfer).to.equal(0);

      // Step 11: Verify that claimable rewards are now zero (since they were automatically claimed)
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.equal(0);

      // Step 12: Verify that the last claim timestamp was updated to the transfer timestamp
      expect(await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId)).to.equal(
        transferTxBlock.timestamp
      );

      // Step 13: Wait for more blocks and verify new rewards accumulate for the new owner
      await mineBlocks(3);
      const newRewardsAfterTransfer = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      expect(newRewardsAfterTransfer).to.be.gt(0);

      // Step 14: Verify the new owner can claim these new rewards
      const claimTx = await stargateNFTContract.connect(newOwner).claimVetGeneratedVtho(tokenId);
      await claimTx.wait();

      const claimTxBlock = await claimTx.getBlock();
      if (!claimTxBlock) {
        throw new Error("Claim transaction block not found");
      }

      const expectedNewOwnerRewards = await stargateNFTContract.calculateVTHO(
        BigInt(transferTxBlock.timestamp),
        BigInt(claimTxBlock.timestamp),
        ethers.parseEther("1")
      );

      const newOwnerFinalBalance = await mockedVthoToken.balanceOf(newOwner.address);
      expect(newOwnerFinalBalance).to.equal(expectedNewOwnerRewards);

      // Step 15: Verify original owner's balance remained unchanged after new owner's claim
      expect(await mockedVthoToken.balanceOf(originalOwner.address)).to.equal(expectedRewards);
    });

    it("should handle multiple transfers with automatic reward claiming", async () => {
      await setupTestEnvironment({});

      const owner1 = otherAccounts[0];
      const owner2 = otherAccounts[1];
      const owner3 = otherAccounts[2];

      // Step 1: Owner1 stakes and mints an NFT
      await stargateNFTContract.connect(owner1).stake(1, {
        value: ethers.parseEther("1"),
      });

      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Wait for maturity period and mint VTHO
      const currentBlock = await stargateNFTContract.clock();
      const maturityPeriodEndBlock = await stargateNFTContract.maturityPeriodEndBlock(tokenId);
      await mineBlocks(Number(maturityPeriodEndBlock - currentBlock));
      await mockedVthoToken.mint(stargateNFTContract.target, ethers.parseEther("1000000"));

      // Step 2: Accumulate rewards for owner1      
      await mineBlocks(3);
      const timestamp1 = await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId);

      // Step 3: Transfer from owner1 to owner2
      const transfer1Tx = await stargateNFTContract
        .connect(owner1)
        .transferFrom(owner1.address, owner2.address, tokenId);
      await transfer1Tx.wait();
      const transfer1Block = await transfer1Tx.getBlock();
      if (!transfer1Block) throw new Error("Transfer 1 block not found");

      // Verify owner1 got rewards from automatic claiming
      const expectedRewards1 = await stargateNFTContract.calculateVTHO(
        timestamp1,
        BigInt(transfer1Block.timestamp),
        ethers.parseEther("1")
      );
      expect(await mockedVthoToken.balanceOf(owner1.address)).to.equal(expectedRewards1);

      // Step 4: Owner2 accumulates rewards
      await mineBlocks(3);

      // Step 5: Transfer from owner2 to owner3
      const transfer2Tx = await stargateNFTContract
        .connect(owner2)
        .transferFrom(owner2.address, owner3.address, tokenId);
      await transfer2Tx.wait();
      const transfer2Block = await transfer2Tx.getBlock();
      if (!transfer2Block) throw new Error("Transfer 2 block not found");

      // Verify owner2 got rewards from automatic claiming
      const expectedRewards2 = await stargateNFTContract.calculateVTHO(
        BigInt(transfer1Block.timestamp),
        BigInt(transfer2Block.timestamp),
        ethers.parseEther("1")
      );
      expect(await mockedVthoToken.balanceOf(owner2.address)).to.equal(expectedRewards2);

      // Step 6: Owner3 accumulates and manually claims rewards
      await mineBlocks(3);
      await stargateNFTContract.connect(owner3).claimVetGeneratedVtho(tokenId);

      // Verify all owners have appropriate rewards
      expect(await mockedVthoToken.balanceOf(owner1.address)).to.equal(expectedRewards1);
      expect(await mockedVthoToken.balanceOf(owner2.address)).to.equal(expectedRewards2);
      expect(await mockedVthoToken.balanceOf(owner3.address)).to.be.gt(0);
    });

    it("should handle safeTransferFrom with automatic reward claiming", async () => {
      await setupTestEnvironment({});

      const originalOwner = otherAccounts[0];
      const newOwner = otherAccounts[1];

      // Setup: stake, wait for maturity, and accumulate rewards
      await stargateNFTContract.connect(originalOwner).stake(1, {
        value: ethers.parseEther("1"),
      });

      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      const currentBlock = await stargateNFTContract.clock();
      const maturityPeriodEndBlock = await stargateNFTContract.maturityPeriodEndBlock(tokenId);
      await mineBlocks(Number(maturityPeriodEndBlock - currentBlock));
      await mockedVthoToken.mint(stargateNFTContract.target, ethers.parseEther("1000000"));
      await mineBlocks(5);

      // Verify rewards have accumulated
      const rewardsBeforeTransfer = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      expect(rewardsBeforeTransfer).to.be.gt(0);

      const timestampWhenUserStaked =
        await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId);

      // Transfer using safeTransferFrom
      const transferTx = await stargateNFTContract
        .connect(originalOwner)
        ["safeTransferFrom(address,address,uint256)"](
          originalOwner.address,
          newOwner.address,
          tokenId
        );
      await transferTx.wait();

      const transferTxBlock = await transferTx.getBlock();
      if (!transferTxBlock) {
        throw new Error("Transfer transaction block not found");
      }

      // Verify automatic reward claiming worked with safeTransferFrom
      const expectedRewards = await stargateNFTContract.calculateVTHO(
        timestampWhenUserStaked,
        BigInt(transferTxBlock.timestamp),
        ethers.parseEther("1")
      );

      expect(await mockedVthoToken.balanceOf(originalOwner.address)).to.equal(expectedRewards);
      expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(newOwner.address);
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.equal(0);
    });

    it("should automatically claim both base and delegation rewards when NFT is transferred after delegation exit", async () => {
      const config = await setupTestEnvironment({
        maturityBlocks: 0, // No maturity period for easier testing
      });

      const originalOwner = otherAccounts[0];
      const newOwner = otherAccounts[1];

      // Step 1: Mint VTHO to both contracts for rewards
      await mockedVthoToken.mint(stargateNFTContract.target, ethers.parseEther("1000000"));
      await mockedVthoToken.mint(stargateDelegationContract.target, ethers.parseEther("1000000"));

      // Step 2: User stakes and delegates in one transaction (and only for one delegation cycle)
      await stargateNFTContract.connect(originalOwner).stakeAndDelegate(1, false, {
        value: ethers.parseEther("1"),
      });

      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Step 3: Wait for maturity period and delegation period to accumulate rewards
      await mineBlocks(config.TOKEN_LEVELS[0].level.maturityBlocks);
      await mineBlocks(config.DELEGATION_PERIOD_DURATION);

      // Step 4: Verify both types of rewards have accumulated
      const baseRewardsBeforeExit = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      const delegationRewardsBeforeExit = await stargateDelegationContract.claimableRewards(
        tokenId
      );

      expect(baseRewardsBeforeExit).to.be.gt(0);
      expect(delegationRewardsBeforeExit).to.be.gt(0);

      // Step 6: Accumulate more base rewards after delegation exit
      await mineBlocks(2);

      // Step 7: Verify delegation is no longer active but rewards are still claimable
      expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.false;
      expect(await stargateDelegationContract.claimableRewards(tokenId)).to.be.gt(0);
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.be.gt(0);

      // Step 8: Get timestamps and initial balances
      const timestampWhenUserStaked =
        await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId);
      const originalOwnerBalanceBeforeTransfer = await mockedVthoToken.balanceOf(
        originalOwner.address
      );
      const newOwnerBalanceBeforeTransfer = await mockedVthoToken.balanceOf(newOwner.address);
      expect(originalOwnerBalanceBeforeTransfer).to.equal(0);
      expect(newOwnerBalanceBeforeTransfer).to.equal(0);

      // Step 9: Transfer the NFT (should automatically claim both types of rewards)
      const transferTx = await stargateNFTContract
        .connect(originalOwner)
        .transferFrom(originalOwner.address, newOwner.address, tokenId);
      await transferTx.wait();

      const transferTxBlock = await transferTx.getBlock();
      if (!transferTxBlock) {
        throw new Error("Transfer transaction block not found");
      }

      // Step 10: Verify that the NFT was transferred
      expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(newOwner.address);

      // Step 11: Calculate expected base rewards
      const expectedBaseRewards = await stargateNFTContract.calculateVTHO(
        timestampWhenUserStaked,
        BigInt(transferTxBlock.timestamp),
        ethers.parseEther("1")
      );

      // Step 12: Verify that the original owner received rewards (both base and delegation combined)
      const originalOwnerBalanceAfterTransfer = await mockedVthoToken.balanceOf(
        originalOwner.address
      );
      expect(originalOwnerBalanceAfterTransfer).to.be.gte(
        expectedBaseRewards + delegationRewardsBeforeExit
      );

      // Step 13: Verify that the new owner did not receive any rewards from the transfer
      const newOwnerBalanceAfterTransfer = await mockedVthoToken.balanceOf(newOwner.address);
      expect(newOwnerBalanceAfterTransfer).to.equal(0);

      // Step 14: Verify that both types of rewards are now zero (since they were automatically claimed)
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.equal(0);
      expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);

      // Step 15: Verify that the last claim timestamp was updated to the transfer timestamp
      expect(await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId)).to.equal(
        transferTxBlock.timestamp
      );
    });
  });

  describe("On Unstake", () => {
    it("should automatically claim base rewards (VET generated VTHO) when NFT is unstaked and send them to the owner", async () => {
      await setupTestEnvironment({});
      const staker = otherAccounts[0];

      // Step 1: User stakes and mints an NFT
      await stargateNFTContract.connect(staker).stake(1, {
        value: ethers.parseEther("1"),
      });

      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Verify NFT is owned by the staker
      expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(staker.address);

      // Step 2: Wait for the maturity period to end so the NFT can be unstaked
      const currentBlock = await stargateNFTContract.clock();
      const maturityPeriodEndBlock = await stargateNFTContract.maturityPeriodEndBlock(tokenId);
      await mineBlocks(Number(maturityPeriodEndBlock - currentBlock));

      // Step 3: Mint VTHO to the contract to simulate VET generated VTHO rewards
      await mockedVthoToken.mint(stargateNFTContract.target, ethers.parseEther("1000000"));

      // Step 4: Let some time pass to accumulate rewards
      await mineBlocks(5);

      // Step 5: Verify that rewards have accumulated
      const rewardsBeforeUnstake = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      expect(rewardsBeforeUnstake).to.be.gt(0);

      // Get the timestamp when user staked for reward calculation
      const timestampWhenUserStaked =
        await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId);
      expect(timestampWhenUserStaked).to.not.equal(0);

      // Step 6: Check initial VTHO and VET balances
      const stakerVthoBalanceBeforeUnstake = await mockedVthoToken.balanceOf(staker.address);
      const stakerVetBalanceBeforeUnstake = await ethers.provider.getBalance(staker.address);
      expect(stakerVthoBalanceBeforeUnstake).to.equal(0);

      // Step 7: Unstake the NFT
      const unstakeTx = await stargateNFTContract.connect(staker).unstake(tokenId);
      await unstakeTx.wait();

      const unstakeTxBlock = await unstakeTx.getBlock();
      if (!unstakeTxBlock) {
        throw new Error("Unstake transaction block not found");
      }

      // Step 8: Verify that the NFT was burned (no longer exists)
      await expect(stargateNFTContract.ownerOf(tokenId)).to.be.revertedWithCustomError(
        stargateNFTContract,
        "ERC721NonexistentToken"
      );

      // Step 9: Calculate expected VTHO rewards based on the unstake transaction timestamp
      const expectedVthoRewards = await stargateNFTContract.calculateVTHO(
        timestampWhenUserStaked,
        BigInt(unstakeTxBlock.timestamp),
        ethers.parseEther("1")
      );

      // Step 10: Verify that the staker received the automatically claimed VTHO rewards
      const stakerVthoBalanceAfterUnstake = await mockedVthoToken.balanceOf(staker.address);
      expect(stakerVthoBalanceAfterUnstake).to.equal(expectedVthoRewards);

      // Step 11: Verify that the staker also received their staked VET back
      const stakerVetBalanceAfterUnstake = await ethers.provider.getBalance(staker.address);
      // Note: We can't do exact balance comparison due to gas costs, but we can verify it increased significantly
      expect(stakerVetBalanceAfterUnstake).to.be.gt(
        stakerVetBalanceBeforeUnstake + ethers.parseEther("0.9")
      );

      // Step 12: Verify that no rewards are claimable
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.equal(0);

      // Step 13: Verify that the last claim timestamp is not set
      expect(await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId)).to.equal(0);
    });

    it("should automatically claim both base and delegation rewards when NFT is unstaked after delegation exit", async () => {
      const config = await setupTestEnvironment({
        maturityBlocks: 0, // No maturity period for easier testing
      });

      const staker = otherAccounts[0];

      // Step 1: Mint VTHO to both contracts for rewards
      await mockedVthoToken.mint(stargateNFTContract.target, ethers.parseEther("1000000"));
      await mockedVthoToken.mint(stargateDelegationContract.target, ethers.parseEther("1000000"));

      // Step 2: User stakes and delegates in one transaction
      await stargateNFTContract.connect(staker).stakeAndDelegate(1, false, {
        value: ethers.parseEther("1"),
      });

      const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

      // Step 3: Wait for delegation period to accumulate rewards
      await mineBlocks(config.DELEGATION_PERIOD_DURATION);

      // Step 4: Verify both types of rewards have accumulated
      const baseRewardsBeforeExit = await stargateNFTContract.claimableVetGeneratedVtho(tokenId);
      const delegationRewardsBeforeExit = await stargateDelegationContract.claimableRewards(
        tokenId
      );
      await stargateDelegationContract.claimableRewards(tokenId);

      expect(baseRewardsBeforeExit).to.be.gt(0);
      expect(delegationRewardsBeforeExit).to.be.gt(0);

      // Step 5: Accumulate more base rewards after delegation exit
      await mineBlocks(2);

      // Step 6: Verify delegation is no longer active but rewards are still claimable
      expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.false;
      expect(await stargateDelegationContract.claimableRewards(tokenId)).to.be.gt(0);
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.be.gt(0);

      // Step 7: Get timestamps and initial balances
      const timestampWhenUserStaked =
        await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId);
      const stakerVthoBalanceBeforeUnstake = await mockedVthoToken.balanceOf(staker.address);
      const stakerVetBalanceBeforeUnstake = await ethers.provider.getBalance(staker.address);
      expect(stakerVthoBalanceBeforeUnstake).to.equal(0);

      // Step 8: Unstake the NFT (should automatically claim both types of rewards)
      const unstakeTx = await stargateNFTContract.connect(staker).unstake(tokenId);
      await unstakeTx.wait();

      const unstakeTxBlock = await unstakeTx.getBlock();
      if (!unstakeTxBlock) {
        throw new Error("Unstake transaction block not found");
      }

      // Step 9: Verify that the NFT was burned (no longer exists)
      await expect(stargateNFTContract.ownerOf(tokenId)).to.be.revertedWithCustomError(
        stargateNFTContract,
        "ERC721NonexistentToken"
      );

      // Step 10: Calculate expected base rewards
      const expectedBaseRewards = await stargateNFTContract.calculateVTHO(
        timestampWhenUserStaked,
        BigInt(unstakeTxBlock.timestamp),
        ethers.parseEther("1")
      );

      // Step 11: Verify that the staker received rewards (both base and delegation combined)
      const stakerVthoBalanceAfterUnstake = await mockedVthoToken.balanceOf(staker.address);
      expect(stakerVthoBalanceAfterUnstake).to.be.gte(
        expectedBaseRewards + delegationRewardsBeforeExit
      );

      // Step 13: Verify that the staker also received their staked VET back
      const stakerVetBalanceAfterUnstake = await ethers.provider.getBalance(staker.address);
      // Note: We can't do exact balance comparison due to gas costs, but we can verify it increased significantly
      expect(stakerVetBalanceAfterUnstake).to.be.gt(
        stakerVetBalanceBeforeUnstake + ethers.parseEther("0.9")
      );

      // Step 14: Verify that no rewards are claimable
      expect(await stargateNFTContract.claimableVetGeneratedVtho(tokenId)).to.equal(0);

      expect(await stargateDelegationContract.claimableRewards(tokenId)).to.equal(0);

      // Step 15: Verify that the last claim timestamp is not set
      expect(await stargateNFTContract.getLastVetGeneratedVthoClaimTimestamp(tokenId)).to.equal(0);
    });
  });
});
