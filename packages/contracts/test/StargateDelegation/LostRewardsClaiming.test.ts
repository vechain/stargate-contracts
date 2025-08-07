import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import * as fs from "fs";
import * as path from "path";
import {
  MyERC20,
  StargateDelegation,
  StargateDelegationV1,
  StargateNFT,
} from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { getOrDeployContracts, mineBlocks } from "../helpers";
import { expect } from "chai";
import { deployProxy, upgradeProxy } from "../../scripts/helpers";
import { ContractsConfig } from "@repo/config/contracts";
import { getConfig } from "@repo/config";

describe("shard106: StargateDelegation Lost Rewards", () => {
  describe("General", () => {
    const config = createLocalConfig();

    let deployer: HardhatEthersSigner;
    let stargateDelegationContract: StargateDelegation;
    let stargateNFTContract: StargateNFT;
    let mockedVthoToken: MyERC20;
    let otherAccounts: HardhatEthersSigner[];

    before(async () => {
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");
      config.TOKEN_LEVELS[1].level.maturityBlocks = 5; // 5 blocks for maturity
      config.TOKEN_LEVELS[1].level.vetAmountRequiredToStake = ethers.parseEther("10");
      config.CONTRACTS_ADMIN_ADDRESS = (await ethers.getSigners())[0].address;

      const instance = await getOrDeployContracts({
        config,
        forceDeploy: true,
      });

      stargateDelegationContract = instance.stargateDelegationContract;
      deployer = instance.deployer;
      stargateNFTContract = instance.stargateNFTContract;
      mockedVthoToken = instance.mockedVthoToken;
      otherAccounts = instance.otherAccounts;
    });

    it("Admin should be able to add lost rewards", async () => {
      const LOST_REWARDS_WHITELISTER_ROLE =
        await stargateDelegationContract.LOST_REWARDS_WHITELISTER_ROLE();
      expect(
        await stargateDelegationContract.hasRole(LOST_REWARDS_WHITELISTER_ROLE, deployer.address)
      ).to.be.true;

      const user1 = otherAccounts[0];
      // Stake and Delegate for user1
      await stargateNFTContract.connect(user1).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      const user1TokenId = await stargateNFTContract.getCurrentTokenId();

      const lostRewardsOwners = [user1.address];
      const lostRewardsTokenIds = [user1TokenId];
      const lostRewardsAmounts = [ethers.parseEther("1")];

      expect(
        await stargateDelegationContract.claimableLostRewards(
          lostRewardsOwners[0],
          lostRewardsTokenIds[0]
        )
      ).to.equal(0);

      await expect(
        stargateDelegationContract
          .connect(deployer)
          .addLostRewards(lostRewardsOwners, lostRewardsTokenIds, lostRewardsAmounts)
      ).to.not.be.reverted;

      expect(
        await stargateDelegationContract.claimableLostRewards(
          lostRewardsOwners[0],
          lostRewardsTokenIds[0]
        )
      ).to.equal(ethers.parseEther("1"));
    });

    it("admin should be able to remove lost rewards", async () => {
      const LOST_REWARDS_WHITELISTER_ROLE =
        await stargateDelegationContract.LOST_REWARDS_WHITELISTER_ROLE();
      expect(
        await stargateDelegationContract.hasRole(LOST_REWARDS_WHITELISTER_ROLE, deployer.address)
      ).to.be.true;

      const user1 = otherAccounts[0];
      const user1TokenId = await stargateNFTContract.tokenOfOwnerByIndex(user1.address, 0);

      expect(
        await stargateDelegationContract.claimableLostRewards(user1.address, user1TokenId)
      ).to.equal(ethers.parseEther("1"));

      await expect(
        stargateDelegationContract.connect(deployer).removeLostRewards(user1.address, user1TokenId)
      )
        .to.emit(stargateDelegationContract, "LostRewardsRemoved")
        .withArgs(user1.address, user1TokenId, ethers.parseEther("1"));

      expect(
        await stargateDelegationContract.claimableLostRewards(user1.address, user1TokenId)
      ).to.equal(0);
    });

    it("Non admin should not be able to add or remove lost rewards", async () => {
      const user1 = otherAccounts[0];
      const user1TokenId = await stargateNFTContract.tokenOfOwnerByIndex(user1.address, 0);

      const LOST_REWARDS_WHITELISTER_ROLE =
        await stargateDelegationContract.LOST_REWARDS_WHITELISTER_ROLE();
      expect(await stargateDelegationContract.hasRole(LOST_REWARDS_WHITELISTER_ROLE, user1.address))
        .to.be.false;

      expect(
        await stargateDelegationContract.claimableLostRewards(user1.address, user1TokenId)
      ).to.equal(0);

      expect(
        stargateDelegationContract
          .connect(user1)
          .addLostRewards([user1.address], [user1TokenId], [ethers.parseEther("1")])
      ).to.be.reverted;

      expect(
        stargateDelegationContract.connect(user1).removeLostRewards(user1.address, user1TokenId)
      ).to.be.reverted;
    });

    it("user that has lost rewards should see them when checking accumulated and claimable rewards", async () => {
      const user1 = otherAccounts[0];
      const user1TokenId = await stargateNFTContract.tokenOfOwnerByIndex(user1.address, 0);

      const accumulatedRewardsBefore =
        await stargateDelegationContract.accumulatedRewards(user1TokenId);
      const claimableRewardsBefore =
        await stargateDelegationContract.claimableRewards(user1TokenId);

      // add lost rewards (this will increase the accumulated rewards by 1 block)
      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user1.address], [user1TokenId], [lostRewardsAmount]);

      const accumulatedRewardsAfter =
        await stargateDelegationContract.accumulatedRewards(user1TokenId);
      const claimableRewardsAfter = await stargateDelegationContract.claimableLostRewards(
        user1.address,
        user1TokenId
      );

      expect(accumulatedRewardsAfter).to.equal(
        accumulatedRewardsBefore +
          lostRewardsAmount +
          config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock // the rewards accumulated in the latest tx
      );
      expect(claimableRewardsAfter).to.equal(claimableRewardsBefore + lostRewardsAmount);
    });

    it("user with lost rewards should be able to see only the lost rewards amount", async () => {
      const user1 = otherAccounts[0];
      const user1TokenId = await stargateNFTContract.tokenOfOwnerByIndex(user1.address, 0);

      // add lost rewards (this will override whatever amount was set there before)
      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user1.address], [user1TokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user1.address, user1TokenId)
      ).to.equal(lostRewardsAmount);
    });

    it("user with lost rewards should be able to see them when calling claimableRewards even if no delegation rewards are available", async () => {
      const user1 = otherAccounts[0];
      const user1TokenId = await stargateNFTContract.tokenOfOwnerByIndex(user1.address, 0);

      expect(await stargateDelegationContract.isDelegationActive(user1TokenId)).to.be.true;
      const blockWhenDelegationPeriodEnds =
        await stargateDelegationContract.currentDelegationPeriodEndBlock(user1TokenId);
      const clock = await stargateDelegationContract.clock();
      await mineBlocks(Number(blockWhenDelegationPeriodEnds - clock) + 1);

      expect(await stargateDelegationContract.claimableRewards(user1TokenId)).to.be.greaterThan(0);
      await expect(stargateDelegationContract.connect(user1).claimRewards(user1TokenId)).to.not.be
        .reverted;
      expect(await stargateDelegationContract.claimableRewards(user1TokenId)).to.equal(0);

      // add lost rewards (this will override whatever amount was set there before)
      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user1.address], [user1TokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user1.address, user1TokenId)
      ).to.equal(lostRewardsAmount);
    });

    it("user should see lost rewards even if he is not delegating", async () => {
      const user1 = otherAccounts[0];
      const user1TokenId = await stargateNFTContract.tokenOfOwnerByIndex(user1.address, 0);

      expect(await stargateDelegationContract.isDelegationActive(user1TokenId)).to.be.true;

      await stargateDelegationContract.connect(user1).requestDelegationExit(user1TokenId);
      const currentBlock = await stargateDelegationContract.clock();
      const exitBlock = await stargateDelegationContract.getDelegationEndBlock(user1TokenId);
      await mineBlocks(Number(exitBlock - currentBlock) + 1); // +1 to make sure the user has exited

      expect(await stargateDelegationContract.isDelegationActive(user1TokenId)).to.be.false;

      expect(await stargateDelegationContract.claimRewards(user1TokenId)).to.not.be.reverted;

      // add lost rewards (this will override whatever amount was set there before)
      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user1.address], [user1TokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user1.address, user1TokenId)
      ).to.equal(lostRewardsAmount);

      expect(
        await stargateDelegationContract.claimableLostRewards(user1.address, user1TokenId)
      ).to.equal(lostRewardsAmount);

      expect(await stargateDelegationContract.accumulatedRewards(user1TokenId)).to.equal(
        lostRewardsAmount
      );
    });

    it("user without lost rewards should not see differences in his rewards", async () => {
      const user2 = otherAccounts[1];
      // Stake and Delegate for user2
      await stargateNFTContract.connect(user2).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      const user2TokenId = await stargateNFTContract.getCurrentTokenId();

      expect(await stargateDelegationContract.isDelegationActive(user2TokenId)).to.be.true;
      expect(
        await stargateDelegationContract.claimableLostRewards(user2.address, user2TokenId)
      ).to.equal(0);

      const blockWhenDelegationPeriodEnds =
        await stargateDelegationContract.currentDelegationPeriodEndBlock(user2TokenId);
      const clock = await stargateDelegationContract.clock();
      await mineBlocks(Number(blockWhenDelegationPeriodEnds - clock));

      expect(await stargateDelegationContract.claimableRewards(user2TokenId)).to.be.greaterThan(0);
      expect(await stargateDelegationContract.accumulatedRewards(user2TokenId)).to.be.greaterThan(
        0
      );
      expect(
        await stargateDelegationContract.claimableLostRewards(user2.address, user2TokenId)
      ).to.be.equal(0);
      await expect(stargateDelegationContract.connect(user2).claimRewards(user2TokenId)).to.not.be
        .reverted;
      expect(await stargateDelegationContract.claimableRewards(user2TokenId)).to.equal(0);
      const levelOfUser2 = await stargateNFTContract.getTokenLevel(user2TokenId);

      expect(await stargateDelegationContract.accumulatedRewards(user2TokenId)).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[Number(levelOfUser2) - 1].rewardPerBlock
      ); // the rewards accumulated in the latest tx);
    });

    it("user with a burned nft should be able to see his rewards by interacting with the contract", async () => {
      const user3 = otherAccounts[2];
      // Stake and Delegate for user3
      await stargateNFTContract.connect(user3).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      const user3TokenId = await stargateNFTContract.getCurrentTokenId();

      expect(await stargateDelegationContract.isDelegationActive(user3TokenId)).to.be.true;

      await stargateDelegationContract.connect(user3).requestDelegationExit(user3TokenId);

      const exitBlock = await stargateDelegationContract.getDelegationEndBlock(user3TokenId);
      const currentBlock = await stargateDelegationContract.clock();
      await mineBlocks(Number(exitBlock - currentBlock) + 1);

      expect(await stargateDelegationContract.isDelegationActive(user3TokenId)).to.be.false;

      expect(await stargateNFTContract.connect(user3).unstake(user3TokenId)).to.not.be.reverted;

      // add lost rewards (this will override whatever amount was set there before)
      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user3.address], [user3TokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user3.address, user3TokenId)
      ).to.equal(lostRewardsAmount);

      await expect(stargateDelegationContract.accumulatedRewards(user3TokenId)).to.be.reverted;

      expect(await stargateDelegationContract.claimableRewards(user3TokenId)).to.equal(0);
    });

    it("user with lost rewards should be able to claim them when claiming all rewards, together with delegation rewards", async () => {
      const user4 = otherAccounts[3];
      // Stake and Delegate for user4
      await stargateNFTContract.connect(user4).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      const user4TokenId = await stargateNFTContract.getCurrentTokenId();

      expect(await stargateDelegationContract.isDelegationActive(user4TokenId)).to.be.true;

      const cycleEnd =
        await stargateDelegationContract.currentDelegationPeriodEndBlock(user4TokenId);
      const currentBlock = await stargateDelegationContract.clock();
      await mineBlocks(Number(cycleEnd - currentBlock));

      const accumulatedRewards = await stargateDelegationContract.accumulatedRewards(user4TokenId);
      const claimableRewards = await stargateDelegationContract.claimableRewards(user4TokenId);
      expect(claimableRewards).to.equal(accumulatedRewards);

      const expectedAccumulatedRewards =
        Number(config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock) *
        config.DELEGATION_PERIOD_DURATION;
      expect(accumulatedRewards).to.equal(BigInt(expectedAccumulatedRewards));

      // Add lost rewards
      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user4.address], [user4TokenId], [lostRewardsAmount]);
      expect(
        await stargateDelegationContract.claimableLostRewards(user4.address, user4TokenId)
      ).to.equal(lostRewardsAmount);

      const newClaimableRewards = await stargateDelegationContract.claimableRewards(user4TokenId);
      expect(newClaimableRewards).to.equal(claimableRewards + lostRewardsAmount);

      const newAccumulatedRewards =
        await stargateDelegationContract.accumulatedRewards(user4TokenId);
      expect(newAccumulatedRewards).to.equal(
        BigInt(expectedAccumulatedRewards) +
          lostRewardsAmount +
          BigInt(config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock)
      );

      // Debug: let's see what events are actually emitted
      const tx = await stargateDelegationContract.connect(user4).claimRewards(user4TokenId);
      const receipt = await tx.wait();

      if (!receipt) {
        throw new Error("Transaction receipt is null");
      }

      const events = receipt.logs.filter((log) => {
        try {
          return (
            stargateDelegationContract.interface.parseLog(log)?.name === "DelegationRewardsClaimed"
          );
        } catch {
          return false;
        }
      });

      // assert it has both events
      expect(events.length).to.equal(2);

      // assert in one event the rewards is claimableRewards and in the other the lost rewards
      events.forEach((event, index) => {
        const parsed = stargateDelegationContract.interface.parseLog(event);
        if (index === 0) {
          // First event should be delegation rewards
          expect(parsed?.args.rewards).to.equal(claimableRewards);
          expect(parsed?.args.tokenId).to.equal(user4TokenId);
          expect(parsed?.args.claimer).to.equal(user4.address);
          expect(parsed?.args.recipient).to.equal(user4.address);
        } else {
          // Second event should be lost rewards
          expect(parsed?.args.rewards).to.equal(lostRewardsAmount);
          expect(parsed?.args.tokenId).to.equal(user4TokenId);
          expect(parsed?.args.claimer).to.equal(user4.address);
          expect(parsed?.args.recipient).to.equal(user4.address);
        }
      });

      expect(await stargateDelegationContract.claimableRewards(user4TokenId)).to.equal(0);
      expect(await stargateDelegationContract.accumulatedRewards(user4TokenId)).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock * 2n
      );
      expect(
        await stargateDelegationContract.claimableLostRewards(user4.address, user4TokenId)
      ).to.equal(0);
    });

    it("user with lost rewards but no delegation rewards should be able to claim them when claiming all rewards", async () => {
      const user5 = otherAccounts[4];
      // Stake and Delegate for user5
      await stargateNFTContract.connect(user5).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      const user5TokenId = await stargateNFTContract.getCurrentTokenId();
      const stakeBlock = await stargateDelegationContract.clock();

      // add lost rewards
      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user5.address], [user5TokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user5.address, user5TokenId)
      ).to.equal(lostRewardsAmount);
      expect(await stargateDelegationContract.claimableRewards(user5TokenId)).to.equal(
        lostRewardsAmount
      );

      await expect(stargateDelegationContract.connect(user5).claimRewards(user5TokenId))
        .to.emit(stargateDelegationContract, "DelegationRewardsClaimed")
        .withArgs(user5TokenId, lostRewardsAmount, user5.address, user5.address);

      expect(await stargateDelegationContract.claimableRewards(user5TokenId)).to.equal(0);
      expect(await stargateDelegationContract.accumulatedRewards(user5TokenId)).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock *
          ((await stargateDelegationContract.clock()) - stakeBlock)
      );
      expect(
        await stargateDelegationContract.claimableLostRewards(user5.address, user5TokenId)
      ).to.equal(0);
    });

    it("user with lost rewards that do not have active delegation should be able to claim them when claiming all rewards", async () => {
      const user6 = otherAccounts[5];
      // Stake and Delegate for user6
      await stargateNFTContract.connect(user6).stake(1, {
        value: ethers.parseEther("1"),
      });
      const user6TokenId = await stargateNFTContract.getCurrentTokenId();

      expect(await stargateDelegationContract.isDelegationActive(user6TokenId)).to.be.false;

      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user6.address], [user6TokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user6.address, user6TokenId)
      ).to.equal(lostRewardsAmount);
      expect(await stargateDelegationContract.claimableRewards(user6TokenId)).to.equal(
        lostRewardsAmount
      );

      await expect(stargateDelegationContract.connect(user6).claimRewards(user6TokenId))
        .to.emit(stargateDelegationContract, "DelegationRewardsClaimed")
        .withArgs(user6TokenId, lostRewardsAmount, user6.address, user6.address);

      expect(await stargateDelegationContract.claimableRewards(user6TokenId)).to.equal(0);
      expect(await stargateDelegationContract.accumulatedRewards(user6TokenId)).to.equal(0);
      expect(
        await stargateDelegationContract.claimableLostRewards(user6.address, user6TokenId)
      ).to.equal(0);
    });

    it("user with lost rewards should automatically receive them when transferring the nft", async () => {
      const user7 = otherAccounts[6];
      // Stake and Delegate for user7
      await stargateNFTContract.connect(user7).stake(1, {
        value: ethers.parseEther("1"),
      });
      const user7TokenId = await stargateNFTContract.getCurrentTokenId();

      expect(await stargateDelegationContract.isDelegationActive(user7TokenId)).to.be.false;
      expect(await stargateNFTContract.isUnderMaturityPeriod(user7TokenId)).to.be.false;

      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user7.address], [user7TokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user7.address, user7TokenId)
      ).to.equal(lostRewardsAmount);

      await expect(
        stargateNFTContract
          .connect(user7)
          .transferFrom(user7.address, otherAccounts[7].address, user7TokenId)
      )
        .to.emit(stargateDelegationContract, "DelegationRewardsClaimed")
        .withArgs(
          user7TokenId,
          lostRewardsAmount,
          await stargateNFTContract.getAddress(),
          user7.address
        );

      expect(
        await stargateDelegationContract.claimableLostRewards(user7.address, user7TokenId)
      ).to.equal(0);
    });

    it("user with lost rewards should automatically receive them when unstaking", async () => {
      const user8 = otherAccounts[7];
      // Stake and Delegate for user8
      await stargateNFTContract.connect(user8).stake(1, {
        value: ethers.parseEther("1"),
      });
      const user8TokenId = await stargateNFTContract.getCurrentTokenId();

      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user8.address], [user8TokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user8.address, user8TokenId)
      ).to.equal(lostRewardsAmount);

      await expect(stargateNFTContract.connect(user8).unstake(user8TokenId))
        .to.emit(stargateDelegationContract, "DelegationRewardsClaimed")
        .withArgs(
          user8TokenId,
          lostRewardsAmount,
          await stargateNFTContract.getAddress(),
          user8.address
        );

      expect(
        await stargateDelegationContract.claimableLostRewards(user8.address, user8TokenId)
      ).to.equal(0);
    });

    it("user with lost rewards should be able to claim only the lost rewards without claiming delegation rewards", async () => {
      const user = otherAccounts[8];
      // Stake and Delegate for user4
      await stargateNFTContract.connect(user).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      const userTokenId = await stargateNFTContract.getCurrentTokenId();

      expect(await stargateDelegationContract.isDelegationActive(userTokenId)).to.be.true;

      const cycleEnd =
        await stargateDelegationContract.currentDelegationPeriodEndBlock(userTokenId);
      const currentBlock = await stargateDelegationContract.clock();
      await mineBlocks(Number(cycleEnd - currentBlock));

      const accumulatedRewards = await stargateDelegationContract.accumulatedRewards(userTokenId);
      const claimableRewardsBeforeAddingLostRewards =
        await stargateDelegationContract.claimableRewards(userTokenId);
      expect(claimableRewardsBeforeAddingLostRewards).to.equal(accumulatedRewards);

      const expectedAccumulatedRewards =
        Number(config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock) *
        config.DELEGATION_PERIOD_DURATION;
      expect(accumulatedRewards).to.equal(BigInt(expectedAccumulatedRewards));

      // Add lost rewards
      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user.address], [userTokenId], [lostRewardsAmount]);
      expect(
        await stargateDelegationContract.claimableLostRewards(user.address, userTokenId)
      ).to.equal(lostRewardsAmount);

      const newClaimableRewards = await stargateDelegationContract.claimableRewards(userTokenId);
      expect(newClaimableRewards).to.equal(
        claimableRewardsBeforeAddingLostRewards + lostRewardsAmount
      );

      const newAccumulatedRewards =
        await stargateDelegationContract.accumulatedRewards(userTokenId);
      expect(newAccumulatedRewards).to.equal(
        BigInt(expectedAccumulatedRewards) +
          lostRewardsAmount +
          BigInt(config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock)
      );

      // Claim only the lost rewards
      await expect(
        stargateDelegationContract.connect(user).claimLostRewards(user.address, userTokenId)
      )
        .to.emit(stargateDelegationContract, "DelegationRewardsClaimed")
        .withArgs(userTokenId, lostRewardsAmount, user.address, user.address);

      expect(await stargateDelegationContract.claimableRewards(userTokenId)).to.equal(
        claimableRewardsBeforeAddingLostRewards
      );
      expect(
        await stargateDelegationContract.claimableLostRewards(user.address, userTokenId)
      ).to.equal(0);
    });

    it("admin (or other wallets) should be able to claim lost rewards on behalf of a user", async () => {
      const user = otherAccounts[9];
      const userTokenId = await stargateNFTContract.getCurrentTokenId();

      const lostRewardsAmount = ethers.parseEther("1");
      await stargateDelegationContract
        .connect(deployer)
        .addLostRewards([user.address], [userTokenId], [lostRewardsAmount]);

      expect(
        await stargateDelegationContract.claimableLostRewards(user.address, userTokenId)
      ).to.equal(lostRewardsAmount);

      await expect(
        stargateDelegationContract.connect(deployer).claimLostRewards(user.address, userTokenId)
      )
        .to.emit(stargateDelegationContract, "DelegationRewardsClaimed")
        .withArgs(userTokenId, lostRewardsAmount, deployer.address, user.address);

      expect(
        await stargateDelegationContract.claimableLostRewards(user.address, userTokenId)
      ).to.equal(0);
    });
  });

  describe("Flows", () => {
    let deployer: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let stargateNFT: StargateNFT;
    let vthoToken: MyERC20;
    let config: ContractsConfig;
    let stargateDelegationV1: StargateDelegationV1;
    let stargateDelegation: StargateDelegation;
    let user: HardhatEthersSigner;
    let userTokenId: bigint;
    let user2: HardhatEthersSigner;
    let user2TokenId: bigint;
    let user3: HardhatEthersSigner;
    let user3TokenId: bigint;
    let user3TokenId2: bigint;
    let user4: HardhatEthersSigner;
    let user4TokenId: bigint;
    let user5: HardhatEthersSigner;
    let user5TokenId: bigint;
    let user6: HardhatEthersSigner;
    let user6TokenId: bigint;
    let user7: HardhatEthersSigner;
    let user8: HardhatEthersSigner;
    let user8TokenId: bigint;
    let user9: HardhatEthersSigner;
    let user9TokenId: bigint;
    let user10: HardhatEthersSigner;
    let user10TokenId: bigint;

    before(async () => {
      const localConfig = createLocalConfig();
      localConfig.CONTRACTS_ADMIN_ADDRESS = (await ethers.getSigners())[0].address;
      localConfig.DELEGATION_PERIOD_DURATION = 10;
      localConfig.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");
      localConfig.TOKEN_LEVELS[0].level.maturityBlocks = 0;

      const instance = await getOrDeployContracts({
        forceDeploy: true,
        config: localConfig,
      });

      deployer = instance.deployer;
      otherAccounts = instance.otherAccounts;
      stargateNFT = instance.stargateNFTContract;
      vthoToken = instance.mockedVthoToken;
      config = localConfig;

      const stargateDelegationContractV1 = (await deployProxy(
        "StargateDelegationV1",
        [
          {
            upgrader: config.CONTRACTS_ADMIN_ADDRESS,
            admin: config.CONTRACTS_ADMIN_ADDRESS,
            stargateNFT: await stargateNFT.getAddress(),
            vthoToken: await vthoToken.getAddress(),
            vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
            delegationPeriod: config.DELEGATION_PERIOD_DURATION,
            operator: config.STARGATE_DELEGATION_OPERATOR_ADDRESS,
          },
        ],
        {},
        false
      )) as StargateDelegationV1;
      stargateDelegationV1 = stargateDelegationContractV1;

      await stargateNFT
        .connect(deployer)
        .setStargateDelegation(await stargateDelegationV1.getAddress());

      await vthoToken
        .connect(deployer)
        .mint(await stargateDelegationV1.getAddress(), ethers.parseEther("1000000000"));

      //////////////////////////////////////////////
      //// Scenario #1: User 1, with normal bug ////
      //////////////////////////////////////////////
      user = otherAccounts[0];
      await stargateNFT.connect(user).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      userTokenId = await stargateNFT.getCurrentTokenId();

      // wait for first cycle to end and wait some extra blocks
      let cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(userTokenId);
      let currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // claim rewards
      await stargateDelegationV1.connect(user).claimRewards(userTokenId);
      let claimBlock = await stargateDelegationV1.clock();
      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(userTokenId)).to.equal(
        claimBlock
      );

      ///////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #2: User with NFT that experienced bug in multiple cycles can claim lost rewards ////
      ///////////////////////////////////////////////////////////////////////////////////////////////////
      user2 = otherAccounts[1];
      await stargateNFT.connect(user2).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user2TokenId = await stargateNFT.getCurrentTokenId();

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user2TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // claim rewards
      await stargateDelegationV1.connect(user2).claimRewards(user2TokenId);
      claimBlock = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user2TokenId)).to.equal(
        claimBlock
      );

      // wait another cycle
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user2TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // claim rewards
      await stargateDelegationV1.connect(user2).claimRewards(user2TokenId);
      claimBlock = await stargateDelegationV1.clock();
      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user2TokenId)).to.equal(
        claimBlock
      );

      ///////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #3: User that hold multiple NFTs and experienced bug on all can claim lost rewards //
      ///////////////////////////////////////////////////////////////////////////////////////////////////
      user3 = otherAccounts[2];
      await stargateNFT.connect(user3).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user3TokenId = await stargateNFT.getCurrentTokenId();

      await stargateNFT.connect(user3).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user3TokenId2 = await stargateNFT.getCurrentTokenId();

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user3TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 4);

      // claim both rewards
      await stargateDelegationV1.connect(user3).claimRewards(user3TokenId);
      const claimBlockToken1 = await stargateDelegationV1.clock();
      await stargateDelegationV1.connect(user3).claimRewards(user3TokenId2);
      const claimBlockToken2 = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user3TokenId)).to.equal(
        claimBlockToken1
      );
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user3TokenId2)).to.equal(
        claimBlockToken2
      );

      ///////////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #4: User that hold multiple NFTs and only a few experienced bug can claim lost rewards //
      ///////////////////////////////////////////////////////////////////////////////////////////////////////
      user4 = otherAccounts[3];
      await stargateNFT.connect(user4).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user4TokenId = await stargateNFT.getCurrentTokenId();
      await stargateNFT.connect(user4).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      await stargateNFT.getCurrentTokenId();

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user4TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // claim rewards only for 1 token
      await stargateDelegationV1.connect(user4).claimRewards(user4TokenId);
      claimBlock = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user4TokenId)).to.equal(
        claimBlock
      );

      //////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #5: User that hold NFT with bug than burned it can claim lost rewards //
      //////////////////////////////////////////////////////////////////////////////////////
      user5 = otherAccounts[4];
      await stargateNFT.connect(user5).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user5TokenId = await stargateNFT.getCurrentTokenId();

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user5TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // claim rewards
      await stargateDelegationV1.connect(user5).claimRewards(user5TokenId);
      claimBlock = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user5TokenId)).to.equal(
        claimBlock
      );

      // Request delegation exit
      await stargateDelegationV1.connect(user5).requestDelegationExit(user5TokenId);
      await mineBlocks(Number(config.DELEGATION_PERIOD_DURATION) + 2);

      await stargateNFT.connect(user5).unstake(user5TokenId);

      //////////////////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #6: User that hold NFT with bug than transferred to another user can claim lost rewards       //
      //////////////////////////////////////////////////////////////////////////////////////////////////////////////
      user6 = otherAccounts[5];
      await stargateNFT.connect(user6).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user6TokenId = await stargateNFT.getCurrentTokenId();

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user6TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // claim rewards
      await stargateDelegationV1.connect(user6).claimRewards(user6TokenId);
      claimBlock = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user6TokenId)).to.equal(
        claimBlock
      );

      await stargateDelegationV1.connect(user6).requestDelegationExit(user6TokenId);
      await mineBlocks(Number(config.DELEGATION_PERIOD_DURATION) + 2);

      // Transfer NFT to another user
      await stargateNFT
        .connect(user6)
        .transferFrom(user6.address, otherAccounts[6].address, user6TokenId);

      ////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #7: If user hold NFT with bug than transferred to another user which also       //
      //// experienced bug can claim lost rewards, they both can claim lost rewards                 //
      ////////////////////////////////////////////////////////////////////////////////////////////////
      user7 = otherAccounts[6]; // this user received NFT from user6
      await stargateDelegationV1.connect(user7).delegate(user6TokenId, true);

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user6TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // claim rewards
      await stargateDelegationV1.connect(user7).claimRewards(user6TokenId);
      claimBlock = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user6TokenId)).to.equal(
        claimBlock
      );

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #8: If user had NFT with bug, than transferred to another user, which also experienced bug, //
      //// and then burned it, both users can claim lost rewards                                                //
      ////////////////////////////////////////////////////////////////////////////////////////////////////////////
      // user is user7, same of before, that now will burn the nft

      // Request delegation exit
      await stargateDelegationV1.connect(user7).requestDelegationExit(user6TokenId);
      await mineBlocks(Number(config.DELEGATION_PERIOD_DURATION) + 2);

      // Unstake NFT
      await stargateNFT.connect(user7).unstake(user6TokenId);

      ////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #9: If user had NFT with bug, than exited delegation, then delegated again,     //
      //// then claimed again with the NFT, and experienced bug again, they can claim lost rewards  //
      ////////////////////////////////////////////////////////////////////////////////////////////////
      user8 = otherAccounts[7];
      await stargateNFT.connect(user8).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user8TokenId = await stargateNFT.getCurrentTokenId();

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user8TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // Claim rewards
      await stargateDelegationV1.connect(user8).claimRewards(user8TokenId);
      claimBlock = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user8TokenId)).to.equal(
        claimBlock
      );

      // Request delegation exit
      await stargateDelegationV1.connect(user8).requestDelegationExit(user8TokenId);
      await mineBlocks(Number(config.DELEGATION_PERIOD_DURATION) + 2);

      // No bug happens here (because user already exited delegation), so no lost rewards
      await stargateDelegationV1.connect(user8).claimRewards(user8TokenId);

      await stargateDelegationV1.connect(user8).delegate(user8TokenId, true);

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user8TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // Claim rewards
      await stargateDelegationV1.connect(user8).claimRewards(user8TokenId);
      claimBlock = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user8TokenId)).to.equal(
        claimBlock
      );

      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #10: User that claimed rewards, in new cycle, after requested delegation exit has lost rewards to claim //
      ////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
      user9 = otherAccounts[8];
      await stargateNFT.connect(user9).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user9TokenId = await stargateNFT.getCurrentTokenId();

      // wait for first cycle to end and wait some extra blocks
      cycleEnd = await stargateDelegationV1.currentDelegationPeriodEndBlock(user9TokenId);
      currentBlock = await stargateDelegationV1.clock();
      await mineBlocks(Number(cycleEnd - currentBlock) + 2);

      // Instead of claiming rewards now he requests delegation exit
      await stargateDelegationV1.connect(user9).requestDelegationExit(user9TokenId);
      // wait another 2 blocks
      await mineBlocks(2);

      // Now he can claim lost rewards
      await stargateDelegationV1.connect(user9).claimRewards(user9TokenId);
      claimBlock = await stargateDelegationV1.clock();

      // check that bug happened
      expect(await stargateDelegationV1.getRewardsAccumulationStartBlock(user9TokenId)).to.equal(
        claimBlock
      );

      ////////////////////////////////////////////////////////////////////////////////////////////////////////
      //// Scenario #11: User that claimed rewards after he exited delegation has no lost rewards to claim  //
      ////////////////////////////////////////////////////////////////////////////////////////////////////////
      user10 = deployer;
      await stargateNFT.connect(user10).stakeAndDelegate(1, true, {
        value: ethers.parseEther("1"),
      });
      user10TokenId = await stargateNFT.getCurrentTokenId();

      // request to exit delegation
      await stargateDelegationV1.connect(user10).requestDelegationExit(user10TokenId);
      await mineBlocks(Number(config.DELEGATION_PERIOD_DURATION) + 2);

      // claim rewards
      await stargateDelegationV1.connect(user10).claimRewards(user10TokenId);
      claimBlock = await stargateDelegationV1.clock();

      /////////////////////////////////////////////////////////////
      //// Finally upgrade StargateDelegation to latest version  //
      /////////////////////////////////////////////////////////////
      stargateDelegation = (await upgradeProxy(
        "StargateDelegationV1",
        "StargateDelegation",
        await stargateDelegationV1.getAddress(),
        [deployer.address],
        {
          version: 3,
        }
      )) as StargateDelegation;

      ///////////////////////////////////////////////////////////
      //// Run script to calculate lost rewards                //
      ///////////////////////////////////////////////////////////

      // Store block range for script analysis
      const startBlock = 0; // Start from genesis since we're in a local test
      const endBlock = await ethers.provider.getBlockNumber();

      // Set environment variables for the script
      process.env.START_BLOCK = startBlock.toString();
      process.env.END_BLOCK = endBlock.toString();

      const postDeploymentConfig = getConfig();
      postDeploymentConfig.stargateDelegationContractAddress =
        await stargateDelegationV1.getAddress();
      postDeploymentConfig.stargateNFTContractAddress = await stargateNFT.getAddress();

      // Import and run the script
      const calculateLostRewardsModule = await import(
        "../../scripts/lost_rewards/calculate/calculateLostRewards"
      );
      await calculateLostRewardsModule.main();
    });

    it("Lost rewards script should generate correct compensation data", async () => {
      // Read the generated JSON file
      const jsonPath = path.join(
        __dirname,
        "../../scripts/lost_rewards/calculate/lost-rewards-compensation-local.json"
      );

      expect(fs.existsSync(jsonPath)).to.be.true, "Script should have generated JSON file";

      const compensationData = JSON.parse(fs.readFileSync(jsonPath, "utf8"));

      // Verify we found compensation for all expected users
      const expectedUsers = [
        user.address, // User 1: normal bug
        user2.address, // User 2: multiple cycles
        user3.address, // User 3: multiple NFTs all with bugs
        user4.address, // User 4: multiple NFTs, only one NFT affected
        user5.address, // User 5: burned NFT
        user6.address, // User 6: transferred NFT to another user
        user7.address, // User 7: same NFT of user6, experienced bug + burned nft
        user8.address, // User 8: multiple cycles with exit/re-delegate
        user9.address, // User 9: claimed after exit request
      ];

      const foundUsers = compensationData.compensationByOwner.map((c: any) => c.owner);
      for (const expectedUser of expectedUsers) {
        expect(foundUsers).to.include(
          expectedUser,
          `Expected user ${expectedUser} to have compensation`
        );
      }

      // Verify user10 (deployer) should NOT have compensation since they claimed after delegation ended
      expect(foundUsers).to.not.include(
        user10.address,
        `User10 should not have compensation (claimed after delegation ended)`
      );

      const expectedTokens = [
        userTokenId.toString(),
        user2TokenId.toString(),
        user3TokenId.toString(),
        user3TokenId2.toString(),
        user4TokenId.toString(),
        user5TokenId.toString(),
        user6TokenId.toString(),
        user8TokenId.toString(),
        user9TokenId.toString(),
      ];

      const foundTokens = compensationData.compensations.map((c: any) => c.tokenId);
      for (const expectedToken of expectedTokens) {
        expect(foundTokens).to.include(
          expectedToken,
          `Expected token ${expectedToken} to have compensation`
        );
      }

      // Verify user10TokenId (deployer) should NOT have compensation since they claimed after delegation ended
      expect(foundTokens).to.not.include(
        user10TokenId,
        `user10TokenId should not have compensation (claimed after delegation ended)`
      );

      // Store compensation data for other tests
      (global as any).testCompensationData = compensationData;
    });

    it("Should be able to add all lost rewards from script", async () => {
      const compensationData = (global as any).testCompensationData;

      // Process compensationByOwner to handle multiple bug instances per token
      const lostRewardsEntries: { owner: string; tokenId: bigint; totalRewards: bigint }[] = [];

      for (const ownerData of compensationData.compensationByOwner) {
        const owner = ownerData.owner;

        // Group bug instances by tokenId and sum rewards
        const tokenRewards = new Map<string, bigint>();

        for (const bugInstance of ownerData.bugInstances) {
          const tokenId = bugInstance.tokenId;
          const rewards = BigInt(bugInstance.rewards);

          if (tokenRewards.has(tokenId)) {
            tokenRewards.set(tokenId, tokenRewards.get(tokenId)! + rewards);
          } else {
            tokenRewards.set(tokenId, rewards);
          }
        }

        // Add entries for each token
        for (const [tokenId, totalRewards] of tokenRewards) {
          lostRewardsEntries.push({
            owner,
            tokenId: BigInt(tokenId),
            totalRewards,
          });
        }
      }

      // Extract arrays for contract call
      const owners = lostRewardsEntries.map((entry) => entry.owner);
      const tokenIds = lostRewardsEntries.map((entry) => entry.tokenId);
      const amounts = lostRewardsEntries.map((entry) => entry.totalRewards);

      await stargateDelegation.connect(deployer).addLostRewards(owners, tokenIds, amounts);

      // Verify each user can see their lost rewards
      for (const entry of lostRewardsEntries) {
        const claimableAmount = await stargateDelegation.claimableLostRewards(
          entry.owner,
          entry.tokenId
        );

        expect(claimableAmount).to.equal(
          entry.totalRewards,
          `User ${entry.owner} should see ${ethers.formatEther(entry.totalRewards)} VTHO for token ${entry.tokenId}`
        );
      }
    });

    it("Users should be able to claim their lost rewards calculated by the script", async () => {
      const compensationData = (global as any).testCompensationData;

      // Test claiming lost rewards for each compensation entry
      for (const ownerCompensation of compensationData.compensationByOwner) {
        const owner = ownerCompensation.owner;

        // Group bug instances by tokenId and sum rewards (same as in add test)
        const tokenRewards = new Map<string, bigint>();

        for (const bugInstance of ownerCompensation.bugInstances) {
          const tokenId = bugInstance.tokenId;
          const rewards = BigInt(bugInstance.rewards);

          if (tokenRewards.has(tokenId)) {
            tokenRewards.set(tokenId, tokenRewards.get(tokenId)! + rewards);
          } else {
            tokenRewards.set(tokenId, rewards);
          }
        }

        // Claim lost rewards for each unique token
        for (const [tokenIdStr, totalRewards] of tokenRewards) {
          const tokenId = BigInt(tokenIdStr);

          const claimableAmount = await stargateDelegation.claimableLostRewards(owner, tokenId);
          expect(claimableAmount).to.equal(totalRewards);

          // Claim the lost rewards
          await expect(stargateDelegation.connect(deployer).claimLostRewards(owner, tokenId)).to.not
            .be.reverted;

          // Verify rewards were claimed
          expect(await stargateDelegation.claimableLostRewards(owner, tokenId)).to.equal(0);
        }
      }
    });

    it("Script should correctly categorize different bug tags", async () => {
      const compensationData = (global as any).testCompensationData;

      // Verify we have the expected bug tags from our test scenarios
      const allTags = compensationData.compensations.flatMap((c: any) => c.tags);

      expect(allTags).to.include("base", "Should have basic bug instances");
      expect(allTags).to.include("burned_nft", "Should have burned NFT bug instances");
      expect(allTags).to.include("transferred", "Should have transferred NFT bug instances");
      expect(allTags).to.include(
        "multiple_claims_in_delegation",
        "Should have multiple claims bug instances"
      );

      // Verify burned NFT compensations - ALL bug instances on tokens that were eventually burned
      const burnedNftCompensations = compensationData.compensations.filter((c: any) =>
        c.tags.includes("burned_nft")
      );

      // User5: burned NFT directly after experiencing bug
      const user5BurnedCompensations = burnedNftCompensations.filter(
        (c: any) => c.owner === user5.address
      );
      expect(user5BurnedCompensations.length).to.be.greaterThan(
        0,
        "User5 should have burned NFT compensation"
      );

      // User6: experienced bug on token that was later burned by user7
      const user6BurnedCompensations = burnedNftCompensations.filter(
        (c: any) => c.owner === user6.address
      );
      expect(user6BurnedCompensations.length).to.be.greaterThan(
        0,
        "User6 should have burned NFT compensation (token later burned by user7)"
      );

      // User7: received NFT from user6, experienced bug, then burned it
      const user7BurnedCompensations = burnedNftCompensations.filter(
        (c: any) => c.owner === user7.address
      );
      expect(user7BurnedCompensations.length).to.be.greaterThan(
        0,
        "User7 should have burned NFT compensation"
      );

      // Verify transferred NFT compensations - users who transferred NFTs after experiencing bug
      const transferredNftCompensations = compensationData.compensations.filter((c: any) =>
        c.tags.includes("transferred")
      );

      // User6: experienced bug then transferred NFT to user7
      const user6TransferredCompensations = transferredNftCompensations.filter(
        (c: any) => c.owner === user6.address
      );
      expect(user6TransferredCompensations.length).to.be.greaterThan(
        0,
        "User6 should have transferred NFT compensation"
      );

      // Verify specific token IDs for precision
      expect(user5BurnedCompensations[0].tokenId).to.equal(user5TokenId.toString());
      expect(user6BurnedCompensations[0].tokenId).to.equal(user6TokenId.toString());
      expect(user6TransferredCompensations[0].tokenId).to.equal(user6TokenId.toString());
      expect(user7BurnedCompensations[0].tokenId).to.equal(user6TokenId.toString()); // Same token, transferred from user6

      // Verify exact counts - now we expect 3 burned NFT compensations:
      // 1. user5 (burned own token)
      // 2. user6 (bug on token later burned by user7)
      // 3. user7 (bug on token then burned it)
      expect(burnedNftCompensations.length).to.equal(
        3,
        "Should have exactly 3 burned NFT compensations (user5 own token, user6 + user7 on same transferred token)"
      );
      expect(transferredNftCompensations.length).to.equal(
        1,
        "Should have exactly 1 transferred NFT compensation (user6)"
      );
    });

    it("Script calculations should match manual calculations", async () => {
      const compensationData = (global as any).testCompensationData;

      // For user1 (simple case), manually verify the calculation
      const user1Compensation = compensationData.compensationByOwner.find(
        (c: any) => c.owner === user.address
      );
      expect(user1Compensation).to.not.be.undefined;

      const rewardPerBlock = config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock;

      // User1 claimed 3 blocks late after first period ended
      const expectedLostBlocks = 3;
      const expectedLostRewards = BigInt(rewardPerBlock) * BigInt(expectedLostBlocks);

      // Find user1's bug instance
      const user1BugInstance = compensationData.compensations.find(
        (c: any) => c.owner === user.address && c.tokenId === userTokenId.toString()
      );

      expect(user1BugInstance).to.not.be.undefined;
      expect(user1BugInstance.lostBlocks).to.equal(expectedLostBlocks);
      expect(BigInt(user1BugInstance.lostRewards)).to.equal(expectedLostRewards);
    });

    it("JSON file should have correct structure and data", async () => {
      const compensationData = (global as any).testCompensationData;

      // Verify JSON structure
      expect(compensationData).to.have.property("summary");
      expect(compensationData).to.have.property("compensationByOwner");
      expect(compensationData).to.have.property("compensations");

      // Verify summary data
      expect(compensationData.summary.totalBugInstances).to.be.greaterThan(0);
      expect(compensationData.summary.uniqueTokensAffected).to.be.greaterThan(0);
      expect(compensationData.summary.uniqueOwnersAffected).to.be.greaterThan(0);
      expect(compensationData.summary.network).to.equal("hardhat");
      expect(compensationData.summary.environment).to.equal("local");

      // Verify compensation data structure
      for (const compensation of compensationData.compensations) {
        expect(compensation).to.have.property("tokenId");
        expect(compensation).to.have.property("owner");
        expect(compensation).to.have.property("lostRewards");
        expect(compensation).to.have.property("lostRewardsEther");
        expect(compensation).to.have.property("lostBlocks");
        expect(compensation).to.have.property("claimBlock");
        expect(compensation).to.have.property("tags");

        expect(parseInt(compensation.lostBlocks)).to.be.greaterThan(0);
        expect(BigInt(compensation.lostRewards)).to.be.greaterThan(0n);
      }
    });

    it("Should have precise mapping of test scenarios to bug tags", async () => {
      const compensationData = (global as any).testCompensationData;

      // Expected scenario mapping with tags:
      // user1: basic bug (tags: ["base"])
      // user2: multiple cycles bug (tags: ["base", "multiple_claims_in_delegation", "multiple_occurrences"])
      // user3: multiple NFTs with bugs (tags: ["base"] for each)
      // user4: single NFT bug (tags: ["base"])
      // user5: burned NFT bug (tags: ["base", "burned_nft"])
      // user6: transferred NFT bug (tags: ["base", "transferred", "burned_nft"]) - token later burned by user7
      // user7: received NFT, bug, then burned (tags: ["base", "burned_nft"])
      // user8: multiple cycles with exit/re-delegate (tags: ["base", "multiple_claims_in_delegation", "multiple_occurrences"])
      // user9: claimed after exit request (tags: ["base"])

      const getUserCompensations = (userAddress: string) =>
        compensationData.compensations.filter((c: any) => c.owner === userAddress);

      // User1: Basic bug
      const user1Compensations = getUserCompensations(user.address);
      expect(user1Compensations.length).to.equal(1);
      expect(user1Compensations[0].tags).to.include("base");
      expect(user1Compensations[0].tokenId).to.equal(userTokenId.toString());

      // User2: Multiple cycles bug
      const user2Compensations = getUserCompensations(user2.address);
      expect(user2Compensations.length).to.be.greaterThan(
        1,
        "User2 should have multiple bug instances"
      );

      // User2 should have multiple tags: might include "multiple_occurrences" and "multiple_claims_in_delegation"
      const user2AllTags = user2Compensations.flatMap((c: any) => c.tags);
      const hasMultipleClaims = user2AllTags.includes("multiple_claims_in_delegation");
      const hasMultipleOccurrences = user2AllTags.includes("multiple_occurrences");

      expect(hasMultipleClaims || hasMultipleOccurrences).to.be.true;
      user2Compensations.forEach((comp: any) => {
        expect(comp.tokenId).to.equal(user2TokenId.toString());
      });

      // User3: Multiple NFTs with bugs
      const user3Compensations = getUserCompensations(user3.address);
      expect(user3Compensations.length).to.equal(2, "User3 should have compensations for 2 NFTs");
      const user3TokenIds = user3Compensations.map((c: any) => c.tokenId).sort();
      expect(user3TokenIds).to.deep.equal(
        [user3TokenId.toString(), user3TokenId2.toString()].sort()
      );

      // User4: Single NFT bug
      const user4Compensations = getUserCompensations(user4.address);
      expect(user4Compensations.length).to.equal(
        1,
        "User4 should have compensation for 1 NFT only"
      );
      expect(user4Compensations[0].tokenId).to.equal(user4TokenId.toString());

      // User5: Burned NFT
      const user5Compensations = getUserCompensations(user5.address);
      expect(user5Compensations.length).to.equal(1);
      expect(user5Compensations[0].tags).to.include("burned_nft");
      expect(user5Compensations[0].tokenId).to.equal(user5TokenId.toString());

      // User6: Transferred NFT that was later burned
      const user6Compensations = getUserCompensations(user6.address);
      expect(user6Compensations.length).to.equal(1);
      expect(user6Compensations[0].tags).to.include("transferred");
      expect(user6Compensations[0].tags).to.include("burned_nft"); // Token was later burned by user7
      expect(user6Compensations[0].tokenId).to.equal(user6TokenId.toString());

      // User7: Received NFT, experienced bug, then burned it
      const user7Compensations = getUserCompensations(user7.address);
      expect(user7Compensations.length).to.equal(1);
      expect(user7Compensations[0].tags).to.include("burned_nft");
      expect(user7Compensations[0].tokenId).to.equal(user6TokenId.toString()); // Same token as user6

      // User8: Multiple cycles with exit/re-delegate
      const user8Compensations = getUserCompensations(user8.address);
      expect(user8Compensations.length).to.be.greaterThan(
        1,
        "User8 should have multiple bug instances"
      );
      user8Compensations.forEach((comp: any) => {
        expect(comp.tokenId).to.equal(user8TokenId.toString());
      });

      // User9: Claimed after exit request
      const user9Compensations = getUserCompensations(user9.address);
      expect(user9Compensations.length).to.equal(1);
      expect(user9Compensations[0].tokenId).to.equal(user9TokenId.toString());
    });
  });
});
