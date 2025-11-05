import { getOrDeployContracts, createThorSoloContainer } from "../helpers";
import { StartedTestContainer } from "testcontainers";
import { Stargate, StargateNFT } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";
import { expect } from "chai";

describe("shard-i7: Feature Pausing", () => {
    let soloContainer: StartedTestContainer;
    let stargateContract: Stargate;
    let stargateNFTContract: StargateNFT;

    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let tx: TransactionResponse;

    beforeEach(async () => {
        soloContainer = await createThorSoloContainer();

        const contracts = await getOrDeployContracts({ forceDeploy: true });

        stargateContract = contracts.stargateContract;
        stargateNFTContract = contracts.stargateNFTContract;
        deployer = contracts.deployer;
        user = contracts.otherAccounts[0];

        await stargateContract.grantRole(await stargateContract.PAUSER_ROLE(), deployer.address);
    });

    afterEach(async () => {
        if (soloContainer) {
            await soloContainer.stop();
        }
    });

    it("should be able to pause and unpause the contract", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        expect(await stargateContract.paused()).to.equal(true);
        tx = await stargateContract.connect(deployer).unpause();
        await tx.wait();
        expect(await stargateContract.paused()).to.equal(false);
    });

    it("should revert when non-admin tries to pause or unpause the contract", async () => {
        await expect(stargateContract.connect(user).pause()).to.be.revertedWithCustomError(
            stargateContract,
            "AccessControlUnauthorizedAccount"
        );
        await expect(stargateContract.connect(user).unpause()).to.be.revertedWithCustomError(
            stargateContract,
            "AccessControlUnauthorizedAccount"
        );
    });

    it("should revert when trying to call delegation after it is paused", async () => {
        // Pause the delegation feature
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        // Try to delegate the NFT and it should revert
        // with the FeaturePaused error
        await expect(
            stargateContract.connect(user).delegate(1, user.address)
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
        // Unpause the delegation feature
        tx = await stargateContract.connect(deployer).unpause();
        await tx.wait();
        // Try to delegate the NFT and it should work
        await expect(
            stargateContract.connect(user).delegate(1, user.address)
        ).to.not.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });

    it("should revert when trying to call requestDelegationExit after it is paused", async () => {
        // Pause the exit delegation feature
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        // Try to exit delegation the NFT and it should revert
        await expect(
            stargateContract.connect(user).requestDelegationExit(1)
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
        // Unpause the exit delegation feature
        tx = await stargateContract.connect(deployer).unpause();
        await tx.wait();
        // Try to exit delegation the NFT and it should work
        await expect(
            stargateContract.connect(user).requestDelegationExit(1)
        ).to.not.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });

    it("should revert when trying to call claimRewards after it is paused", async () => {
        // Pause the rewards feature
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        // Try to claim rewards the NFT and it should revert
        await expect(stargateContract.connect(user).claimRewards(1)).to.be.revertedWithCustomError(
            stargateContract,
            "EnforcedPause"
        );
        // Unpause the rewards feature
        tx = await stargateContract.connect(deployer).unpause();
        await tx.wait();
        // Try to claim rewards the NFT and it should work
        await expect(
            stargateContract.connect(user).claimRewards(1)
        ).to.not.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });

    it("should revert when trying to stake after it is paused", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        // Pause the boost feature
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        // Try to boost the NFT and it should revert
        await expect(
            stargateContract
                .connect(user)
                .stake(levelId, { value: levelSpec.vetAmountRequiredToStake })
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
        // Unpause the rewards feature
        tx = await stargateContract.connect(deployer).unpause();
        await tx.wait();
        // Try to claim rewards the NFT and it should work
        await expect(
            stargateContract
                .connect(user)
                .stake(levelId, { value: levelSpec.vetAmountRequiredToStake })
        ).to.not.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });

    it("should revert when trying to unstake after it is paused", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        // Try to unstake the NFT and it should revert
        await expect(stargateContract.connect(user).unstake(1)).to.be.revertedWithCustomError(
            stargateContract,
            "EnforcedPause"
        );
        // Unpause the unstaking feature
        tx = await stargateContract.connect(deployer).unpause();
        await tx.wait();
        // Try to unstake the NFT and it should work
        await expect(stargateContract.connect(user).unstake(1)).to.not.be.revertedWithCustomError(
            stargateContract,
            "EnforcedPause"
        );
    });

    it("should revert when trying to stake and delegate after it is paused", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        // Pause the boost feature
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        // Try to stake and delegate the NFT and it should revert
        await expect(
            stargateContract.connect(user).stakeAndDelegate(levelId, user.address, {
                value: levelSpec.vetAmountRequiredToStake,
            })
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
        // Unpause the staking and delegation feature
        tx = await stargateContract.connect(deployer).unpause();
        await tx.wait();
        // Try to stake and delegate the NFT and it should work
        await expect(
            stargateContract.connect(user).stakeAndDelegate(levelId, user.address, {
                value: levelSpec.vetAmountRequiredToStake,
            })
        ).to.not.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });

    it("should revert when trying to migrate and delegate after it is paused", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        // Pause the boost feature
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        // Try to migrate and delegate the NFT and it should revert
        await expect(
            stargateContract.connect(user).migrateAndDelegate(levelId, user.address, {
                value: levelSpec.vetAmountRequiredToStake,
            })
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
        // Unpause the migration and delegation feature
        tx = await stargateContract.connect(deployer).unpause();
        await tx.wait();
        // Try to migrate and delegate the NFT and it should work
        await expect(
            stargateContract.connect(user).migrateAndDelegate(levelId, user.address, {
                value: levelSpec.vetAmountRequiredToStake,
            })
        ).to.not.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });
});
