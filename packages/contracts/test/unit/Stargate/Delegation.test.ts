import { expect } from "chai";
import {
    MyERC20,
    MyERC20__factory,
    ProtocolStakerMock,
    ProtocolStakerMock__factory,
    Stargate,
    StargateNFTMock,
    StargateNFTMock__factory,
    TokenAuctionMock,
    TokenAuctionMock__factory,
} from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";
import { log } from "../../../scripts/helpers/log";

describe("shard-u2: Stargate: Delegation", () => {
    const VTHO_TOKEN_ADDRESS = "0x0000000000000000000000000000456E65726779";
    let stargateContract: Stargate;
    let stargateNFTMock: StargateNFTMock;
    let protocolStakerMock: ProtocolStakerMock;
    let legacyNodesMock: TokenAuctionMock;
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherUser: HardhatEthersSigner;
    let validator: HardhatEthersSigner;
    let otherValidator: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tx: TransactionResponse;
    let vthoTokenContract: MyERC20;

    const LEVEL_ID = 1;

    const VALIDATOR_STATUS_UNKNOWN = 0;
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

        // Deploy stargateNFT mock
        const stargateNFTMockFactory = new StargateNFTMock__factory(deployer);
        stargateNFTMock = await stargateNFTMockFactory.deploy();
        await stargateNFTMock.waitForDeployment();

        // Deploy VTHO token to the energy address
        const vthoTokenContractFactory = new MyERC20__factory(deployer);
        const tokenContract = await vthoTokenContractFactory.deploy(
            deployer.address,
            deployer.address
        );
        await tokenContract.waitForDeployment();
        const tokenContractBytecode = await ethers.provider.getCode(tokenContract);
        await ethers.provider.send("hardhat_setCode", [VTHO_TOKEN_ADDRESS, tokenContractBytecode]);

        // Deploy legacy nodes mock
        const legacyNodesMockFactory = new TokenAuctionMock__factory(deployer);
        legacyNodesMock = await legacyNodesMockFactory.deploy();
        await legacyNodesMock.waitForDeployment();

        // Deploy contracts
        config.PROTOCOL_STAKER_CONTRACT_ADDRESS = await protocolStakerMock.getAddress();
        config.STARGATE_NFT_CONTRACT_ADDRESS = await stargateNFTMock.getAddress();
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });
        stargateContract = contracts.stargateContract;
        vthoTokenContract = MyERC20__factory.connect(VTHO_TOKEN_ADDRESS, deployer);
        // get stargateNFT errors interface
        user = contracts.otherAccounts[0];
        otherUser = contracts.otherAccounts[1];
        validator = contracts.otherAccounts[2];
        otherValidator = contracts.otherAccounts[3];
        otherAccounts = contracts.otherAccounts;

        // add default validator
        tx = await protocolStakerMock.addValidation(validator.address, 120);
        await tx.wait();

        // set the stargate contract address so it can be used for
        // withdrawals and rewards
        tx = await protocolStakerMock.helper__setStargate(stargateContract.target);
        await tx.wait();
        // set the validator status to active by default so it can be delegated to
        tx = await protocolStakerMock.helper__setValidatorStatus(
            validator.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();

        // add other validator
        tx = await protocolStakerMock.addValidation(otherValidator.address, 120);
        await tx.wait();
        // set the stargate contract address so it can be used for
        // withdrawals and rewards
        tx = await protocolStakerMock.helper__setStargate(stargateContract.target);
        await tx.wait();
        tx = await protocolStakerMock.helper__setValidatorStatus(
            otherValidator.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();

        // set the mock values in the stargateNFTMock contract
        // set get level response
        tx = await stargateNFTMock.helper__setLevel({
            id: LEVEL_ID,
            name: "Strength",
            isX: false,
            maturityBlocks: 10,
            scaledRewardFactor: 150,
            vetAmountRequiredToStake: ethers.parseEther("1"),
        });
        await tx.wait();

        // set get token response
        tx = await stargateNFTMock.helper__setToken({
            tokenId: 10000,
            levelId: LEVEL_ID,
            mintedAtBlock: 0,
            vetAmountStaked: ethers.parseEther("1"),
            lastVetGeneratedVthoClaimTimestamp_deprecated: 0,
        });
        await tx.wait();

        // set the legacy nodes mock
        tx = await stargateNFTMock.helper__setLegacyNodes(legacyNodesMock);
        await tx.wait();

        // mint some VTHO to the stargate contract so it can reward users
        tx = await vthoTokenContract
            .connect(deployer)
            .mint(stargateContract, ethers.parseEther("50000000"));
        await tx.wait();
    });

    it("should assert the initial state", async () => {
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(0n);
        expect(tokenId).to.equal(10000);
        expect(user.address).to.not.be.equal(otherUser.address);
        expect(user.address).to.not.be.equal(deployer.address);
        expect(otherUser.address).to.not.be.equal(deployer.address);
        expect(await stargateNFTMock.isUnderMaturityPeriod(tokenId)).to.be.false;
        expect(await stargateNFTMock.isXToken(tokenId)).to.be.false;
    });

    it("shouldn't be able to delegate a token that does not exist", async () => {
        await expect(stargateContract.delegate(1, validator.address)).to.be.revertedWithCustomError(
            stargateNFTMock,
            "ERC721NonexistentToken"
        );
    });
    it("shouldn't be able to delegate a token that is not owned by the user", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        await expect(
            stargateContract.connect(otherAccounts[2]).delegate(tokenId, validator.address)
        ).to.be.revertedWithCustomError(stargateContract, "UnauthorizedUser");
    });
    it("shouldn't be able to delegate a token that is delegated and active", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        expect(await stargateNFTMock.isUnderMaturityPeriod(tokenId)).to.be.false;
        log("\n🎉 NFT is not under maturity period");

        // delegate the NFT to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", validator.address);

        // set validator completed periods to 2 so the delegation is active
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 2);
        await tx.wait();
        log("\n Set validator completed periods to 2 so the delegation is active");

        // try to delegate the NFT to the validator again
        await expect(
            stargateContract.connect(user).delegate(tokenId, validator.address)
        ).to.be.revertedWithCustomError(stargateContract, "TokenAlreadyDelegated");
    });
    it("shouldn't be able to delegate to a validator whose status is exited", async () => {
        // stake NFT
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        expect(await stargateNFTMock.isUnderMaturityPeriod(tokenId)).to.be.false;
        log("\n🎉 NFT is not under maturity period");

        // set validator status to exited so the delegation fails
        tx = await protocolStakerMock.helper__setValidatorStatus(
            validator.address,
            VALIDATOR_STATUS_EXITED
        );
        await tx.wait();
        log("\n Set validator status to exited so the delegation fails");

        await expect(
            stargateContract.connect(user).delegate(tokenId, validator.address)
        ).to.be.revertedWithCustomError(stargateContract, "ValidatorNotActiveOrQueued");
    });
    it("shouldn't be able to delegate to a validator whose status is unknown", async () => {
        // stake NFT
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        expect(await stargateNFTMock.isUnderMaturityPeriod(tokenId)).to.be.false;
        log("\n🎉 NFT is not under maturity period");

        // set validator status to exited so the delegation fails
        tx = await protocolStakerMock.helper__setValidatorStatus(
            validator.address,
            VALIDATOR_STATUS_UNKNOWN
        );
        await tx.wait();
        log("\n Set validator status to exited so the delegation fails");

        await expect(
            stargateContract.connect(user).delegate(tokenId, validator.address)
        ).to.be.revertedWithCustomError(stargateContract, "ValidatorNotActiveOrQueued");
    });
    it("shouldn't be able to delegate to a validator who requested to exit", async () => {
        // stake NFT
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        expect(await stargateNFTMock.isUnderMaturityPeriod(tokenId)).to.be.false;
        log("\n🎉 NFT is not under maturity period");

        // mock validator requested exit by setting the exit block to any value different from MAX_UINT32
        tx = await protocolStakerMock.helper__setValidationExitBlock(validator.address, 1);
        await tx.wait();
        log("\n Set validator requested exit");

        await expect(
            stargateContract.connect(user).delegate(tokenId, validator.address)
        ).to.be.revertedWithCustomError(stargateContract, "ValidatorNotActiveOrQueued");
    });
    it("shouldn't be able to delegate to delegate a token that is under maturity period", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        tx = await stargateNFTMock.helper__setIsUnderMaturityPeriod(true);
        await tx.wait();
        expect(await stargateNFTMock.isUnderMaturityPeriod(tokenId)).to.be.true;
        log("\n🎉 NFT is under maturity period");

        // try to delegate the NFT to the validator while it is under maturity period
        await expect(
            stargateContract.connect(user).delegate(tokenId, validator.address)
        ).to.be.revertedWithCustomError(stargateContract, "TokenUnderMaturityPeriod");
    });
    it("shouldn't be able to delegate a token that has no levelId", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        tx = await stargateNFTMock.helper__setToken({
            tokenId: tokenId,
            levelId: 0,
            mintedAtBlock: 0,
            vetAmountStaked: ethers.parseEther("1"),
            lastVetGeneratedVthoClaimTimestamp_deprecated: 0,
        });
        await tx.wait();

        // try to delegate the NFT to the validator while it has no levelId
        await expect(
            stargateContract.connect(user).delegate(tokenId, validator.address)
        ).to.be.revertedWithCustomError(stargateContract, "InvalidToken");
    });
    it("should delegate a token that wasnt previously delegated", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the NFT to the validator
        const callTx = stargateContract.connect(user).delegate(tokenId, validator.address);
        await expect(callTx).to.emit(stargateContract, "DelegationInitiated").withArgs(
            tokenId,
            validator.address,
            1n, // new delegation id (1 because it wasnt previously delegated)
            levelSpec.vetAmountRequiredToStake,
            LEVEL_ID,
            100 // probability multiplier
        );
        await expect(callTx).to.not.emit(stargateContract, "DelegationWithdrawn");
        await expect(callTx).to.not.emit(stargateContract, "DelegationExitRequested");
        await expect(callTx).to.not.emit(stargateContract, "DelegationRewardsClaimed");
        log("\n🎉 Correctly delegated the NFT to validator", validator.address);

        // check the delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_PENDING);

        // check the delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);
    });
    it("should delegate a token that was previously delegated and now is exited", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the NFT to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", validator.address);

        // check the delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_PENDING);

        // advance 1 period
        // so the delegation is active
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 1);
        await tx.wait();
        log("\n Set validator completed periods to 1 so the delegation is active");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_ACTIVE
        );

        // request exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Correctly requested to exit the delegation");
        // advance 1 period
        // so the delegation is exited
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 2);
        await tx.wait();
        log("\n Set validator completed periods to 2 so the delegation is exited");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_EXITED
        );

        // Delegate again
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        const callTx = stargateContract.connect(user).delegate(tokenId, validator.address);
        await expect(callTx)
            .to.emit(stargateContract, "DelegationWithdrawn")
            .withArgs(
                tokenId,
                validator.address,
                delegationId,
                levelSpec.vetAmountRequiredToStake,
                levelSpec.id
            );
        await expect(callTx).to.not.emit(stargateContract, "DelegationExitRequested");
        await expect(callTx).to.emit(stargateContract, "DelegationRewardsClaimed").withArgs(
            user.address,
            tokenId,
            delegationId,
            ethers.parseEther("0.1"), // fixed rewards in the mock
            2, // first claimable period, it entered in period 1
            2 // last claimable period, it requested exit in period 2
        );
        await expect(callTx)
            .to.emit(stargateContract, "DelegationInitiated")
            .withArgs(
                tokenId,
                validator.address,
                delegationId + 1n, // new delegation id
                levelSpec.vetAmountRequiredToStake,
                LEVEL_ID,
                100 // probability multiplier
            );
        log("\n🎉 Correctly delegated back the NFT to validator", validator.address);
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_PENDING
        );
    });
    it("should delegate a token that was previously delegated and now is exited without pending rewards", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the NFT to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", validator.address);

        // check the delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_PENDING);

        // advance 1 period
        // so the delegation is active
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 1);
        await tx.wait();
        log("\n Set validator completed periods to 1 so the delegation is active");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_ACTIVE
        );

        // request exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Correctly requested to exit the delegation");
        // advance 1 period
        // so the delegation is exited
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 100);
        await tx.wait();
        log("\n Set validator completed periods to 2 so the delegation is exited");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_EXITED
        );

        // manually claim rewards
        tx = await stargateContract.connect(user).claimRewards(tokenId);
        await tx.wait();
        log("\n🎉 Correctly claimed rewards");

        // Delegate again
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        const callTx = stargateContract.connect(user).delegate(tokenId, validator.address);
        await expect(callTx)
            .to.emit(stargateContract, "DelegationWithdrawn")
            .withArgs(
                tokenId,
                validator.address,
                delegationId,
                levelSpec.vetAmountRequiredToStake,
                levelSpec.id
            );
        await expect(callTx).to.not.emit(stargateContract, "DelegationExitRequested");
        await expect(callTx).to.not.emit(stargateContract, "DelegationRewardsClaimed");
        await expect(callTx)
            .to.emit(stargateContract, "DelegationInitiated")
            .withArgs(
                tokenId,
                validator.address,
                delegationId + 1n, // new delegation id
                levelSpec.vetAmountRequiredToStake,
                LEVEL_ID,
                100 // probability multiplier
            );
        log("\n🎉 Correctly delegated back the NFT to validator", validator.address);
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_PENDING
        );
    });
    it("should delegate a token that was previously delegated and now is pending", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the NFT to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", validator.address);

        // check the delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_PENDING);

        // Delegate again
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        const callTx = stargateContract.connect(user).delegate(tokenId, otherValidator.address);

        // check that the events are emitted correctly
        await expect(callTx).to.emit(stargateContract, "DelegationWithdrawn").withArgs(
            tokenId,
            validator.address, // old validator address
            delegationId,
            levelSpec.vetAmountRequiredToStake,
            levelSpec.id
        );
        await expect(callTx)
            .to.emit(stargateContract, "DelegationExitRequested")
            .withArgs(
                tokenId,
                validator.address, // old validator address
                delegationId,
                await stargateContract.clock()
            );
        await expect(callTx).to.not.emit(stargateContract, "DelegationRewardsClaimed");
        await expect(callTx)
            .to.emit(stargateContract, "DelegationInitiated")
            .withArgs(
                tokenId,
                otherValidator.address,
                delegationId + 1n, // new delegation id
                levelSpec.vetAmountRequiredToStake,
                LEVEL_ID,
                100 // probability multiplier
            );
        log("\n🎉 Correctly delegated back the NFT to validator", validator.address);
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_PENDING
        );
    });
    it("should delegate a token is an X token", async () => {
        // set the level to an X token
        tx = await stargateNFTMock.helper__setLevel({
            id: LEVEL_ID,
            name: "Strength",
            isX: true,
            maturityBlocks: 10,
            scaledRewardFactor: 150,
            vetAmountRequiredToStake: ethers.parseEther("1"),
        });
        await tx.wait();
        // stake the token
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the NFT to the validator
        const callTx = stargateContract.connect(user).delegate(tokenId, validator.address);
        await expect(callTx).to.emit(stargateContract, "DelegationInitiated").withArgs(
            tokenId,
            validator.address,
            1n, // new delegation id (1 because it wasnt previously delegated)
            levelSpec.vetAmountRequiredToStake,
            LEVEL_ID,
            150 // probability multiplier for X tokens is 1.5x
        );
        await expect(callTx).to.not.emit(stargateContract, "DelegationWithdrawn");
        await expect(callTx).to.not.emit(stargateContract, "DelegationExitRequested");
        await expect(callTx).to.not.emit(stargateContract, "DelegationRewardsClaimed");
        log("\n🎉 Correctly delegated the NFT to validator", validator.address);

        // check the delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_PENDING);

        // check the delegation id
        const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
        expect(delegationId).to.not.equal(0);
    });

    it("shouldn't be able to stakeAndDelegate a token with an invalid VET amount", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        await expect(
            stargateContract.connect(user).stakeAndDelegate(LEVEL_ID, validator.address, {
                value: levelSpec.vetAmountRequiredToStake - 1n,
            })
        ).to.be.revertedWithCustomError(stargateContract, "VetAmountMismatch");
    });

    it("should be able to stakeAndDelegate a token", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        const nextTokenId = (await stargateNFTMock.getCurrentTokenId()) + 1n;
        const callTx = stargateContract
            .connect(user)
            .stakeAndDelegate(LEVEL_ID, validator.address, {
                value: levelSpec.vetAmountRequiredToStake,
            });
        await expect(callTx).to.emit(stargateContract, "DelegationInitiated").withArgs(
            nextTokenId,
            validator.address,
            1n, // new delegation id (1 because it wasnt previously delegated)
            levelSpec.vetAmountRequiredToStake,
            LEVEL_ID,
            100 // probability multiplier
        );

        await expect(callTx).to.not.emit(stargateContract, "DelegationWithdrawn");
        await expect(callTx).to.not.emit(stargateContract, "DelegationExitRequested");
        await expect(callTx).to.not.emit(stargateContract, "DelegationRewardsClaimed");
        log("\n🎉 Correctly staked and delegated the NFT to validator", validator.address);

        // check the delegation status
        const delegationStatus = await stargateContract.getDelegationStatus(nextTokenId);
        expect(delegationStatus).to.equal(DELEGATION_STATUS_PENDING);
    });

    it("shouldn't be able to to migrateAndDelegate a token with an invalid VET amount", async () => {
        // Random legacy node id
        const LEGACY_NODE_ID = 1001n;
        // all nodes have the same VET amount required to stake in the mock
        tx = await legacyNodesMock.helper__setMetadata(LEGACY_NODE_ID, {
            owner: user.address,
            strengthLevel: LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        await tx.wait();
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        const callTx = stargateContract
            .connect(user)
            .migrateAndDelegate(LEGACY_NODE_ID, validator.address, {
                value: levelSpec.vetAmountRequiredToStake - 1n,
            });
        await expect(callTx).to.be.revertedWithCustomError(stargateContract, "VetAmountMismatch");
    });

    it("shouldn't be able to to migrateAndDelegate a token if the caller is not the legacy token owner", async () => {
        // Random legacy node id
        const LEGACY_NODE_ID = 1001n;
        // all nodes have the same VET amount required to stake in the mock
        tx = await legacyNodesMock.helper__setMetadata(LEGACY_NODE_ID, {
            owner: user.address,
            strengthLevel: LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        await tx.wait();
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        const callTx = stargateContract
            .connect(otherUser)
            .migrateAndDelegate(LEGACY_NODE_ID, validator.address, {
                value: levelSpec.vetAmountRequiredToStake,
            });
        await expect(callTx).to.be.revertedWithCustomError(stargateContract, "UnauthorizedUser");
    });

    it("should be able to to migrateAndDelegate a token", async () => {
        // Random legacy node id
        const LEGACY_NODE_ID = 1001n;
        // all nodes have the same VET amount required to stake in the mock
        // mock a legacy node in the legacy nodes mock
        // the owner will be used to mint the new NFT
        tx = await legacyNodesMock.helper__setMetadata(LEGACY_NODE_ID, {
            owner: user.address,
            strengthLevel: LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        await tx.wait();
        // get the level spec
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        // call the migrateAndDelegate function
        const callTx = stargateContract
            .connect(user)
            .migrateAndDelegate(LEGACY_NODE_ID, validator.address, {
                value: levelSpec.vetAmountRequiredToStake,
            });

        // check that the events are emitted correctly
        await expect(callTx).to.emit(stargateContract, "DelegationInitiated").withArgs(
            LEGACY_NODE_ID,
            validator.address,
            1n, // new delegation id (1 because it wasnt previously delegated)
            levelSpec.vetAmountRequiredToStake,
            LEVEL_ID,
            100 // probability multiplier
        );
        // check that the events are not emitted because the token was not previously delegated
        await expect(callTx).to.not.emit(stargateContract, "DelegationWithdrawn");
        await expect(callTx).to.not.emit(stargateContract, "DelegationExitRequested");
        await expect(callTx).to.not.emit(stargateContract, "DelegationRewardsClaimed");

        // check that the delegation status is pending
        expect(await stargateContract.getDelegationStatus(LEGACY_NODE_ID)).to.equal(
            DELEGATION_STATUS_PENDING
        );

        // check that the migrate was called and the token was minted to the user
        expect(await stargateNFTMock.ownerOf(LEGACY_NODE_ID)).to.equal(user.address);
    });

    it("shouldn't be able to request a delegation exit if the token does not exist", async () => {
        await expect(
            stargateContract.connect(user).requestDelegationExit(10001n)
        ).to.be.revertedWithCustomError(stargateNFTMock, "ERC721NonexistentToken");
    });
    it("shouldn't be able to request a delegation exit if is not the owner of the token", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        await expect(
            stargateContract.connect(otherUser).requestDelegationExit(tokenId)
        ).to.be.revertedWithCustomError(stargateContract, "UnauthorizedUser");
    });
    it("shouldn't be able to request a delegation exit if the token is not delegated", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        await expect(
            stargateContract.connect(user).requestDelegationExit(tokenId)
        ).to.be.revertedWithCustomError(stargateContract, "DelegationNotFound");
    });
    it("shouldn't be able to request a delegation exit if the delegation is already exited", async () => {
        // stake the token
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the token to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 2);
        await tx.wait();
        log("\n🎉 Set validator completed periods to 2 so the delegation is active");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_ACTIVE
        );

        // request a delegation exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Requested delegation exit");

        // Advance 1 period
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 3);
        await tx.wait();
        log("\n🎉 Set validator completed periods to 3 so the delegation is exited");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_EXITED
        );

        // request a delegation exit again
        await expect(stargateContract.connect(user).requestDelegationExit(tokenId))
            .to.be.revertedWithCustomError(stargateContract, "InvalidDelegationStatus")
            .withArgs(tokenId, DELEGATION_STATUS_EXITED);
    });
    it("shouldn't be able to request a delegation exit if the delegation is already requested to exit", async () => {
        // stake the token
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the token to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 2);
        await tx.wait();
        log("\n🎉 Set validator completed periods to 2 so the delegation is active");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_ACTIVE
        );

        // request a delegation exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Requested delegation exit");

        // request a delegation exit again
        await expect(
            stargateContract.connect(user).requestDelegationExit(tokenId)
        ).to.be.revertedWithCustomError(stargateContract, "DelegationExitAlreadyRequested");
    });
    it("should be able to request a delegation exit if the delegation is pending", async () => {
        // stake the token
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the token to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_PENDING
        );

        // request a delegation exit

        const preExitDelegationDetails = await stargateContract.getDelegationDetails(tokenId);
        // delegation is pending
        expect(preExitDelegationDetails.delegationId).to.equal(1n);
        expect(preExitDelegationDetails.status).to.equal(DELEGATION_STATUS_PENDING);

        const pendingTx = stargateContract.connect(user).requestDelegationExit(tokenId);
        expect(pendingTx)
            .to.emit(stargateContract, "DelegationWithdrawn")
            .withArgs(
                tokenId,
                validator.address,
                1n,
                levelSpec.vetAmountRequiredToStake,
                levelSpec.id
            );
        expect(pendingTx)
            .to.emit(stargateContract, "DelegationExitRequested")
            .withArgs(tokenId, validator.address, 1n, await stargateContract.clock());

        // delegation details should be reset because the delegation was
        // never active
        const delegationDetails = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationDetails.delegationId).to.equal(0);
        expect(delegationDetails.status).to.equal(DELEGATION_STATUS_NONE);
    });
    it("should be able to request a delegation exit if the delegation is active", async () => {
        // stake the token
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the token to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 2);
        await tx.wait();
        log("\n🎉 Set validator completed periods to 2 so the delegation is active");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_ACTIVE
        );

        const preExitDelegationDetails = await stargateContract.getDelegationDetails(tokenId);
        expect(preExitDelegationDetails.delegationId).to.equal(1n);
        expect(preExitDelegationDetails.status).to.equal(DELEGATION_STATUS_ACTIVE);

        const pendingTx = stargateContract.connect(user).requestDelegationExit(tokenId);
        expect(pendingTx).to.not.emit(stargateContract, "DelegationWithdrawn");
        expect(pendingTx)
            .to.emit(stargateContract, "DelegationExitRequested")
            .withArgs(tokenId, validator.address, 1n, await stargateContract.clock());

        const delegationDetails = await stargateContract.getDelegationDetails(tokenId);
        expect(delegationDetails.delegationId).to.equal(1n);
        expect(delegationDetails.status).to.equal(DELEGATION_STATUS_ACTIVE);
    });

    // Test get delegators effective stake
    it("should return the correct delegators effective stake", async () => {
        let currentPeriod = 1n;
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();

        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);
        const token1EffectiveStake = await stargateContract.getEffectiveStake(tokenId);
        // stake another token
        // update level to set a different stake and have a different effective stake
        tx = await stargateNFTMock.helper__setLevel({
            id: LEVEL_ID,
            name: "Strength",
            isX: false,
            maturityBlocks: 10,
            scaledRewardFactor: 150,
            vetAmountRequiredToStake: ethers.parseEther("500"),
        });
        await tx.wait();
        const token2LevelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(otherUser).stake(LEVEL_ID, {
            value: token2LevelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId2 = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked another token with id:", tokenId2);

        const token2EffectiveStake = await stargateContract.getEffectiveStake(tokenId2);

        const delegatorsEffectiveStake = await stargateContract.getDelegatorsEffectiveStake(
            validator.address,
            currentPeriod + 1n
        );
        expect(delegatorsEffectiveStake).to.be.equal(0);
        log("Effective stake before delegate:", 0);

        // delegate the token
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("🎉 Delegated token 1 to validator", validator.address);

        const delegatorsEffectiveStakeAfterDelegate =
            await stargateContract.getDelegatorsEffectiveStake(
                validator.address,
                currentPeriod + 1n // next period this will become effective
            );

        expect(delegatorsEffectiveStakeAfterDelegate).to.be.equal(token1EffectiveStake);

        log("Effective stake after delegate:", delegatorsEffectiveStakeAfterDelegate);

        // delegate the second token
        tx = await stargateContract.connect(otherUser).delegate(tokenId2, validator.address);
        await tx.wait();
        log("🎉 Delegated token 2 to validator", validator.address);

        const delegatorsEffectiveStakeAfterDelegate2 =
            await stargateContract.getDelegatorsEffectiveStake(
                validator.address,
                currentPeriod + 1n // next period this will become effective
            );
        expect(delegatorsEffectiveStakeAfterDelegate2).to.be.equal(
            token1EffectiveStake + token2EffectiveStake
        );

        // avance 4 periods and check that the effective stake is the same
        currentPeriod = 5n;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1n
        );
        await tx.wait();
        log("🎉 Set validator completed periods to 4");

        const delegatorsEffectiveStakeAfterDelegate3 =
            await stargateContract.getDelegatorsEffectiveStake(
                validator.address,
                currentPeriod - 1n // next period this will become effective
            );

        expect(delegatorsEffectiveStakeAfterDelegate3).to.be.equal(
            token1EffectiveStake + token2EffectiveStake
        );

        // request exit of the first token
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("🎉 Requested exit of token 1");

        const delegatorsEffectiveStakeAfterExit =
            await stargateContract.getDelegatorsEffectiveStake(
                validator.address,
                currentPeriod + 1n // next period this will become effective
            );
        expect(delegatorsEffectiveStakeAfterExit).to.be.equal(token2EffectiveStake);
    });

    it("should decrease the effective stake if the validator is exited and the token is unstaked", async () => {
        let currentPeriod = 1n;
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        await stargateContract.connect(user).delegate(tokenId, validator.address);

        await protocolStakerMock.helper__setValidatorStatus(
            validator.address,
            VALIDATOR_STATUS_EXITED
        );

        currentPeriod = 121n;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1n
        );
        await tx.wait();
        log("🎉 Set validator completed periods to 120");

        await stargateContract.connect(user).unstake(tokenId);
        await tx.wait();
        log("🎉 Unstaked token");

        const effectiveStake = await stargateContract.getDelegatorsEffectiveStake(
            validator.address,
            currentPeriod + 1n
        );
        expect(effectiveStake).to.be.equal(0);
    });

    it("should have the correct effective stake if the token is unstaked while the delegation is pending", async () => {
        let currentPeriod = 1n;
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        const tokenEffectiveStake = await stargateContract.getEffectiveStake(tokenId);
        log("\n🎉 Staked token with id:", tokenId);

        await stargateContract.connect(user).delegate(tokenId, validator.address);

        let effectiveStake = await stargateContract.getDelegatorsEffectiveStake(
            validator.address,
            currentPeriod + 1n
        );
        expect(effectiveStake).to.be.equal(tokenEffectiveStake);

        await stargateContract.connect(user).unstake(tokenId);
        await tx.wait();
        log("🎉 Unstaked token");

        effectiveStake = await stargateContract.getDelegatorsEffectiveStake(
            validator.address,
            currentPeriod + 1n
        );
        expect(effectiveStake).to.be.equal(0);
    });

    it("should have the correct effective stake if the validator is changed while the delegation is pending", async () => {
        let currentPeriod = 1n;
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        const tokenEffectiveStake = await stargateContract.getEffectiveStake(tokenId);
        log("\n🎉 Staked token with id:", tokenId);

        await stargateContract.connect(user).delegate(tokenId, validator.address);

        let effectiveStake = await stargateContract.getDelegatorsEffectiveStake(
            validator.address,
            currentPeriod + 1n
        );
        expect(effectiveStake).to.be.equal(tokenEffectiveStake);

        await stargateContract.connect(user).delegate(tokenId, otherValidator.address);
        await tx.wait();
        log("🎉 Delegated token to other validator", otherValidator.address);

        effectiveStake = await stargateContract.getDelegatorsEffectiveStake(
            validator.address,
            currentPeriod + 1n
        );
        expect(effectiveStake).to.be.equal(0);

        const effectiveStakeInOtherValidator = await stargateContract.getDelegatorsEffectiveStake(
            otherValidator.address,
            currentPeriod + 1n
        );
        expect(effectiveStakeInOtherValidator).to.be.equal(tokenEffectiveStake);
    });

    it("should have the correct effective stake if the validator is exited and the delegation is changed to a different validator", async () => {
        let currentPeriod = 1n;
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        const tokenEffectiveStake = await stargateContract.getEffectiveStake(tokenId);
        log("\n🎉 Staked token with id:", tokenId);

        await stargateContract.connect(user).delegate(tokenId, validator.address);

        let effectiveStake = await stargateContract.getDelegatorsEffectiveStake(
            validator.address,
            currentPeriod + 1n
        );
        expect(effectiveStake).to.be.equal(tokenEffectiveStake);

        await protocolStakerMock.helper__setValidatorStatus(
            validator.address,
            VALIDATOR_STATUS_EXITED
        );

        currentPeriod = 121n;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1n
        );
        await tx.wait();
        log("🎉 Set validator completed periods to 120");

        await stargateContract.connect(user).delegate(tokenId, otherValidator.address);
        await tx.wait();
        log("🎉 Delegated token to other validator", otherValidator.address);

        effectiveStake = await stargateContract.getDelegatorsEffectiveStake(
            validator.address,
            currentPeriod + 1n
        );
        expect(effectiveStake).to.be.equal(0);

        const effectiveStakeInOtherValidator = await stargateContract.getDelegatorsEffectiveStake(
            otherValidator.address,
            currentPeriod + 1n
        );
        expect(effectiveStakeInOtherValidator).to.be.equal(tokenEffectiveStake);
    });

    it("should return false if the token hasnt been delegated", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        const hasRequestedExit = await stargateContract.hasRequestedExit(tokenId);
        expect(hasRequestedExit).to.be.false;
    });

    it("should return false if the token has been delegated but not requested to exit", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the token to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        const hasRequestedExit = await stargateContract.hasRequestedExit(tokenId);
        expect(hasRequestedExit).to.be.false;
    });

    it("should return false if the token has been delegated is pending and requested to exit", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the token to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_PENDING
        );

        // request exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Requested exit of token", tokenId);

        const hasRequestedExit = await stargateContract.hasRequestedExit(tokenId);
        // should be false because the delegation exits automatically
        expect(hasRequestedExit).to.be.false;
    });

    it("should return true if the token has been delegated is active and requested to exit", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the token to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        // set the completed periods to 4 so the delegation is active
        let currentPeriod = 5n;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1n
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to 4 so the delegation is active");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_ACTIVE
        );

        // request exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Requested exit of token", tokenId);

        const hasRequestedExit = await stargateContract.hasRequestedExit(tokenId);
        // should be true because the delegation is requested to exit
        expect(hasRequestedExit).to.be.true;
    });

    it("should return true if the delegation is exited", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        // delegate the token to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        // set the completed periods to 4 so the delegation is active
        let currentPeriod = 5n;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1n
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to 4 so the delegation is active");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_ACTIVE
        );

        // request exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Requested exit of token", tokenId);

        // complete 1 period
        currentPeriod = 6n;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1n
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to 5 so the delegation is exited");
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_EXITED
        );

        const hasRequestedExit = await stargateContract.hasRequestedExit(tokenId);
        // should be true because the delegation is exited
        expect(hasRequestedExit).to.be.true;
    });
});
