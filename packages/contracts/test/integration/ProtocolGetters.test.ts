import { expect } from "chai";
import { ethers } from "hardhat";
import { StartedTestContainer } from "testcontainers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { IProtocolParams, IProtocolStaker, Stargate } from "../../typechain-types";
import { compareAddresses } from "@repo/utils/AddressUtils";
import {
    createThorSoloContainer,
    getOrDeployContracts,
    fastForwardValidatorPeriods,
    MAX_UINT32,
} from "../helpers";

describe("shard-i1: Protocol Contracts Getters", () => {
    let soloContainer: StartedTestContainer;

    const validatorMinStake = ethers.parseEther("25000000");

    let protocolStakerContract: IProtocolStaker;
    let protocolParamsContract: IProtocolParams;
    let stargateContract: Stargate;
    let deployer: HardhatEthersSigner;
    let validatorAddress: string;

    // not using beforeEach as we don't update the contract state
    before(async () => {
        soloContainer = await createThorSoloContainer();

        const contracts = await getOrDeployContracts({
            forceDeploy: true,
        });

        protocolStakerContract = contracts.protocolStakerContract;
        protocolParamsContract = contracts.protocolParamsContract;
        stargateContract = contracts.stargateContract;
        deployer = contracts.deployer;
    });

    after(async () => {
        if (soloContainer) {
            await soloContainer.stop();
        }
    });

    it("should be able to get the stargate contract address from the protocol params contract", async () => {
        const paramsKey = "0x00000000000064656c656761746f722d636f6e74726163742d61646472657373";
        const stargateAddress = await protocolParamsContract.get(paramsKey);

        const expectedParamsVal = BigInt(await stargateContract.getAddress());
        expect(stargateAddress).to.equal(expectedParamsVal);
    });

    it("should have a known address for the first active validator", async () => {
        validatorAddress = await protocolStakerContract.firstActive();
        expect(compareAddresses(validatorAddress, deployer.address)).to.be.true;
    });

    it("should have no other active validators", async () => {
        const nextActive = await protocolStakerContract.next(validatorAddress);
        expect(nextActive).to.equal(ethers.ZeroAddress);
    });

    it("should have a total of 1 active and 0 queued validators", async () => {
        const [leaderGroupSize, queuedValidators] =
            await protocolStakerContract.getValidationsNum();
        expect(leaderGroupSize).to.equal(1);
        expect(queuedValidators).to.equal(0);
    });

    it("should have no validators queued", async () => {
        const firstQueued = await protocolStakerContract.firstQueued();
        expect(firstQueued).to.equal(ethers.ZeroAddress);
    });

    it("should have a total stake and weight of 25M VET", async () => {
        const [totalStake, totalWeight] = await protocolStakerContract.totalStake();

        expect(totalStake).to.equal(validatorMinStake);
        expect(totalWeight).to.equal(1n * validatorMinStake);
    });

    it("should have a queued stake of 0", async () => {
        const queuedStake = await protocolStakerContract.queuedStake();

        expect(queuedStake).to.equal(0);
    });

    it("should be able to get stake details for the first active validator", async () => {
        const [endorsor, stake, weight, queuedStakeAmount] =
            await protocolStakerContract.getValidation(validatorAddress);

        expect(endorsor).to.equal(validatorAddress);
        expect(stake).to.equal(validatorMinStake);
        expect(weight).to.equal(1n * validatorMinStake);
        expect(queuedStakeAmount).to.equal(0);
    });

    it("should be able to get status details for the first active validator", async () => {
        const [endorser, stake, weight, queuedStake, status, offlineBlock] =
            await protocolStakerContract.getValidation(validatorAddress);

        // https://github.com/vechain/thor/blob/06b06a4dc759661e1681ccfb02f930604f221ad3/thorclient/builtin/staker.go#L28
        expect(status).to.equal(2); // 2 Active
        expect(offlineBlock).to.equal(MAX_UINT32);
    });

    it("should be able to get period details for the first active validator", async () => {
        const [period, startBlock, exitBlock, completedPeriods] =
            await protocolStakerContract.getValidationPeriodDetails(validatorAddress);

        expect(period).to.equal(90);
        expect(startBlock).to.equal(0);
        expect(exitBlock).to.equal(2 ** 32 - 1);
        expect(completedPeriods).to.equal(0);
    });

    it("should be able to fast-forward to the next period", async () => {
        const [period, startBlock, , completedPeriods] =
            await protocolStakerContract.getValidationPeriodDetails(validatorAddress);

        // fast-forward to the next period
        const periodsToComplete = 0; // Only fast-forward to the next period
        const blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );

        // get the new period details
        const [, , , newCompletedPeriods] =
            await protocolStakerContract.getValidationPeriodDetails(validatorAddress);

        expect(newCompletedPeriods).to.equal(Number(completedPeriods) + 1);
    });

    it("should return 0 rewards for all completed periods since there are 0 delegations", async () => {
        const [, , , completedPeriods] =
            await protocolStakerContract.getValidationPeriodDetails(validatorAddress);

        for (let i = 0; i < Number(completedPeriods); i++) {
            const rewards = await protocolStakerContract.getDelegatorsRewards(validatorAddress, i);
            expect(rewards).to.equal(0);
        }
    });

    it("should return 0 as the withdrawable amount for the first active validator since they did not request to exit", async () => {
        const withdrawable = await protocolStakerContract.getWithdrawable(validatorAddress);
        expect(withdrawable).to.equal(0);
    });

    it("should be able to query validation totals for the first active validator", async () => {
        const [lockedStake, lockedWeight, queuedStake, exitingStake, nextPeriodWeight] =
            await protocolStakerContract.getValidationTotals(validatorAddress);
        expect(lockedStake).to.equal(validatorMinStake);
        expect(lockedWeight).to.equal(1n * validatorMinStake);
        expect(queuedStake).to.equal(0);
        expect(exitingStake).to.equal(0);
        expect(nextPeriodWeight).to.equal(lockedStake);
    });
});
