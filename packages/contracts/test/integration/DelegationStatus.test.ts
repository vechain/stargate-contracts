import { expect } from "chai";
import { ethers } from "hardhat";
import { StartedTestContainer } from "testcontainers";
import { IProtocolStaker, StargateNFT, Stargate } from "../../typechain-types";
import { IProtocolParams } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { compareAddresses } from "@repo/utils/AddressUtils";
import {
    createThorSoloContainer,
    getOrDeployContracts,
    log,
    mineBlocks,
    fastForwardValidatorPeriods,
    MAX_UINT32,
    stakeAndDelegateNFT,
} from "../helpers";

describe("shard-i2: Stargate: Delegation Status", () => {
    let soloContainer: StartedTestContainer;

    let protocolStakerContract: IProtocolStaker;
    let protocolParamsContract: IProtocolParams;
    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;

    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;

    beforeEach(async () => {
        soloContainer = await createThorSoloContainer();

        const contracts = await getOrDeployContracts({ forceDeploy: true });

        protocolStakerContract = contracts.protocolStakerContract;
        protocolParamsContract = contracts.protocolParamsContract;
        stargateNFTContract = contracts.stargateNFTContract;
        stargateContract = contracts.stargateContract;

        deployer = contracts.deployer;
        user = contracts.otherAccounts[0];
    });

    afterEach(async () => {
        if (soloContainer) {
            await soloContainer.stop();
        }
    });

    it("should run all tests on solo with this config", async () => {
        const paramsKey = "0x00000000000064656c656761746f722d636f6e74726163742d61646472657373";
        const stargateAddress = await protocolParamsContract.get(paramsKey);
        const expectedParamsVal = BigInt(await stargateContract.getAddress());
        expect(stargateAddress).to.equal(expectedParamsVal);

        const validatorAddress = await protocolStakerContract.firstActive();
        expect(compareAddresses(validatorAddress, deployer.address)).to.be.true;

        const [leaderGroupSize, queuedValidators] =
            await protocolStakerContract.getValidationsNum();
        expect(leaderGroupSize).to.equal(1);
        expect(queuedValidators).to.equal(0);

        const [, , , , status, offlineBlock] =
            await protocolStakerContract.getValidation(validatorAddress);

        expect(status).to.equal(2); // 2 Active
        expect(offlineBlock).to.equal(MAX_UINT32);
    });

    // In this test we will test that the contract returns correctly the different delegation statuses
    // We will:
    // - mint a new NFT and delegate it to a validator
    // - test that the status is PENDING
    // - fast-forward to the next period and test that the status is ACTIVE
    // - request to exit delegation and test that the status is still ACTIVE but that it is known if the user has requested to exit
    // - fast-forward to the next period and test that the status is EXITED
    // - delegate again and test that the status of the new delegation is PENDING, while the status of the previous delegation is still EXITED
    // - fast-forward to the next period and test that the status of the new delegation is ACTIVE
    it("Can correctly fetch delegation status based on the delegation lifecycle", async () => {
        // Will stake an NFT of level 1
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        const levelVetAmountRequired = levelSpec.vetAmountRequiredToStake;

        // Stake an NFT of level 1
        const stakeTx = await stargateContract
            .connect(user)
            .stake(levelId, { value: levelVetAmountRequired });
        await stakeTx.wait();
        log("\n🎉 Correctly staked an NFT of level", levelId);

        // Assert that user is the owner of the NFT, and the NFT is under the maturity period
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;

        // Fast-forward until the NFT is mature
        await mineBlocks(Number(levelSpec.maturityBlocks));
        log("\n🚀 Fast-forwarded", Number(levelSpec.maturityBlocks), "blocks to mature the NFT");

        // Assert that the NFT is mature, so it can be delegated
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.false;

        let delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.equal(0);

        let delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(0n);

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // delegation should be pending
        delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(1n);

        // Fast-forward to the next period
        const [periodDuration, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);

        const blocksMined = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock),
            0
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(2n);

        // Fast-forward to the next period
        const blocksMined2 = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock)
        );
        log("\n🚀 Fast-forwarded", blocksMined2, "blocks to get to the next period");

        // delegation should still be active

        delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(2n);

        // Request to exit the delegation
        // we can know if the user has requested to exit
        let hasRequestedExit = await stargateContract.hasRequestedExit(tokenId);
        expect(hasRequestedExit).to.be.false;

        const exitTx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await exitTx.wait();
        log("\n🎉 Correctly requested to exit the delegation");

        // status should be active
        delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(2n);

        // we can know if the user has requested to exit
        hasRequestedExit = await stargateContract.hasRequestedExit(tokenId);
        expect(hasRequestedExit).to.be.true;

        // Fast-forward to the next period
        const blocksMined3 = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock)
        );
        log("\n🚀 Fast-forwarded", blocksMined3, "blocks to get to the next period");

        // status should be exited
        delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(3n);

        // claim accumulated rewards
        const claimTx = await stargateContract.connect(user).claimRewards(tokenId);
        await claimTx.wait();

        // User decides to delegate again
        const delegateTx2 = await stargateContract
            .connect(user)
            .delegate(tokenId, deployer.address);
        await delegateTx2.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        let secondDelegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(secondDelegationId).to.not.equal(delegationId);

        delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(1n);

        // Fast-forward to the next period
        const blocksMined4 = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock)
        );
        log("\n🚀 Fast-forwarded", blocksMined4, "blocks to get to the next period");

        delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(2n);
    });

    it("Can correctly fetch delegation status for a queued validator", async () => {
        // Add a queued validator to the protocol
        const newValidator = (await ethers.getSigners())[5];
        const addValidatorTx = await protocolStakerContract
            .connect(newValidator)
            .addValidation(newValidator.address, 12, {
                value: ethers.parseEther("25000000"),
            });
        await addValidatorTx.wait();
        log("\n🎉 Correctly added a new validator to the protocol");

        // Ensure that the new validator is in the queue
        let [activeValidators, queuedValidators] = await protocolStakerContract.getValidationsNum();
        expect(activeValidators).to.equal(1);
        expect(queuedValidators).to.equal(1);

        let validatorDetails = await protocolStakerContract.getValidation(newValidator.address);
        expect(validatorDetails[4]).to.equal(1); // 1 = queued

        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1, // levelId
            newValidator.address,
            stargateNFTContract,
            stargateContract
        );

        // Ensure that the delegation is pending
        let delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(1n);
    });

    it("If delegation is in a pending state, user can immediately unstake the NFT and get the VET back", async () => {
        const { tokenId, levelVetAmountRequired, delegationId } = await stakeAndDelegateNFT(
            user,
            1, // levelId
            deployer.address,
            stargateNFTContract,
            stargateContract
        );

        // Unstake the NFT and check that the VET is returned to the user from the protocol
        const balanceProtocolBeforeUnstake = await ethers.provider.getBalance(
            protocolStakerContract.target
        );
        const balanceUserBeforeUnstake = await ethers.provider.getBalance(user.address);

        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        const balanceProtocolAfterUnstake = await ethers.provider.getBalance(
            protocolStakerContract.target
        );
        expect(balanceProtocolAfterUnstake).to.be.equal(
            balanceProtocolBeforeUnstake - levelVetAmountRequired
        );

        const balanceUserAfterUnstake = await ethers.provider.getBalance(user.address);
        expect(balanceUserAfterUnstake).to.be.equal(
            balanceUserBeforeUnstake + levelVetAmountRequired
        );

        // while the delegation is exited, the status of the token is none (because we reset the state for the token)
        let delegationStatusOfToken = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatusOfToken).to.equal(0n);

        // Fast-forward to the next period
        const [periodDuration, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        const blocksMined = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock)
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // check that the previous statuses did not change
        delegationStatusOfToken = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatusOfToken).to.equal(0n);
    });

    // In this test we will simulate that a user delegates to a validator, but while he is waiting for the next period to start for the delegation to become active,
    // he decides to cancel the delegation request.
    // Then we test that he can correctly delegate again in the same period (then we cancel again) and then, after waiting a period, he can delegate again.
    it("If delegation is in a pending state, user can exit the delegation immediately", async () => {
        const { tokenId, delegationId, levelSpec } = await stakeAndDelegateNFT(
            user,
            1, // levelId
            deployer.address,
            stargateNFTContract,
            stargateContract
        );

        // Ensure that the delegation is pending
        let delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(1n);

        const protocolStakerBalanceBeforeCancel = await ethers.provider.getBalance(
            protocolStakerContract.target
        );
        const stargateBalanceBeforeCancel = await ethers.provider.getBalance(
            stargateContract.target
        );
        const userBalanceBeforeCancel = await ethers.provider.getBalance(user.address);

        const stargateNFTBalanceBeforeCancel = await ethers.provider.getBalance(
            stargateNFTContract.target
        );
        // Cancel the delegation request
        const cancelTx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await cancelTx.wait();
        log("\n🎉 Correctly requested to exit the delegation");

        // Ensure it shows that the user does not have any delegation
        let tokenDelegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(tokenDelegationStatus).to.equal(0n);

        // Ensure money moved to the StargateNFT contract and not to the user
        const protocolStakerBalanceAfterCancel = await ethers.provider.getBalance(
            protocolStakerContract.target
        );

        expect(protocolStakerBalanceAfterCancel).to.be.equal(
            protocolStakerBalanceBeforeCancel - levelSpec.vetAmountRequiredToStake
        );

        const stargateBalanceAfterCancel = await ethers.provider.getBalance(
            stargateContract.target
        );
        expect(stargateBalanceAfterCancel).to.be.equal(
            stargateBalanceBeforeCancel + levelSpec.vetAmountRequiredToStake
        );

        const userBalanceAfterCancel = await ethers.provider.getBalance(user.address);
        expect(userBalanceAfterCancel).to.be.equal(userBalanceBeforeCancel);

        const stargateNFTBalanceAfterCancel = await ethers.provider.getBalance(
            stargateNFTContract.target
        );
        expect(stargateNFTBalanceAfterCancel).to.be.equal(stargateNFTBalanceBeforeCancel);

        // Ensure the user can delegate again immediately without any issues
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        tokenDelegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(tokenDelegationStatus).to.equal(1n);

        // Let's cancel the delegation again and test that the user can delegate again in the next period without any issues
        const cancelTx2 = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await cancelTx2.wait();
        log("\n🎉 Correctly requested to exit the delegation");

        // Ensure that if we fast forward to the next period, the user is still not delegating
        const [periodDuration, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        let blocksMined = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock)
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        tokenDelegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(tokenDelegationStatus).to.equal(0n);

        // Ensure that the user can delegate again without any issues
        const delegateTx2 = await stargateContract
            .connect(user)
            .delegate(tokenId, deployer.address);
        await delegateTx2.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        tokenDelegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(tokenDelegationStatus).to.equal(1n);

        // Fast-forward to the next period
        blocksMined = await fastForwardValidatorPeriods(Number(periodDuration), Number(startBlock));
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        tokenDelegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(tokenDelegationStatus).to.equal(2n);
    });

    it("If delegation is in a pending state, user can switch to a different validator", async () => {
        const { tokenId, delegationId } = await stakeAndDelegateNFT(
            user,
            1, // levelId
            deployer.address,
            stargateNFTContract,
            stargateContract
        );

        // check that the status of the token is pending
        let tokenDelegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(tokenDelegationStatus).to.equal(1n);

        // Add a new validator to the protocol
        const newValidator = (await ethers.getSigners())[5];
        const addValidatorTx = await protocolStakerContract
            .connect(deployer)
            .addValidation(newValidator.address, 12, {
                value: ethers.parseEther("25000000"),
            });
        await addValidatorTx.wait();
        log("\n🎉 Correctly added a new validator to the protocol");

        // Ensure that the new validator is in the queue
        const [activeValidators, queuedValidators] =
            await protocolStakerContract.getValidationsNum();
        expect(activeValidators).to.equal(1);
        expect(queuedValidators).to.equal(1);

        const validatorDetails = await protocolStakerContract.getValidation(newValidator.address);
        expect(validatorDetails[4]).to.equal(1); // 1 = queued

        // Switch to a different validator
        const switchTx = await stargateContract
            .connect(user)
            .delegate(tokenId, newValidator.address);
        await switchTx.wait();
        log("\n🎉 Correctly switched to a new validator");

        // // Ensure the new delegation is pending
        // const newDelegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        // expect(newDelegationId).to.not.equal(delegationId);
        // delegationStatus = await stargateContract.getDelegationStatus(newDelegationId);
        // expect(delegationStatus).to.equal(1n);

        // // Ensure that the previous delegation is still in a exited state
        // delegationStatus = await stargateContract.getDelegationStatus(delegationId);
        // expect(delegationStatus).to.equal(3n);
    });

    it("If delegation is in an active state user cannot switch to a different validator or unstake", async () => {
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1, // levelId
            deployer.address,
            stargateNFTContract,
            stargateContract
        );

        // Fast-forward to the next period
        const [periodDuration, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        let blocksMined = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock)
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Ensure that the delegation is active
        let delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(2n);

        // Try to switch to a different validator
        await expect(
            stargateContract.connect(user).delegate(tokenId, deployer.address)
        ).to.be.revertedWithCustomError(stargateContract, "TokenAlreadyDelegated");

        // Try to unstake the NFT
        await expect(stargateContract.connect(user).unstake(tokenId)).to.be.revertedWithCustomError(
            stargateContract,
            "InvalidDelegationStatus"
        );
    });
});
