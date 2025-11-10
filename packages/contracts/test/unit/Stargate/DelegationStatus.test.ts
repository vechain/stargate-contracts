import { expect } from "chai";
import {
    ProtocolStakerMock,
    ProtocolStakerMock__factory,
    Stargate,
    StargateNFT,
} from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";
import { stakeAndDelegateNFT } from "../../helpers";

describe("shard-u3: Stargate: Delegation Status", () => {
    let stargateContract: Stargate;
    let stargateNFTContract: StargateNFT;
    let protocolStakerMock: ProtocolStakerMock;
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tx: TransactionResponse;

    const VALIDATOR_STATUS_QUEUED = 1;
    const VALIDATOR_STATUS_ACTIVE = 2;
    const VALIDATOR_STATUS_EXITED = 3;

    const DELEGATION_STATUS_NONE = 0;
    const DELEGATION_STATUS_PENDING = 1;
    const DELEGATION_STATUS_ACTIVE = 2;
    const DELEGATION_STATUS_EXITED = 3;

    beforeEach(async () => {
        const config = createLocalConfig();
        [deployer] = await ethers.getSigners();

        // Deploy protocol staker mock
        const protocolStakerMockFactory = new ProtocolStakerMock__factory(deployer);
        protocolStakerMock = await protocolStakerMockFactory.deploy();
        await protocolStakerMock.waitForDeployment();

        // Deploy contracts
        config.PROTOCOL_STAKER_CONTRACT_ADDRESS = await protocolStakerMock.getAddress();
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });
        stargateContract = contracts.stargateContract;
        stargateNFTContract = contracts.stargateNFTContract;
        user = contracts.otherAccounts[0];
        otherAccounts = contracts.otherAccounts;

        // add default validator
        tx = await protocolStakerMock.addValidation(deployer.address, 120);
        await tx.wait();
    });

    it("should test the current status", async () => {
        const validatorDetails = await protocolStakerMock.getValidation(deployer.address);
        expect(validatorDetails._status).to.equal(VALIDATOR_STATUS_QUEUED);
    });

    it("should return NONE if the delegation id is not valid", async () => {
        const delegationStatus = await stargateContract.getDelegationStatus(0);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_NONE);
    });

    it("should return NONE if the validator is not valid", async () => {
        const delegationStatus = await stargateContract.getDelegationStatus(1);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_NONE);
    });

    it("should return PENDING if the delegation hasn't started yet", async () => {
        // set validator to active
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();
        // set validator completed periods to 120
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 120);
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );

        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // get delegation status
        // expect it to be pending
        // because the start period is greater than the completed periods
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_PENDING);

        const delegationOfToken = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationOfToken.status).to.equal(DELEGATION_STATUS_PENDING);
    });

    it("should return ACTIVE if the delegation has started and the validator is active", async () => {
        // set validator to active
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();
        // set validator completed periods to 120
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 120);
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );
        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // set validator completed periods to 240
        // so the completed periods are greater than the start period
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 240);
        await tx.wait();

        // get delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_ACTIVE);

        const delegationOfToken = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationOfToken.status).to.equal(DELEGATION_STATUS_ACTIVE);
    });

    it("should return PENDING if the the validator is QUEUED", async () => {
        // set validator to queued
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_QUEUED
        );
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );

        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // get delegation status
        // expect it to be pending
        // because the validator is QUEUED
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_PENDING);

        const delegationOfToken = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationOfToken.status).to.equal(DELEGATION_STATUS_PENDING);
    });

    it("should return PENDING if the the delegation is PENDING and the validator requested exit", async () => {
        // set validator to active
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();
        // set validator completed periods to 120
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 120);
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );

        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // get delegation status
        const delegationStatusPreSignalExit = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatusPreSignalExit).to.equal(DELEGATION_STATUS_PENDING);

        tx = await protocolStakerMock.signalExit(deployer.address);
        await tx.wait();

        // get delegation status
        const delegationStatusPostSignalExit = await stargateContract.getDelegationStatus(tokenId);

        expect(delegationStatusPostSignalExit).to.equal(DELEGATION_STATUS_PENDING);

        const delegationOfToken = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationOfToken.status).to.equal(DELEGATION_STATUS_PENDING);
    });

    it("should return ACTIVE if the the delegation is ACTIVE and the validator requested exit", async () => {
        // set validator to active
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();
        // set validator completed periods to 120
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 120);
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );

        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // set validator completed periods to 240
        // so the completed periods are greater than the start period
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 240);
        await tx.wait();

        // get delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_ACTIVE);

        tx = await protocolStakerMock.signalExit(deployer.address);
        await tx.wait();

        // get delegation status
        const delegationStatusPostSignalExit = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatusPostSignalExit).to.equal(DELEGATION_STATUS_ACTIVE);

        const delegationOfToken = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationOfToken.status).to.equal(DELEGATION_STATUS_ACTIVE);
    });

    it("should return EXITED if the validator state is EXITED", async () => {
        // set validator to active
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );

        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_EXITED
        );
        await tx.wait();

        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // get delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_EXITED);
    });
    it("should return EXITED if the validator is EXITED and no longer valid", async () => {
        // set validator to active
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );

        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_EXITED
        );
        await tx.wait();

        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // get delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_EXITED);

        const delegationOfToken = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationOfToken.status).to.equal(DELEGATION_STATUS_EXITED);
    });
    it("should return EXITED if the delegation ended", async () => {
        // set validator to active
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();

        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 120);
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );

        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // signal delegation exit
        tx = await protocolStakerMock.signalDelegationExit(delegationId);
        await tx.wait();

        // change the validiation completed periods to 240 so is considered ended
        // because the completed periods are greater than the end period
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 240);
        await tx.wait();
        // get delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_EXITED);

        const delegationOfToken = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationOfToken.status).to.equal(DELEGATION_STATUS_EXITED);
    });

    it("should return EXITED if th user withdrew the staked VET", async () => {
        // set validator to active
        tx = await protocolStakerMock.helper__setValidatorStatus(
            deployer.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();

        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 120);
        await tx.wait();

        // stake and delegate NFT
        const { tokenId } = await stakeAndDelegateNFT(
            user,
            1,
            deployer.address,
            stargateNFTContract,
            stargateContract,
            false
        );

        // get delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);

        // change the validiation completed periods to 240 so is active
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(deployer.address, 240);
        await tx.wait();

        // withdraw the delegation
        tx = await protocolStakerMock.withdrawDelegation(delegationId);
        await tx.wait();

        // get delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_EXITED);

        const delegationOfToken = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationOfToken.status).to.equal(DELEGATION_STATUS_EXITED);
    });
});
