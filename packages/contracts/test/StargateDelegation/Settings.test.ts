import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts } from "../helpers/deploy";
import { expect } from "chai";
import { TransactionResponse } from "ethers";
import { StargateDelegation } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("shard102: StargateDelegation Settings", () => {
  let tx: TransactionResponse;
  let stargateDelegationContract: StargateDelegation;
  let deployer: HardhatEthersSigner;
  let otherAccounts: HardhatEthersSigner[];

  beforeEach(async () => {
    const config = createLocalConfig();
    const contracts = await getOrDeployContracts({
      config,
      forceDeploy: true,
    });
    stargateDelegationContract = contracts.stargateDelegationContract;
    deployer = contracts.deployer;
    otherAccounts = contracts.otherAccounts;
  });
  it("Admin should be able to set vtho rewards per block", async () => {
    const newVthoRewardsPerBlock = [
      {
        levelId: 1,
        rewardPerBlock: 1000000000000000000n,
      },
      {
        levelId: 2,
        rewardPerBlock: 2000000000000000000n,
      },
    ];

    for (const rewardConfig of newVthoRewardsPerBlock) {
      tx = await stargateDelegationContract
        .connect(deployer)
        .setVthoRewardPerBlockForLevel(rewardConfig.levelId, rewardConfig.rewardPerBlock);
      await tx.wait();
    }

    // check that the rewards are set correctly
    const vthoRewardsPerBlock = await stargateDelegationContract.getVthoRewardsPerBlock();

    expect(Number(vthoRewardsPerBlock[0][1])).to.equal(
      Number(newVthoRewardsPerBlock[0].rewardPerBlock)
    );
    expect(Number(vthoRewardsPerBlock[1][1])).to.equal(
      Number(newVthoRewardsPerBlock[1].rewardPerBlock)
    );
  });

  it("Admin should be able to set vtho rewards in bulk for all levels", async () => {
    const newVthoRewardsPerBlock = [
      {
        levelId: 1,
        rewardPerBlock: 500000000000000000n, // 0.5 VTHO per block
      },
      {
        levelId: 2,
        rewardPerBlock: 1500000000000000000n, // 1.5 VTHO per block
      },
      {
        levelId: 3,
        rewardPerBlock: 3000000000000000000n, // 3.0 VTHO per block
      },
    ];

    // Set all rewards in bulk
    tx = await stargateDelegationContract
      .connect(deployer)
      .setVthoRewardPerBlockForAllLevels(newVthoRewardsPerBlock);
    await tx.wait();

    // Verify that all rewards are set correctly
    const vthoRewardsPerBlock = await stargateDelegationContract.getVthoRewardsPerBlock();

    for (let i = 0; i < newVthoRewardsPerBlock.length; i++) {
      // Find the corresponding level in the returned array
      const returnedReward = vthoRewardsPerBlock.find(
        (reward) => Number(reward[0]) === newVthoRewardsPerBlock[i].levelId
      );

      expect(returnedReward).to.not.be.undefined;
      expect(Number(returnedReward![1])).to.equal(Number(newVthoRewardsPerBlock[i].rewardPerBlock));
    }
  });

  it("Should revert when trying to set vtho rewards with invalid parameters", async () => {
    // Test with empty array - should revert with ArrayCannotBeEmpty
    await expect(stargateDelegationContract.connect(deployer).setVthoRewardPerBlockForAllLevels([]))
      .to.be.reverted;

    // Test with zero reward per block - should revert with InvalidVthoRewardPerBlock
    const invalidRewards = [
      {
        levelId: 1,
        rewardPerBlock: 0n, // Invalid: zero reward
      },
    ];

    await expect(
      stargateDelegationContract.connect(deployer).setVthoRewardPerBlockForAllLevels(invalidRewards)
    ).to.be.reverted;
  });

  it("Should revert when non admin tries to set vtho rewards", async () => {
    const newVthoRewardsPerBlock = [
      {
        levelId: 1,
        rewardPerBlock: 500000000000000000n, // 0.5 VTHO per block
      },
    ];

    await expect(
      stargateDelegationContract
        .connect(otherAccounts[0])
        .setVthoRewardPerBlockForAllLevels(newVthoRewardsPerBlock)
    ).to.be.reverted;

    await expect(
      stargateDelegationContract
        .connect(otherAccounts[0])
        .setVthoRewardPerBlockForLevel(1, 500000000000000000n)
    ).to.be.reverted;
  });

  it("Admin can set rewards accumulation end block", async () => {
    const currentEndBlock = await stargateDelegationContract.getRewardsAccumulationEndBlock();
    expect(currentEndBlock).to.equal(0n);

    const newEndBlock = currentEndBlock + 10n;
    tx = await stargateDelegationContract
      .connect(deployer)
      .setRewardsAccumulationEndBlock(newEndBlock);
    await tx.wait();
    expect(await stargateDelegationContract.getRewardsAccumulationEndBlock()).to.equal(newEndBlock);
  });

  it("Non admin cannot set rewards accumulation end block", async () => {
    const currentEndBlock = await stargateDelegationContract.getRewardsAccumulationEndBlock();

    const newEndBlock = currentEndBlock + 10n;
    await expect(
      stargateDelegationContract
        .connect(otherAccounts[0])
        .setRewardsAccumulationEndBlock(newEndBlock)
    ).to.be.reverted;

    expect(await stargateDelegationContract.getRewardsAccumulationEndBlock()).to.equal(
      currentEndBlock
    );
  });
});
