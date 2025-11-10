import { expect } from "chai";
import { ethers } from "hardhat";
import { StartedTestContainer } from "testcontainers";
import { IProtocolStaker, MyERC20, StargateNFT, Stargate } from "../../typechain-types";
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
} from "../helpers";

describe("shard-i2: Stargate: Delegation", () => {
    let soloContainer: StartedTestContainer;

    let mockedVthoToken: MyERC20;
    let protocolStakerContract: IProtocolStaker;
    let protocolParamsContract: IProtocolParams;
    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;

    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;

    beforeEach(async () => {
        soloContainer = await createThorSoloContainer();

        const contracts = await getOrDeployContracts({ forceDeploy: true });

        mockedVthoToken = contracts.mockedVthoToken;
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

    it("stake > delegate > unstake before delegation is locked: should return predictable delegation data", async () => {
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

        // Assert that user1 is the owner of the NFT, and the NFT is under the maturity period
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;

        // Fast-forward until the NFT is mature
        await mineBlocks(Number(levelSpec.maturityBlocks));
        log("\n🚀 Fast-forwarded", Number(levelSpec.maturityBlocks), "blocks to mature the NFT");

        // Assert that the NFT is mature, so it can be delegated
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.false;

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Snapshot delegation data after delegating the NFT
        log("\n********* AFTER DELEGATING *********");

        const delegation = await stargateContract.getDelegationDetails(tokenId);
        const [validator1, stake1, multiplier1, isLocked1] =
            await protocolStakerContract.getDelegation(delegation.delegationId);
        log("validator1", validator1, "stake1", stake1, "multiplier1", multiplier1);

        const [startPeriod1, endPeriod1] = await protocolStakerContract.getDelegationPeriodDetails(
            delegation.delegationId
        );
        log("startPeriod1", startPeriod1, "endPeriod1", endPeriod1, "isLocked1", isLocked1);

        expect(validator1).to.equal(deployer.address);
        expect(stake1).to.equal(levelVetAmountRequired);
        expect(multiplier1).to.equal(100);
        expect(startPeriod1).to.equal(2);
        expect(endPeriod1).to.equal(2 ** 32 - 1);
        expect(isLocked1).to.be.false;

        // Delegation is not locked, so user can unstake right away
        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        // Snapshot delegation data after withdrawing
        log("\n********* AFTER UNSTAKING *********");

        const [validator2, stake2, multiplier2, isLocked2] =
            await protocolStakerContract.getDelegation(delegation.delegationId);
        log("validator2", validator2, "stake2", stake2, "multiplier2", multiplier2);

        const [startPeriod2, endPeriod2] = await protocolStakerContract.getDelegationPeriodDetails(
            delegation.delegationId
        );
        log("startPeriod2", startPeriod2, "endPeriod2", endPeriod2, "isLocked2", isLocked2);

        expect(validator2).to.equal(validator1); // remains unchanged
        expect(stake2).to.equal(0); // delegation no longer exists
        expect(multiplier2).to.equal(multiplier1); // remains unchanged
        expect(startPeriod2).to.equal(startPeriod1); // remains unchanged
        expect(endPeriod2).to.equal(endPeriod1); // remains unchanged
        expect(isLocked2).to.be.false; // delegation is no longer locked
    });

    it("stake > delegate > exit > unstake: should return predictable delegation data", async () => {
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

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Snapshot delegation data after delegating the NFT
        log("\n********* AFTER DELEGATING *********");

        const delegation = await stargateContract.getDelegationDetails(tokenId);
        const [validator1, stake1, multiplier1, isLocked1] =
            await protocolStakerContract.getDelegation(delegation.delegationId);
        log("validator1", validator1, "stake1", stake1, "multiplier1", multiplier1);

        const [startPeriod1, endPeriod1] = await protocolStakerContract.getDelegationPeriodDetails(
            delegation.delegationId
        );
        log("startPeriod1", startPeriod1, "endPeriod1", endPeriod1, "isLocked1", isLocked1);

        expect(validator1).to.equal(deployer.address);
        expect(stake1).to.equal(levelVetAmountRequired);
        expect(multiplier1).to.equal(100);
        expect(startPeriod1).to.equal(2);
        expect(endPeriod1).to.equal(2 ** 32 - 1);
        expect(isLocked1).to.be.false;

        // Fast-forward to the next period, so that delegation becomes active
        const [period, startBlock, ,] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        const periodsToComplete = 0; // Only fast-forward to the next period
        let blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Snapshot delegation data after becoming active
        log("\n********* AFTER DELEGATION BECOMES ACTIVE *********");

        const [validator2, stake2, multiplier2, isLocked2] =
            await protocolStakerContract.getDelegation(delegation.delegationId);
        log("validator2", validator2, "stake2", stake2, "multiplier2", multiplier2);

        const [startPeriod2, endPeriod2] = await protocolStakerContract.getDelegationPeriodDetails(
            delegation.delegationId
        );
        log("startPeriod2", startPeriod2, "endPeriod2", endPeriod2, "isLocked2", isLocked2);

        expect(validator2).to.equal(validator1); // remains unchanged
        expect(stake2).to.equal(stake1); // remains unchanged
        expect(multiplier2).to.equal(multiplier1); // remains unchanged
        expect(startPeriod2).to.equal(startPeriod1); // remains unchanged
        expect(endPeriod2).to.equal(endPeriod1); // remains unchanged
        expect(isLocked2).to.be.true; // delegation is locked

        // Fast-forward an epoch (ie 1 + 5 blocks)
        await mineBlocks(5);
        log("\n🚀 Fast-forwarded an epoch (+5 blocks)");

        // Request to exit the delegation
        const exitTx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await exitTx.wait();
        log("\n🎉 Correctly requested to exit the delegation");

        // Snapshot delegation data after requesting to exit
        log("\n********* AFTER REQUESTING TO EXIT DELEGATION *********");

        const [validator3, stake3, multiplier3, isLocked3] =
            await protocolStakerContract.getDelegation(delegation.delegationId);
        log("validator3", validator3, "stake3", stake3, "multiplier3", multiplier3);

        const [startPeriod3, endPeriod3] = await protocolStakerContract.getDelegationPeriodDetails(
            delegation.delegationId
        );
        log("startPeriod3", startPeriod3, "endPeriod3", endPeriod3, "isLocked3", isLocked3);

        expect(validator3).to.equal(validator1); // remains unchanged
        expect(stake3).to.equal(stake1); // remains unchanged
        expect(multiplier3).to.equal(multiplier1); // remains unchanged
        expect(startPeriod3).to.equal(startPeriod1); // remains unchanged
        expect(endPeriod3).to.equal(startPeriod1); // endPeriod matches startPeriod
        expect(isLocked3).to.be.true; // delegation remains locked

        // Fast-forward to the next period
        blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Snapshot delegation data after fast-forwarding to the next period
        log("\n********* AFTER EXITING DELEGATION *********");

        const [validator4, stake4, multiplier4, isLocked4] =
            await protocolStakerContract.getDelegation(delegation.delegationId);
        log("validator4", validator4, "stake4", stake4, "multiplier4", multiplier4);

        const [startPeriod4, endPeriod4] = await protocolStakerContract.getDelegationPeriodDetails(
            delegation.delegationId
        );
        log("startPeriod4", startPeriod4, "endPeriod4", endPeriod4, "isLocked4", isLocked4);

        expect(validator4).to.equal(validator1); // remains unchanged
        expect(stake4).to.equal(stake1); // remains unchanged
        expect(multiplier4).to.equal(multiplier1); // remains unchanged
        expect(startPeriod4).to.equal(startPeriod1); // remains unchanged
        expect(endPeriod4).to.equal(endPeriod3); // remains unchanged
        expect(isLocked4).to.be.false; // delegation is no longer locked

        // Withdraw - only effective when user unstakes the NFT
        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        // Snapshot delegation data after withdrawing
        log("\n********* AFTER UNSTAKING *********");

        const [validator5, stake5, multiplier5, isLocked5] =
            await protocolStakerContract.getDelegation(delegation.delegationId);
        log("validator5", validator5, "stake5", stake5, "multiplier5", multiplier5);

        const [startPeriod5, endPeriod5] = await protocolStakerContract.getDelegationPeriodDetails(
            delegation.delegationId
        );
        log("startPeriod5", startPeriod5, "endPeriod5", endPeriod5, "isLocked5", isLocked5);

        expect(validator5).to.equal(validator1); // remains unchanged
        expect(stake5).to.equal(0); // delegation no longer exists
        expect(multiplier5).to.equal(multiplier1); // remains unchanged
        expect(startPeriod5).to.equal(startPeriod1); // remains unchanged
        expect(endPeriod5).to.equal(endPeriod3); // remains unchanged
        expect(isLocked5).to.be.false; // delegation is no longer locked
    });

    it("stake > delegate > unstake before delegation is locked: should have correct VET balances", async () => {
        // Get validator stake
        const [, validatorStake, ,] = await protocolStakerContract.getValidation(deployer.address);

        // Will stake an NFT of level 1
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        const levelVetAmountRequired = levelSpec.vetAmountRequiredToStake;

        // Snapshot balances before staking
        log("\n********* BEFORE STAKING *********");

        const balanceUser1 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance1:", balanceUser1);

        const balanceNFT1 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker1 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol1 = await ethers.provider.getBalance(protocolStakerContract.target);
        log("\n🏦 StargateNFT1", balanceNFT1);
        log("🏦 Stargate1", balanceStaker1);
        log("🏦 ProtocolStaker1", balanceProtocol1);

        expect(balanceUser1).to.be.greaterThan(levelVetAmountRequired);
        expect(balanceNFT1).to.equal(0);
        expect(balanceStaker1).to.equal(0);
        expect(balanceProtocol1).to.equal(validatorStake);

        // Stake an NFT of level 1
        const stakeTx = await stargateContract
            .connect(user)
            .stake(levelId, { value: levelVetAmountRequired });
        await stakeTx.wait();
        log("\n🎉 Correctly staked an NFT of level", levelId);

        // Snapshot balances after staking
        log("\n********* AFTER STAKING *********");

        const balanceUser2 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance2:", balanceUser2);

        const balanceNFT2 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker2 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol2 = await ethers.provider.getBalance(protocolStakerContract.target);
        log("\n🏦 StargateNFT2", balanceNFT2);
        log("🏦 Stargate2", balanceStaker2);
        log("🏦 ProtocolStaker2", balanceProtocol2);

        expect(balanceUser2).to.equal(balanceUser1 - levelVetAmountRequired);
        expect(balanceNFT2).to.equal(0); // no longer has the VET for the NFT
        expect(balanceStaker2).to.equal(levelVetAmountRequired); // has the VET for the NFT
        expect(balanceProtocol2).to.equal(balanceProtocol1); // remains unchanged

        // Assert that user is the owner of the NFT, and the NFT is under the maturity period
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;

        // Fast-forward until the NFT is mature
        await mineBlocks(Number(levelSpec.maturityBlocks));
        log("\n🚀 Fast-forwarded", Number(levelSpec.maturityBlocks), "blocks to mature the NFT");

        // Assert that the NFT is mature, so it can be delegated
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.false;

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Snapshot balances after delegation
        log("\n********* AFTER DELEGATING *********");

        const balanceUser3 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance3:", balanceUser3);

        const balanceNFT3 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker3 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol3 = await ethers.provider.getBalance(protocolStakerContract.target);
        log("\n🏦 StargateNFT3", balanceNFT3);
        log("🏦 Stargate3", balanceStaker3);
        log("🏦 ProtocolStaker3", balanceProtocol3);

        expect(balanceUser3).to.equal(balanceUser2); // remains unchanged
        expect(balanceNFT3).to.equal(0); // no longer has the VET for the NFT
        expect(balanceStaker3).to.equal(0); // remains unchanged
        expect(balanceProtocol3).to.equal(balanceProtocol2 + levelVetAmountRequired); // validator stake + NFT stake

        // Assert delegation is not locked, so user can unstake right away
        const delegation = await stargateContract.getDelegationDetails(tokenId);
        expect(delegation.isLocked).to.be.false;

        // Withdraw - only effective when user unstakes the NFT
        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        // Snapshot balances after unstaking
        log("\n********* AFTER UNSTAKING *********");
        const balanceUser4 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance4:", balanceUser4);

        const balanceNFT4 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker4 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol4 = await ethers.provider.getBalance(protocolStakerContract.target);

        log("\n🏦 StargateNFT4", balanceNFT4);
        log("🏦 Stargate4", balanceStaker4);
        log("🏦 ProtocolStaker4", balanceProtocol4);

        expect(balanceUser4).to.equal(balanceUser1); // VET is back to user
        expect(balanceNFT4).to.equal(0); // remains unchanged
        expect(balanceStaker4).to.equal(0); // remains unchanged
        expect(balanceProtocol4).to.equal(balanceProtocol1); // protocol stake is back to initial balance
    });

    it("stake > delegate > exit > unstake: should have correct VET balances", async () => {
        // Get validator stake
        const [, validatorStake, ,] = await protocolStakerContract.getValidation(deployer.address);

        // Will stake an NFT of level 1
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        const levelVetAmountRequired = levelSpec.vetAmountRequiredToStake;

        // Snapshot balances before staking
        log("\n********* BEFORE STAKING *********");

        const balanceUser1 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance1:", balanceUser1);

        const balanceNFT1 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker1 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol1 = await ethers.provider.getBalance(protocolStakerContract.target);
        log("\n🏦 StargateNFT1", balanceNFT1);
        log("🏦 Stargate1", balanceStaker1);
        log("🏦 ProtocolStaker1", balanceProtocol1);

        expect(balanceUser1).to.be.greaterThan(levelVetAmountRequired);
        expect(balanceNFT1).to.equal(0);
        expect(balanceStaker1).to.equal(0);
        expect(balanceProtocol1).to.equal(validatorStake);

        // Stake an NFT of level 1
        const stakeTx = await stargateContract
            .connect(user)
            .stake(levelId, { value: levelVetAmountRequired });
        await stakeTx.wait();
        log("\n🎉 Correctly staked an NFT of level", levelId);

        // Snapshot balances after staking
        log("\n********* AFTER STAKING *********");

        const balanceUser2 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance2:", balanceUser2);

        const balanceNFT2 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker2 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol2 = await ethers.provider.getBalance(protocolStakerContract.target);
        log("\n🏦 StargateNFT2", balanceNFT2);
        log("🏦 Stargate2", balanceStaker2);
        log("🏦 ProtocolStaker2", balanceProtocol2);

        expect(balanceUser2).to.equal(balanceUser1 - levelVetAmountRequired);
        expect(balanceNFT2).to.equal(0); // now has the VET for the NFT
        expect(balanceStaker2).to.equal(levelVetAmountRequired); // remains unchanged
        expect(balanceProtocol2).to.equal(balanceProtocol1); // remains unchanged

        // Assert that user is the owner of the NFT, and the NFT is under the maturity period
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;

        // Fast-forward until the NFT is mature
        await mineBlocks(Number(levelSpec.maturityBlocks));
        log("\n🚀 Fast-forwarded", Number(levelSpec.maturityBlocks), "blocks to mature the NFT");

        // Assert that the NFT is mature, so it can be delegated
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.false;

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Snapshot balances after delegation
        log("\n********* AFTER DELEGATING *********");

        const balanceUser3 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance3:", balanceUser3);

        const balanceNFT3 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker3 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol3 = await ethers.provider.getBalance(protocolStakerContract.target);
        log("\n🏦 StargateNFT3", balanceNFT3);
        log("🏦 Stargate3", balanceStaker3);
        log("🏦 ProtocolStaker3", balanceProtocol3);

        expect(balanceUser3).to.equal(balanceUser2); // remains unchanged
        expect(balanceNFT3).to.equal(0); // no longer has the VET for the NFT
        expect(balanceStaker3).to.equal(0); // remains unchanged
        expect(balanceProtocol3).to.equal(balanceProtocol2 + levelVetAmountRequired); // validator stake + NFT stake

        // Fast-forward to the next period, so that delegation becomes active
        const [period, startBlock, ,] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        const periodsToComplete = 0; // Only fast-forward to the next period
        let blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Snapshot balances after becoming active - Locked or unlocked is transparent, balances should be the same
        log("\n********* AFTER DELEGATION BECOMES ACTIVE *********");

        const balanceUser4 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance4:", balanceUser4);

        const balanceNFT4 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker4 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol4 = await ethers.provider.getBalance(protocolStakerContract.target);
        log("\n🏦 StargateNFT4", balanceNFT4);
        log("🏦 Stargate4", balanceStaker4);
        log("🏦 ProtocolStaker4", balanceProtocol4);

        expect(balanceUser4).to.equal(balanceUser3); // remains unchanged
        expect(balanceNFT4).to.equal(0); // remains unchanged
        expect(balanceStaker4).to.equal(0); // remains unchanged
        expect(balanceProtocol4).to.equal(balanceProtocol3); // remains unchanged

        // Fast-forward an epoch (ie 1 + 5 blocks)
        await mineBlocks(5);
        log("\n🚀 Fast-forwarded an epoch (+5 blocks)");

        // Request to exit the delegation
        const exitTx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await exitTx.wait();
        log("\n🎉 Correctly requested to exit the delegation");

        // Fast-forward to the next period
        blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Withdraw - only effective when user unstakes the NFT
        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        // Snapshot balances after unstaking
        log("\n********* AFTER UNSTAKING *********");

        const balanceUser5 = await ethers.provider.getBalance(user.address);
        log("\n👛 User balance5:", balanceUser5);

        const balanceNFT5 = await ethers.provider.getBalance(stargateNFTContract.target);
        const balanceStaker5 = await ethers.provider.getBalance(stargateContract.target);
        const balanceProtocol5 = await ethers.provider.getBalance(protocolStakerContract.target);
        log("\n🏦 StargateNFT5", balanceNFT5);
        log("🏦 Stargate5", balanceStaker5);
        log("🏦 ProtocolStaker5", balanceProtocol5);

        expect(balanceUser5).to.equal(balanceUser1); // VET is back to user
        expect(balanceNFT5).to.equal(0); // remains unchanged
        expect(balanceStaker5).to.equal(0); // remains unchanged
        expect(balanceProtocol5).to.equal(balanceProtocol1); // protocol stake is back to initial balance
    });

    it("stake > delegate > unstake before delegation is locked: should have correct stake data", async () => {
        // Get validator stake
        const [, validatorStake, ,] = await protocolStakerContract.getValidation(deployer.address);

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

        // Stargate <> ProtocolStaker
        // Snapshot protocol stake ahead of delegation - should be only the validator stake
        log("\n********* BEFORE DELEGATING *********");
        const [totalStake1, totalWeight1] = await protocolStakerContract.totalStake();
        log("totalStake1", totalStake1, "totalWeight1", totalWeight1);
        expect(totalStake1).to.equal(validatorStake);
        expect(totalWeight1).to.equal(1n * validatorStake);

        const totalQueuedStake1 = await protocolStakerContract.queuedStake();
        log("totalQueuedStake1", totalQueuedStake1);
        expect(totalQueuedStake1).to.equal(0);

        const [, stake1, weight1, queuedStakeAmount1] = await protocolStakerContract.getValidation(
            deployer.address
        );
        log("stake1", stake1, "weight1", weight1, "queuedStakeAmount1", queuedStakeAmount1);
        expect(stake1).to.equal(validatorStake);
        expect(weight1).to.equal(1n * validatorStake);
        expect(queuedStakeAmount1).to.equal(0);

        const [lockedStake1, lockedWeight1, queuedStake1, exitingStake1, nextPeriodWeight1] =
            await protocolStakerContract.getValidationTotals(deployer.address);
        log(
            "lockedStake1",
            lockedStake1,
            "lockedWeight1",
            lockedWeight1,
            "queuedStake1",
            queuedStake1,
            "exitingStake1",
            exitingStake1,
            "nextPeriodWeight1",
            nextPeriodWeight1
        );
        expect(lockedStake1).to.equal(validatorStake);
        expect(lockedWeight1).to.equal(1n * validatorStake);
        expect(queuedStake1).to.equal(0);
        expect(exitingStake1).to.equal(0);
        expect(nextPeriodWeight1).to.equal(1n * validatorStake);

        // Delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Snapshot protocol stake after delegation - should be the validator stake, and the delegated stake is queued
        log("\n********* AFTER DELEGATION *********");
        const [totalStake2, totalWeight2] = await protocolStakerContract.totalStake();
        log("totalStake2", totalStake2, "totalWeight2", totalWeight2);
        expect(totalStake2).to.equal(totalStake1); // remains unchanged
        expect(totalWeight2).to.equal(totalWeight1); // remains unchanged

        const totalQueuedStake2 = await protocolStakerContract.queuedStake();
        log("totalQueuedStake2 *", totalQueuedStake2);
        expect(totalQueuedStake2).to.equal(levelVetAmountRequired); // NFT stake is queued

        const [, stake2, weight2, queuedStakeAmount2] = await protocolStakerContract.getValidation(
            deployer.address
        );
        log("stake2", stake2, "weight2", weight2, "queuedStakeAmount2", queuedStakeAmount2);
        expect(stake2).to.equal(stake1); // remains unchanged
        expect(weight2).to.equal(weight1); // remains unchanged
        expect(queuedStakeAmount2).to.equal(queuedStakeAmount1); // remains unchanged

        const [lockedStake2, lockedWeight2, queuedStake2, exitingStake2, nextPeriodWeight2] =
            await protocolStakerContract.getValidationTotals(deployer.address);
        log(
            "lockedStake2",
            lockedStake2,
            "lockedWeight2",
            lockedWeight2,
            "queuedStake2 *",
            queuedStake2,
            "exitingStake2",
            exitingStake2,
            "nextPeriodWeight2",
            nextPeriodWeight2
        );
        expect(lockedStake2).to.equal(lockedStake1); // remains unchanged
        expect(lockedWeight2).to.equal(lockedWeight1); // remains unchanged
        expect(queuedStake2).to.equal(levelVetAmountRequired); // NFT stake is queued
        expect(exitingStake2).to.equal(0); // remains unchanged
        expect(nextPeriodWeight2).to.equal(2n * lockedWeight2 + levelVetAmountRequired); // validator weight will go up

        // Assert delegation is not locked, so user can unstake right away
        const delegation = await stargateContract.getDelegationDetails(tokenId);
        expect(delegation.isLocked).to.be.false;

        // Withdraw - only effective when user unstakes the NFT
        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        // Snapshot protocol stake after unstaking
        log("\n********* AFTER UNSTAKING *********");
        const [totalStake3, totalWeight3] = await protocolStakerContract.totalStake();
        log("totalStake3", totalStake3, "totalWeight3", totalWeight3);
        expect(totalStake3).to.equal(totalStake1); // will remain unchanged
        expect(totalWeight3).to.equal(totalWeight1); // will remain unchanged

        const totalQueuedStake3 = await protocolStakerContract.queuedStake();
        log("totalQueuedStake3 *", totalQueuedStake3);
        expect(totalQueuedStake3).to.equal(0); // will be reset to 0

        const [, stake3, weight3, queuedStakeAmount3] = await protocolStakerContract.getValidation(
            deployer.address
        );
        log("stake3", stake3, "weight3", weight3, "queuedStakeAmount3", queuedStakeAmount3);
        expect(stake3).to.equal(stake1); // will remain unchanged
        expect(weight3).to.equal(weight1); // will remain unchanged
        expect(queuedStakeAmount3).to.equal(queuedStakeAmount1); // will remain unchanged

        const [lockedStake3, lockedWeight3, queuedStake3, exitingStake3, nextPeriodWeight3] =
            await protocolStakerContract.getValidationTotals(deployer.address);
        log(
            "lockedStake3",
            lockedStake3,
            "lockedWeight3",
            lockedWeight3,
            "queuedStake3 *",
            queuedStake3,
            "exitingStake3",
            exitingStake3,
            "nextPeriodWeight3",
            nextPeriodWeight3
        );
        expect(lockedStake3).to.equal(lockedStake1); // will remain unchanged
        expect(lockedWeight3).to.equal(lockedWeight1); // will remain unchanged
        expect(queuedStake3).to.equal(0); // will be reset to 0
        expect(exitingStake3).to.equal(0); // never changes
        expect(nextPeriodWeight3).to.equal(validatorStake); // never changes
    });

    it("stake > delegate > exit > unstake: should have correct stake data", async () => {
        // Get validator stake
        const [, validatorStake, ,] = await protocolStakerContract.getValidation(deployer.address);

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

        // Stargate <> ProtocolStaker
        // Snapshot protocol stake ahead of delegation - should be only the validator stake
        log("\n********* BEFORE DELEGATING *********");
        const [totalStake1, totalWeight1] = await protocolStakerContract.totalStake();
        log("totalStake1", totalStake1, "totalWeight1", totalWeight1);
        expect(totalStake1).to.equal(validatorStake);
        expect(totalWeight1).to.equal(1n * validatorStake);

        const totalQueuedStake1 = await protocolStakerContract.queuedStake();
        log("totalQueuedStake1", totalQueuedStake1);
        expect(totalQueuedStake1).to.equal(0);

        const [, stake1, weight1, queuedStakeAmount1] = await protocolStakerContract.getValidation(
            deployer.address
        );
        log("stake1", stake1, "weight1", weight1, "queuedStakeAmount1", queuedStakeAmount1);
        expect(stake1).to.equal(validatorStake);
        expect(weight1).to.equal(1n * validatorStake);
        expect(queuedStakeAmount1).to.equal(0);

        const [lockedStake1, lockedWeight1, queuedStake1, exitingStake1, nextPeriodWeight1] =
            await protocolStakerContract.getValidationTotals(deployer.address);
        log(
            "lockedStake1",
            lockedStake1,
            "lockedWeight1",
            lockedWeight1,
            "queuedStake1",
            queuedStake1,
            "exitingStake1",
            exitingStake1,
            "nextPeriodWeight1",
            nextPeriodWeight1
        );
        expect(lockedStake1).to.equal(validatorStake);
        expect(lockedWeight1).to.equal(1n * validatorStake);
        expect(queuedStake1).to.equal(0);
        expect(exitingStake1).to.equal(0);
        expect(nextPeriodWeight1).to.equal(1n * validatorStake);

        // Delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Snapshot protocol stake after delegation - should be the validator stake, and the delegated stake is queued
        log("\n********* AFTER DELEGATION *********");
        const [totalStake2, totalWeight2] = await protocolStakerContract.totalStake();
        log("totalStake2", totalStake2, "totalWeight2", totalWeight2);
        expect(totalStake2).to.equal(totalStake1); // remains unchanged
        expect(totalWeight2).to.equal(totalWeight1); // remains unchanged

        const totalQueuedStake2 = await protocolStakerContract.queuedStake();
        log("totalQueuedStake2 *", totalQueuedStake2);
        expect(totalQueuedStake2).to.equal(levelVetAmountRequired); // NFT stake is queued

        const [, stake2, weight2, queuedStakeAmount2] = await protocolStakerContract.getValidation(
            deployer.address
        );
        log("stake2", stake2, "weight2", weight2, "queuedStakeAmount2", queuedStakeAmount2);
        expect(stake2).to.equal(stake1); // remains unchanged
        expect(weight2).to.equal(weight1); // remains unchanged
        expect(queuedStakeAmount2).to.equal(queuedStakeAmount1); // remains unchanged

        const [lockedStake2, lockedWeight2, queuedStake2, exitingStake2, nextPeriodWeight2] =
            await protocolStakerContract.getValidationTotals(deployer.address);
        log(
            "lockedStake2",
            lockedStake2,
            "lockedWeight2",
            lockedWeight2,
            "queuedStake2 *",
            queuedStake2,
            "exitingStake2",
            exitingStake2,
            "nextPeriodWeight2",
            nextPeriodWeight2
        );
        expect(lockedStake2).to.equal(lockedStake1); // remains unchanged
        expect(lockedWeight2).to.equal(lockedWeight1); // remains unchanged
        expect(queuedStake2).to.equal(levelVetAmountRequired); // NFT stake is queued
        expect(exitingStake2).to.equal(0); // remains unchanged
        expect(nextPeriodWeight2).to.equal(2n * lockedWeight2 + queuedStake2); // validator weight will go up

        // Fast-forward to the next period, so that delegation becomes active
        const [period, startBlock, ,] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        const periodsToComplete = 0; // Only fast-forward to the next period
        let blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Snapshot protocol stake after delegation becomes active - should be the validator stake and the delegated stake, nothing queued
        log("\n********* AFTER DELEGATION BECOMES ACTIVE *********");
        const [totalStake3, totalWeight3] = await protocolStakerContract.totalStake();
        log("totalStake3 *", totalStake3, "totalWeight3 *", totalWeight3);
        expect(totalStake3).to.equal(totalStake1 + totalQueuedStake2); // updated with previously queued stake
        expect(totalWeight3).to.equal(2n * weight2 + totalQueuedStake2); // updated with previously queued weight

        const totalQueuedStake3 = await protocolStakerContract.queuedStake();
        log("totalQueuedStake3 *", totalQueuedStake3);
        expect(totalQueuedStake3).to.equal(0); // reset to 0

        const [, stake3, weight3, queuedStakeAmount3] = await protocolStakerContract.getValidation(
            deployer.address
        );
        log("stake3", stake3, "weight3 *", weight3, "queuedStakeAmount3", queuedStakeAmount3);
        expect(stake3).to.equal(stake1); // remains unchanged
        expect(weight3).to.equal(2n * weight2 + totalQueuedStake2); // updated with previously queued weight
        expect(queuedStakeAmount3).to.equal(0); // remains unchanged

        const [lockedStake3, lockedWeight3, queuedStake3, exitingStake3, nextPeriodWeight3] =
            await protocolStakerContract.getValidationTotals(deployer.address);
        log(
            "lockedStake3 *",
            lockedStake3,
            "lockedWeight3 *",
            lockedWeight3,
            "queuedStake3 *",
            queuedStake3,
            "exitingStake3",
            exitingStake3,
            "nextPeriodWeight3",
            nextPeriodWeight3
        );
        expect(lockedStake3).to.equal(lockedStake1 + queuedStake2); // updated with previously queued stake
        expect(lockedWeight3).to.equal(2n * weight2 + levelVetAmountRequired); // updated with previously queued weight
        expect(queuedStake3).to.equal(0); // reset to 0
        expect(exitingStake3).to.equal(0); // remains unchanged
        expect(nextPeriodWeight3).to.equal(lockedWeight3 + queuedStake3);

        // Fast-forward an epoch (ie 1 + 5 blocks)
        await mineBlocks(5);
        log("\n🚀 Fast-forwarded an epoch (+5 blocks)");

        // Request to exit the delegation
        const exitTx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await exitTx.wait();
        log("\n🎉 Correctly requested to exit the delegation");

        // Snapshot protocol stake after delegation exit request
        log("\n********* AFTER DELEGATION EXIT REQUEST *********");
        const [totalStake4, totalWeight4] = await protocolStakerContract.totalStake();
        log("totalStake4", totalStake4, "totalWeight4", totalWeight4);
        expect(totalStake4).to.equal(totalStake3); // remains unchanged
        expect(totalWeight4).to.equal(totalWeight3); // remains unchanged

        const totalQueuedStake4 = await protocolStakerContract.queuedStake();
        log("totalQueuedStake4", totalQueuedStake4);
        expect(totalQueuedStake4).to.equal(0); // remains unchanged

        const [, stake4, weight4, queuedStakeAmount4] = await protocolStakerContract.getValidation(
            deployer.address
        );
        log("stake4", stake4, "weight4", weight4, "queuedStakeAmount4", queuedStakeAmount4);
        expect(stake4).to.equal(stake1); // remains unchanged
        expect(weight4).to.equal(weight3); // remains unchanged
        expect(queuedStakeAmount4).to.equal(queuedStakeAmount1); // remains unchanged

        const [lockedStake4, lockedWeight4, queuedStake4, exitingStake4, nextPeriodWeight4] =
            await protocolStakerContract.getValidationTotals(deployer.address);
        log(
            "lockedStake4",
            lockedStake4,
            "lockedWeight4",
            lockedWeight4,
            "queuedStake",
            queuedStake4,
            "exitingStake4 *",
            exitingStake4,
            "nextPeriodWeight4",
            nextPeriodWeight4
        );
        expect(lockedStake4).to.equal(lockedStake3); // remains unchanged
        expect(lockedWeight4).to.equal(lockedWeight3); // remains unchanged
        expect(queuedStake4).to.equal(0); // remains unchanged
        expect(exitingStake4).to.equal(levelVetAmountRequired); // NFT stake is exiting
        expect(nextPeriodWeight4).to.equal(1n * validatorStake); // validator weight will go down

        // Fast-forward to the next period
        blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Snapshot protocol stake after delegation exit
        log("\n********* AFTER DELEGATION EXIT *********");
        const [totalStake5, totalWeight5] = await protocolStakerContract.totalStake();
        log("totalStake5 *", totalStake5, "totalWeight5 *", totalWeight5);
        expect(totalStake5).to.equal(totalStake1); // reset to initial state
        expect(totalWeight5).to.equal(totalWeight1); // reset to initial state

        const totalQueuedStake5 = await protocolStakerContract.queuedStake();
        log("totalQueuedStake5", totalQueuedStake5);
        expect(totalQueuedStake5).to.equal(0); // remains unchanged

        const [, stake5, weight5, queuedStakeAmount5] = await protocolStakerContract.getValidation(
            deployer.address
        );
        log("stake5", stake5, "weight5 *", weight5, "queuedStakeAmount5", queuedStakeAmount5);
        expect(stake5).to.equal(stake1); // remains unchanged (never changes)
        expect(weight5).to.equal(weight1); // reset to initial weight
        expect(queuedStakeAmount5).to.equal(0); // remains unchanged (never changes)

        const [lockedStake5, lockedWeight5, queuedStake5, exitingStake5, nextPeriodWeight5] =
            await protocolStakerContract.getValidationTotals(deployer.address);
        log(
            "lockedStake5 *",
            lockedStake5,
            "lockedWeight5 *",
            lockedWeight5,
            "queuedStake5",
            queuedStake5,
            "exitingStake5 *",
            exitingStake5,
            "nextPeriodWeight5",
            nextPeriodWeight5
        );
        expect(lockedStake5).to.equal(lockedStake1); // reset to initial stake
        expect(lockedWeight5).to.equal(lockedWeight1); // reset to initial weight
        expect(queuedStake5).to.equal(0); // remains unchanged
        expect(exitingStake5).to.equal(0); // delegation stake is exiting
        // When there are locked or pending delegations, the protocol internally applies appropriate multipliers
        // when calculating nextPeriodWeight based on delegation types
        expect(nextPeriodWeight5).to.equal(lockedWeight1);

        // Withdraw - only effective when user unstakes the NFT
        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        // The action of unstaking the NFT above is transparent to the stake status,
        // since the NFT stake has already exited the protocol.
    });

    it("stake > delegate > unstake before delegation is locked: should generate 0 delegator rewards and no VTHO", async () => {
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

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Snapshot protocol rewards - should be 0 because delegation is not active yet
        const [period, startBlock, , completedPeriods0] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        log(
            "\n📅 Completed periods:",
            completedPeriods0,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );
        expect(completedPeriods0).to.equal(0);

        const accumulatedRewards0 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods0
        );
        log("🎁 Delegator rewards:", accumulatedRewards0);
        expect(accumulatedRewards0).to.equal(0);

        const vthoBalance0 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance0);
        expect(vthoBalance0).to.equal(0);

        // Assert delegation is not locked, so user can unstake right away
        const delegation = await stargateContract.getDelegationDetails(tokenId);
        expect(delegation.isLocked).to.be.false;

        // Withdraw - only effective when user unstakes the NFT
        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        // Fast-forward to the next period - no rewards should be generated
        const periodsToComplete = 0; // Only fast-forward to the next period
        let blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Get the new period details
        const [, , , completedPeriods1] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        expect(completedPeriods1).to.equal(1);

        // Snapshot protocol rewards
        log(
            "\n📅 Completed periods:",
            completedPeriods1,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );

        const accumulatedRewards1 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods1
        );
        log("🎁 Delegator rewards:", accumulatedRewards1);
        expect(accumulatedRewards1).to.equal(0);

        const vthoBalance1 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance1);
        expect(vthoBalance1).to.equal(0);

        // Fast-forward to the next period - no rewards should be generated
        blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Get the new period details
        const [, , , completedPeriods2] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        expect(completedPeriods2).to.equal(2);

        // Snapshot protocol rewards
        log(
            "\n📅 Completed periods:",
            completedPeriods2,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );

        const accumulatedRewards2 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods2
        );
        log("🎁 Delegator rewards:", accumulatedRewards2);
        expect(accumulatedRewards2).to.equal(0);

        const vthoBalance2 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance2);
        expect(vthoBalance2).to.equal(0);
    });

    it("stake > delegate > exit > unstake: should generate predictable delegator rewards and VTHO", async () => {
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

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Snapshot protocol rewards - should be 0 because delegation is not active yet
        const [period, startBlock, , completedPeriods0] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        log(
            "\n📅 Completed periods:",
            completedPeriods0,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );
        expect(completedPeriods0).to.equal(0);

        const accumulatedRewards0 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods0
        );
        log("🎁 Delegator rewards:", accumulatedRewards0);
        expect(accumulatedRewards0).to.equal(0);

        const vthoBalance0 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance0);
        expect(vthoBalance0).to.equal(0);

        // Fast-forward to the next period, so that delegation becomes active
        const periodsToComplete = 0; // Only fast-forward to the next period
        let blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Get the new period details
        const [, , , completedPeriods1] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        expect(completedPeriods1).to.equal(1);

        // Snapshot protocol rewards after delegation becomes active
        // should return no delegator rewards, but there should be VTHO in the Stargate contract
        log(
            "\n📅 Completed periods:",
            completedPeriods1,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );

        const accumulatedRewards1 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods1
        );
        log("🎁 Delegator rewards:", accumulatedRewards1);
        expect(accumulatedRewards1).to.equal(0);

        const vthoBalance1 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance1);
        expect(vthoBalance1).to.be.greaterThan(vthoBalance0);

        // Fast-forward to the next period
        blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Get the new period details
        const [, , , completedPeriods2] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        expect(completedPeriods2).to.equal(2);

        // Snapshot protocol rewards after delegation has been active for 1 period
        // should return rewards for the period
        log(
            "\n📅 Completed periods:",
            completedPeriods2,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );

        const accumulatedRewards2 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods2
        );
        log("🎁 Delegator rewards:", accumulatedRewards2);
        expect(accumulatedRewards2).to.be.greaterThan(0);

        const vthoBalance2 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance1);
        expect(vthoBalance2).to.be.greaterThan(vthoBalance1);

        // Fast-forward to the next period
        blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Get the new period details
        const [, , , completedPeriods3] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        expect(completedPeriods3).to.equal(3);

        // Snapshot protocol rewards after delegation has been active for 2 periods
        // should return same rewards as the previous period, VTHO has doubled
        log(
            "\n📅 Completed periods:",
            completedPeriods3,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );

        const accumulatedRewards3 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods3
        );
        log("🎁 Delegator rewards:", accumulatedRewards3);
        expect(accumulatedRewards3).to.be.greaterThan(0);

        const vthoBalance3 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance3);
        expect(vthoBalance3).to.be.greaterThan(vthoBalance2);

        // Fast-forward an epoch (ie 1 + 5 blocks)
        await mineBlocks(5);
        log("\n🚀 Fast-forwarded an epoch (+5 blocks)");

        // Request to exit the delegation
        const exitTx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await exitTx.wait();
        log("\n🎉 Correctly requested to exit the delegation");

        // Fast-forward to the next period
        blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Get the new period details
        const [, , , completedPeriods4] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        expect(completedPeriods4).to.equal(4);

        // Snapshot protocol rewards after delegation exit request
        // This is the last period that should generate rewards
        log(
            "\n📅 Completed periods:",
            completedPeriods4,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );

        const accumulatedRewards4 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods4
        );
        log("🎁 Delegator rewards:", accumulatedRewards4);
        expect(accumulatedRewards4).to.be.greaterThan(0);

        const vthoBalance4 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance4);
        expect(vthoBalance4).to.be.greaterThan(vthoBalance3);

        // Fast-forward to the next period
        blocksMined = await fastForwardValidatorPeriods(
            Number(period),
            Number(startBlock),
            periodsToComplete
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // Get the new period details
        const [, , , completedPeriods5] = await protocolStakerContract.getValidationPeriodDetails(
            deployer.address
        );
        expect(completedPeriods5).to.equal(5);

        // Snapshot protocol rewards after delegation exit
        // should be 0 for rewards, VTHO should be the same as the previous period
        log(
            "\n📅 Completed periods:",
            completedPeriods5,
            "(current block:",
            await stargateContract.clock(),
            ")"
        );

        const accumulatedRewards5 = await protocolStakerContract.getDelegatorsRewards(
            deployer.address,
            completedPeriods5
        );
        log("🎁 Delegator rewards:", accumulatedRewards5);
        expect(accumulatedRewards5).to.equal(0);

        // Snapshot VTHO balance after delegation exit, should remain the same as the previous period
        const vthoBalance5 = await mockedVthoToken.balanceOf(stargateContract.target);
        log("💰 VTHO balance of Stargate:", vthoBalance5);
        expect(vthoBalance5).to.be.equal(vthoBalance4);

        // Withdraw - only effective when user unstakes the NFT
        const unstakeTx = await stargateContract.connect(user).unstake(tokenId);
        await unstakeTx.wait();
        log("\n🎉 Correctly unstaked the NFT");

        // The action of unstaking the NFT above is transparent to protocol rewards gen once the delegation is exited§.
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
    //
    // TODO: status is updated correctly when the validator is queued, requests to exit, exited, etc.
    it("Can correctly fetch delegation status", async () => {
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

    it("If delegation is in a pending state, user can unstake the NFT and get the VET back", async () => {
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

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // Assert that the delegation is in a pending state
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(1n);

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
    });

    it("stake > delegate > exit > claim rewards > delegate again: should have correct stake data", async () => {
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

        // Stargate <> ProtocolStaker - delegate the NFT to the validator
        const delegateTx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await delegateTx.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // skipt 1 period
        const [periodDuration, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        const blocksMined = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock),
            0
        );
        log("\n🚀 Fast-forwarded", blocksMined, "blocks to get to the next period");

        // check that delegation is active
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(2n);

        // Request to exit the delegation
        const exitTx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await exitTx.wait();
        log("\n🎉 Correctly requested to exit the delegation");

        // skip 1 period
        const blocksMined2 = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock)
        );
        log("\n🚀 Fast-forwarded", blocksMined2, "blocks to get to the next period");

        // check that delegation is exited
        const delegationStatus2 = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus2).to.equal(3n);

        // claim rewards
        const claimTx = await stargateContract.connect(user).claimRewards(tokenId);
        await claimTx.wait();
        log("\n🎉 Correctly claimed rewards");

        // I do not have any pending rewards
        const pendingRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(pendingRewards).to.equal(0);

        // delegate again
        const delegateTx2 = await stargateContract
            .connect(user)
            .delegate(tokenId, deployer.address);
        await delegateTx2.wait();
        log("\n🎉 Correctly delegated the NFT to validator", deployer.address);

        // check that delegation is pending
        const delegationStatus3 = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus3).to.equal(1n);

        // fast-forward to the next period
        const blocksMined3 = await fastForwardValidatorPeriods(
            Number(periodDuration),
            Number(startBlock)
        );
        log("\n🚀 Fast-forwarded", blocksMined3, "blocks to get to the next period");

        // check that delegation is active
        const delegationStatus4 = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus4).to.equal(2n);
    });
});

// TODO
// review contract balances - missing the final one, after unstake
