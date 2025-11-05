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
import { EventLog, TransactionResponse, ZeroAddress } from "ethers";
import { log } from "../../../scripts/helpers/log";

describe("shard-u4: Stargate: Rewards", () => {
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

    const REWARDS_PER_PERIOD = 10n ** 17n; // 0.1 VTHO as stated in the mock contract
    const VALIDATOR_STATUS_UNKNOWN = 0;
    const VALIDATOR_STATUS_QUEUED = 1;
    const VALIDATOR_STATUS_ACTIVE = 2;
    const VALIDATOR_STATUS_EXITED = 3;

    const DELEGATION_STATUS_NONE = 0;
    const DELEGATION_STATUS_PENDING = 1;
    const DELEGATION_STATUS_ACTIVE = 2;
    const DELEGATION_STATUS_EXITED = 3;

    const MAX_CLAIMABLE_PERIODS = 8;

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
        config.MAX_CLAIMABLE_PERIODS = MAX_CLAIMABLE_PERIODS;
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

    // Test claim rewards
    it("should be able to claim rewards", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        // fast forward some periods
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 4);
        await tx.wait();
        log("\n🎉 Set validator completed periods to 4");

        const claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.be.greaterThan(0);

        const preClaimBalance = await vthoTokenContract.balanceOf(user.address);
        tx = await stargateContract.connect(user).claimRewards(tokenId);
        await tx.wait();
        await expect(tx)
            .to.emit(stargateContract, "DelegationRewardsClaimed")
            .withArgs(user.address, tokenId, 1, claimableRewards, 2, 4);
        log("\n🎉 Claimed rewards");
        const postClaimBalance = await vthoTokenContract.balanceOf(user.address);
        log("\n💵 Pre claim balance:", preClaimBalance);
        log("\n💵 Post claim balance:", postClaimBalance);
        expect(postClaimBalance).to.be.greaterThan(preClaimBalance);
        expect(postClaimBalance).to.be.equal(claimableRewards + preClaimBalance);
    });
    it("should be able to claim all rewards if the period is higher than the max claimable periods", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        // fast forward some periods
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 28); // 3'5 max claimable periods
        await tx.wait();
        log("\n🎉 Set validator completed periods to 2912");
        // request to exit the delegation
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Requested to exit the delegation");
        // fast forward to the next period
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 29);
        await tx.wait();
        log("\n🎉 Set validator completed periods to 2913");

        // get batches
        const maxClaimablePeriods = await stargateContract.getMaxClaimablePeriods();
        const [firstClaimablePeriod, lastClaimablePeriod] =
            await stargateContract.claimableDelegationPeriods(tokenId);
        const batches = Math.ceil(Number(lastClaimablePeriod) / Number(maxClaimablePeriods));
        log("\nClaimable delegation periods:", lastClaimablePeriod - firstClaimablePeriod + 1n);
        log("\nMax claimable periods:", maxClaimablePeriods);
        log("\nBatches:", batches);

        let totalClaimableRewards = 0n;
        for (let i = 0; i < batches; i++) {
            const claimableRewards = await stargateContract["claimableRewards(uint256,uint32)"](
                tokenId,
                i
            );
            log("\nClaimable rewards for the batch", i, ":", claimableRewards);
            totalClaimableRewards += claimableRewards;
        }
        log("\nTotal claimable rewards:", totalClaimableRewards);

        expect(totalClaimableRewards).to.be.greaterThan(0);

        const preClaimBalance = await vthoTokenContract.balanceOf(user.address);

        for (let i = 0; i < batches; i++) {
            const [firstClaimablePeriod, lastClaimablePeriod] =
                await stargateContract.claimableDelegationPeriods(tokenId);
            log(
                "\nFirst claimable period:",
                firstClaimablePeriod,
                "\nLast claimable period:",
                lastClaimablePeriod
            );
            tx = await stargateContract.connect(user).claimRewards(tokenId);
            const receipt = await tx.wait();
            log("\💰 Claimed rewards for the batch", i);
            const eventLog = receipt!.logs[1] as EventLog;
            log("\n💵 Claimed amount:", eventLog.args[3]);
        }

        const postClaimBalance = await vthoTokenContract.balanceOf(user.address);
        log("\n💵 Pre claim balance:", preClaimBalance);
        log("\n💵 Post claim balance:", postClaimBalance);
        expect(postClaimBalance).to.be.greaterThan(preClaimBalance);
        expect(postClaimBalance).to.be.equal(totalClaimableRewards + preClaimBalance);
    });
    it("should claim 0 rewards if the delegation is pending and there are no claimable periods", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);
        // fast forward to the next period
        // no completed periodd so claimable rewards should be 0
        const preClaimBalance = await vthoTokenContract.balanceOf(user.address);
        const claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.be.equal(0);
        tx = await stargateContract.connect(user).claimRewards(tokenId);
        await tx.wait();
        await expect(tx).to.not.emit(stargateContract, "DelegationRewardsClaimed");
        log("\n💰 Claimed rewards");
        const postClaimBalance = await vthoTokenContract.balanceOf(user.address);
        expect(postClaimBalance).to.be.equal(preClaimBalance);
    });
    it("should claim 0 rewards if the delegation does not exist and there are no claimable periods", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        const preClaimBalance = await vthoTokenContract.balanceOf(user.address);
        const claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.be.equal(0);
        tx = await stargateContract.connect(user).claimRewards(tokenId);
        log("\n💰 Claimed rewards");
        await tx.wait();
        await expect(tx).to.not.emit(stargateContract, "DelegationRewardsClaimed");
        const postClaimBalance = await vthoTokenContract.balanceOf(user.address);
        expect(postClaimBalance).to.be.equal(preClaimBalance);
    });
    it("should be able to claim rewards on behalf of the token owner", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        // fast forward some periods
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 4);
        await tx.wait();
        log("\n🎉 Set validator completed periods to 4");

        const claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.be.greaterThan(0);

        const preClaimUserBalance = await vthoTokenContract.balanceOf(user.address);
        const preClaimOtherUserBalance = await vthoTokenContract.balanceOf(otherUser.address);
        tx = await stargateContract.connect(otherUser).claimRewards(tokenId);
        await tx.wait();
        await expect(tx)
            .to.emit(stargateContract, "DelegationRewardsClaimed")
            .withArgs(user.address, tokenId, 1, claimableRewards, 2, 4);
        log("\n💰 Claimed rewards by other user:", otherUser.address);
        const postClaimUserBalance = await vthoTokenContract.balanceOf(user.address);
        const postClaimOtherUserBalance = await vthoTokenContract.balanceOf(otherUser.address);
        log("\n💵 Pre claim balance:", preClaimUserBalance);
        log("\n💵 Post claim balance:", postClaimUserBalance);
        expect(postClaimUserBalance).to.be.greaterThan(preClaimUserBalance);
        expect(postClaimUserBalance).to.be.equal(claimableRewards + preClaimUserBalance);
        expect(postClaimOtherUserBalance).to.be.equal(preClaimOtherUserBalance);
    });

    // Test claimable rewards
    it("should return the correct claimable rewards", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);
        let claimableRewards: bigint;
        // claimable rewards should be 0
        claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.be.equal(0);

        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.be.equal(0);

        const startPeriod = 2;
        let currentPeriod = 5;
        // fast forward some periods
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.equal(BigInt(currentPeriod - startPeriod) * REWARDS_PER_PERIOD);

        // fast forward some more periods
        currentPeriod = 6;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.equal(BigInt(currentPeriod - startPeriod) * REWARDS_PER_PERIOD);

        // claim rewards
        tx = await stargateContract.connect(user).claimRewards(tokenId);
        await tx.wait();
        await expect(tx)
            .to.emit(stargateContract, "DelegationRewardsClaimed")
            .withArgs(user.address, tokenId, 1, claimableRewards, startPeriod, currentPeriod - 1);
        log("\n💰 Claimed rewards");

        // check that the claimable rewards are 0
        claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.equal(0);
    });
    it("should return the correct claimable rewards for a specific batch", async () => {
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

        let currentPeriod = 28;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        const maxClaimablePeriods = await stargateContract.getMaxClaimablePeriods();

        const batches = Math.ceil(Number(currentPeriod) / Number(maxClaimablePeriods));
        log("\nBatches:", batches);

        for (let i = 0; i < batches; i++) {
            const [firstClaimablePeriod, lastClaimablePeriod] =
                await stargateContract.claimableDelegationPeriods(tokenId);

            const claimableRewards = await stargateContract["claimableRewards(uint256,uint32)"](
                tokenId,
                i
            );

            log("\nClaimable rewards for the batch", i, ":", claimableRewards);

            const batchStart = firstClaimablePeriod + BigInt(i) * maxClaimablePeriods;
            let batchEnd = firstClaimablePeriod + BigInt(i + 1) * maxClaimablePeriods - 1n;

            // Cap the batchEnd if it exceeds the actual last claimable period
            if (batchEnd > lastClaimablePeriod) {
                batchEnd = lastClaimablePeriod;
            }

            const claimablePeriods = batchEnd - batchStart + 1n;

            expect(claimableRewards).to.equal(claimablePeriods * REWARDS_PER_PERIOD);
        }
    });
    it("should clamp the last claimable period if the period is higher than the max claimable periods", async () => {
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

        // fast forward to the next period
        const maxClaimablePeriods = await stargateContract.getMaxClaimablePeriods();
        let currentPeriod = 10;

        // fast forward some periods
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        const claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        log("\n💰 Claimable rewards are max claimable periods times 10**17:", claimableRewards);
        expect(claimableRewards).to.equal(maxClaimablePeriods * REWARDS_PER_PERIOD);
    });

    // Test locked rewards
    it("should return the correct locked rewards when the delegation is active", async () => {
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

        // fast forward to the next period
        let currentPeriod = 5;

        // fast forward some periods
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        expect(await stargateContract.getDelegationStatus(tokenId)).to.be.equal(
            DELEGATION_STATUS_ACTIVE
        );

        // mine half of the period to accumulate some non claimable rewards
        const lockedRewards = await stargateContract.lockedRewards(tokenId);
        log("\n💰 Locked rewards:", lockedRewards);
        expect(lockedRewards).to.be.greaterThan(0);
    });
    it("should return 0 locked rewards when the delegation is exited", async () => {
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

        // fast forward to the next period
        let currentPeriod = 5;

        // fast forward some periods
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        // exit the delegation
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Exited delegation");

        currentPeriod = 6;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        expect(await stargateContract.getDelegationStatus(tokenId)).to.be.equal(
            DELEGATION_STATUS_EXITED
        );

        const lockedRewards = await stargateContract.lockedRewards(tokenId);
        log("\n💰 Locked rewards:", lockedRewards);
        expect(lockedRewards).to.be.equal(0);
    });
    it("should return 0 locked rewards when the delegation is pending", async () => {
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

        expect(await stargateContract.getDelegationStatus(tokenId)).to.be.equal(
            DELEGATION_STATUS_PENDING
        );

        const lockedRewards = await stargateContract.lockedRewards(tokenId);
        log("\n💰 Locked rewards:", lockedRewards);
        expect(lockedRewards).to.be.equal(0);
    });
    it("should return 0 locked rewards when the delegation does not exist", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        expect(await stargateContract.getDelegationStatus(tokenId)).to.be.equal(
            DELEGATION_STATUS_NONE
        );

        const lockedRewards = await stargateContract.lockedRewards(tokenId);
        log("\n💰 Locked rewards:", lockedRewards);
        expect(lockedRewards).to.be.equal(0);
    });

    // Test claimable periods
    it("should return no claimable periods when the delegation does not exist", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        expect(await stargateContract.getDelegationStatus(tokenId)).to.be.equal(
            DELEGATION_STATUS_NONE
        );

        const [firstClaimablePeriod, lastClaimablePeriod] =
            await stargateContract.claimableDelegationPeriods(tokenId);
        expect(firstClaimablePeriod).to.be.equal(0);
        expect(lastClaimablePeriod).to.be.equal(0);
    });
    it("should return no claimable periods when the validator is not valid", async () => {
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

        // set validator to address(0)
        tx = await protocolStakerMock.helper__setDelegationValidator(tokenId, ZeroAddress);
        await tx.wait();
        log("\n🎉 Set validator to address(0)");

        const [firstClaimablePeriod, lastClaimablePeriod] =
            await stargateContract.claimableDelegationPeriods(tokenId);
        expect(firstClaimablePeriod).to.be.equal(0);
        expect(lastClaimablePeriod).to.be.equal(0);
    });
    it("should return no claimable periods when the delegation is pending", async () => {
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

        expect(await stargateContract.getDelegationStatus(tokenId)).to.be.equal(
            DELEGATION_STATUS_PENDING
        );

        const [firstClaimablePeriod, lastClaimablePeriod] =
            await stargateContract.claimableDelegationPeriods(tokenId);
        expect(firstClaimablePeriod).to.be.equal(0);
        expect(lastClaimablePeriod).to.be.equal(0);
    });
    it("should return the correct claimable periods when the delegation is active", async () => {
        let currentPeriod = 1;
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

        // fast forward some periods
        const expectedFirstClaimablePeriod = currentPeriod + 1;

        currentPeriod = 5;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        const [firstClaimablePeriod, lastClaimablePeriod] =
            await stargateContract.claimableDelegationPeriods(tokenId);
        expect(firstClaimablePeriod).to.be.equal(expectedFirstClaimablePeriod);
        expect(lastClaimablePeriod).to.be.equal(currentPeriod - 1);
    });
    it("should return the correct claimable periods when the delegation is exited", async () => {
        let currentPeriod = 1;
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

        // fast forward some periods
        const expectedFirstClaimablePeriod = currentPeriod + 1;

        currentPeriod = 5;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        expect(await stargateContract.getDelegationStatus(tokenId)).to.be.equal(
            DELEGATION_STATUS_ACTIVE
        );

        // request delegation exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();
        log("\n🎉 Requested delegation exit");
        const expectedLastClaimablePeriod = currentPeriod;

        currentPeriod = 6;
        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            validator.address,
            currentPeriod - 1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to ", currentPeriod - 1);

        expect(await stargateContract.getDelegationStatus(tokenId)).to.be.equal(
            DELEGATION_STATUS_EXITED
        );

        const [firstClaimablePeriod, lastClaimablePeriod] =
            await stargateContract.claimableDelegationPeriods(tokenId);
        expect(firstClaimablePeriod).to.be.equal(expectedFirstClaimablePeriod);
        expect(lastClaimablePeriod).to.be.equal(expectedLastClaimablePeriod);
    });

    // Test max claimable periods
    it("should return the correct max claimable periods", async () => {
        const maxClaimablePeriods = await stargateContract.getMaxClaimablePeriods();
        expect(maxClaimablePeriods).to.be.equal(MAX_CLAIMABLE_PERIODS);
    });

    it("should be able to set the max claimable periods", async () => {
        tx = await stargateContract.connect(deployer).setMaxClaimablePeriods(1000);
        await tx.wait();
        const maxClaimablePeriods = await stargateContract.getMaxClaimablePeriods();
        expect(maxClaimablePeriods).to.be.equal(1000);
    });

    it("should revert when trying to set the max claimable periods to 0", async () => {
        await expect(
            stargateContract.connect(deployer).setMaxClaimablePeriods(0)
        ).to.be.revertedWithCustomError(stargateContract, "InvalidMaxClaimablePeriods");
    });

    it("should revert when a non-admin tries to set the max claimable periods", async () => {
        await expect(
            stargateContract.connect(user).setMaxClaimablePeriods(1000)
        ).to.be.revertedWithCustomError(stargateContract, "AccessControlUnauthorizedAccount");
    });

    it("should delegate > validator exits > delegate again > rewards should be automatically claimed", async () => {
        const levelSpec = await stargateNFTMock.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        const tokenId = await stargateNFTMock.getCurrentTokenId();
        log("\n🎉 Staked token with id:", tokenId);

        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(validator.address, 9);
        await tx.wait();
        log("\n🎉 Set validator completed periods to 9");

        const claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.be.greaterThan(0);

        tx = await protocolStakerMock.helper__setValidatorStatus(
            validator.address,
            VALIDATOR_STATUS_EXITED
        );
        await tx.wait();
        log("\n🎉 Set validator status to exited");

        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.be.equal(DELEGATION_STATUS_EXITED);

        tx = await stargateContract.connect(user).delegate(tokenId, otherValidator.address);
        await tx.wait();
        log("\n🎉 Delegated token to validator", validator.address);

        tx = await protocolStakerMock.helper__setValidationCompletedPeriods(
            otherValidator.address,
            1
        );
        await tx.wait();
        log("\n🎉 Set validator completed periods to 1");

        const delegationStatus2 = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus2).to.be.equal(DELEGATION_STATUS_ACTIVE);

        const claimableRewards2 = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards2).to.be.equal(0n);
    });
});
