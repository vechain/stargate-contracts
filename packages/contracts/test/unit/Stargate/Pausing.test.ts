import { expect } from "chai";
import { Stargate } from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";

describe("shard-u5: Stargate: Pausing", () => {
    let stargateContract: Stargate;
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tx: TransactionResponse;
    let validator: HardhatEthersSigner;

    beforeEach(async () => {
        const config = createLocalConfig();
        [deployer] = await ethers.getSigners();
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });

        stargateContract = contracts.stargateContract;

        user = contracts.otherAccounts[0];
        otherAccounts = contracts.otherAccounts;
        validator = contracts.otherAccounts[1];

        await stargateContract.grantRole(await stargateContract.PAUSER_ROLE(), deployer.address);
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
    });

    it("should revert when trying to call stake after it is paused", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        await expect(stargateContract.connect(user).stake(1)).to.be.revertedWithCustomError(
            stargateContract,
            "EnforcedPause"
        );
    });

    it("should revert when trying to call unstake after it is paused", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        await expect(stargateContract.connect(user).unstake(1)).to.be.revertedWithCustomError(
            stargateContract,
            "EnforcedPause"
        );
    });

    it("should revert when trying to call delegate after it is paused", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        await expect(
            stargateContract.connect(user).delegate(1, user.address)
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });

    it("should revert when trying to call requestDelegationExit after it is paused", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        await expect(
            stargateContract.connect(user).requestDelegationExit(1)
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });

    it("should revert when trying to call migrateAndDelegate after it is paused", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        await expect(
            stargateContract.connect(user).migrateAndDelegate(1, user.address)
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });

    it("should revert when trying to call claimRewards after it is paused", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        await expect(stargateContract.connect(user).claimRewards(1)).to.be.revertedWithCustomError(
            stargateContract,
            "EnforcedPause"
        );
    });

    it("should revert when trying to call stake and delegate after it is paused", async () => {
        tx = await stargateContract.connect(deployer).pause();
        await tx.wait();
        await expect(
            stargateContract.connect(user).stakeAndDelegate(1, user.address)
        ).to.be.revertedWithCustomError(stargateContract, "EnforcedPause");
    });
});
