import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { IProtocolStaker, MyERC20, StargateNFT, Stargate } from "../../typechain-types";
import { StartedTestContainer } from "testcontainers";
import { TransactionResponse } from "ethers";
import { ethers } from "hardhat";
import {
    fastForwardValidatorPeriods,
    mineBlocks,
    createThorSoloContainer,
    getOrDeployContracts,
    stakeAndMatureNFT,
    exitDelegation,
} from "../helpers";
import { expect } from "chai";

const GAS_PERCENTAGE = BigInt(2000); // 0,05 %

describe("shard-i3: Stargate: Rewards", () => {
    let soloContainer: StartedTestContainer;
    let stargateContract: Stargate;
    let stargateNFTContract: StargateNFT;
    let protocolStakerContract: IProtocolStaker;
    let mockedVthoToken: MyERC20;
    let deployer: SignerWithAddress;
    let otherAccounts: SignerWithAddress[];
    let tx: TransactionResponse;
    let validator: string;

    beforeEach(async () => {
        soloContainer = await createThorSoloContainer();
        const contracts = await getOrDeployContracts({
            forceDeploy: true,
        });

        stargateContract = contracts.stargateContract;
        stargateNFTContract = contracts.stargateNFTContract;
        protocolStakerContract = contracts.protocolStakerContract;
        mockedVthoToken = contracts.mockedVthoToken;
        deployer = contracts.deployer;
        otherAccounts = contracts.otherAccounts;
        validator = deployer.address;
    });

    afterEach(async () => {
        if (soloContainer) {
            await soloContainer.stop();
        }
    });

    it("user should be able to delegate and accumulate rewards", async () => {
        // stake an NFT of level 1 and wait for it to mature
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // fast forward to the next period + 9
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // check that the rewards are claimable
        expect(await stargateContract["claimableRewards(uint256)"](user1TokenId)).to.be.greaterThan(
            0
        );
    });

    it("user should be able to delegate then exit and stop accumulating rewards after the exit", async () => {
        // stake an NFT of level 1 and wait for it to mature
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // fast forward to the next period + 9
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // request to exit the delegation
        tx = await stargateContract.connect(user1).requestDelegationExit(user1TokenId);
        await tx.wait();
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 0);
        const claimableRewards = await stargateContract["claimableRewards(uint256)"](user1TokenId);
        // fast forward to 10 periods where the user has no rewards to accumulate
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 10);
        // get the claimable periods
        const claimableRewards2 = await stargateContract["claimableRewards(uint256)"](user1TokenId);
        expect(claimableRewards).to.equal(claimableRewards2);
    });

    it("user should be able to delegate and claim all rewards as a only delegator", async () => {
        // stake an NFT of level 1 and wait for it to mature
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // user1 should get rewards for 10 periods
        // fast forward to the next period + 9
        // then request to exit the delegation
        // then fast forward to the next period => user1 should get rewards for 10 periods
        // then claim the rewards
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        // we are in the middle of period 1, we fast forward to the next period + 9
        // so we jump ahead to period 2 + 9 = 11
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // request to exit the delegation
        tx = await stargateContract.connect(user1).requestDelegationExit(user1TokenId);
        await tx.wait();
        // we are in the middle of period 11, we fast forward to the next period
        // completed periods should be 10
        const [, , , completedPeriods1] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        expect(completedPeriods1).to.equal(10);
        // fast forward to the next period
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 0);
        // we are in the middle of period 12, so completed periods should be 11
        const [, , , completedPeriods2] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        expect(completedPeriods2).to.equal(11);
        // get the claimable rewards
        const [firstClaimablePeriod, lastClaimablePeriod] =
            await stargateContract.claimableDelegationPeriods(user1TokenId);

        // we delegated in the middle of period 1, so the first claimable period should be the next period
        // we exited in the middle of period 11, so the 11th period is the last claimable period
        expect(firstClaimablePeriod).to.equal(2);
        expect(lastClaimablePeriod).to.equal(11);

        const preClaimBalance = await mockedVthoToken.balanceOf(user1.address);
        const totalRewards = await stargateContract["claimableRewards(uint256)"](user1TokenId);
        tx = await stargateContract.connect(user1).claimRewards(user1TokenId);
        await tx.wait();

        const postClaimBalance = await mockedVthoToken.balanceOf(user1.address);
        // TODO is 10 VTHO too much to account for gas?
        expect(postClaimBalance).to.be.approximately(
            preClaimBalance + totalRewards,
            totalRewards / GAS_PERCENTAGE
        );
    });

    it("user tries to delegate with unclaimed rewards and it automatically claims the rewards", async () => {
        // stake an NFT of level 1 and wait for it to mature
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        const firstDelegationId = await stargateContract.getDelegationIdOfToken(user1TokenId);
        // user1 should get rewards for 10 periods
        // fast forward to the next period + 9
        // then request to exit the delegation
        // then fast forward to the next period => user1 should get rewards for 10 periods
        // then claim the rewards
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // request to exit the delegation
        tx = await stargateContract.connect(user1).requestDelegationExit(user1TokenId);
        await tx.wait();
        // fast forward to the next period
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 0);
        const preClaimBalance = await mockedVthoToken.balanceOf(user1.address);
        const claimableRewards = await stargateContract["claimableRewards(uint256)"](user1TokenId);
        // try to delegate again
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        // all the rewards should be claimed
        const postClaimBalance = await mockedVthoToken.balanceOf(user1.address);
        const secondDelegationId = await stargateContract.getDelegationIdOfToken(user1TokenId);
        expect(secondDelegationId).to.be.greaterThan(firstDelegationId);
        expect(postClaimBalance).to.be.approximately(
            preClaimBalance + claimableRewards,
            claimableRewards / GAS_PERCENTAGE
        );
    });

    it.skip("User accumulates rewards for 10 periods and then transfers the NFT", async () => {
        // stake an NFT of level 1 and wait for it to mature
        const user1 = otherAccounts[0];
        const user2 = otherAccounts[1];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // accumulate rewards for 10 periods
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // transfer the NFT to the user2
        tx = await stargateNFTContract
            .connect(user1)
            .transferFrom(user1.address, user2.address, user1TokenId);
        await tx.wait();
        // try to claim the rewards
        // expect revert because the user is not the owner of the NFT anymore
        await expect(stargateContract.connect(user1).claimRewards(user1TokenId))
            .to.be.revertedWithCustomError(stargateContract, "UnauthorizedUser")
            .withArgs(user1.address);
        // try to claim the rewards
        const preClaimBalance = await mockedVthoToken.balanceOf(user2.address);
        tx = await stargateContract.connect(user2).claimRewards(user1TokenId);
        await tx.wait();
        const postClaimBalance = await mockedVthoToken.balanceOf(user2.address);
        expect(postClaimBalance).to.be.greaterThan(preClaimBalance);
    });

    it("2 users entering in the same period with the same amount of VET should get the same rewards", async () => {
        // stake an NFT of level 1 and wait for it to mature
        const user1 = otherAccounts[0];
        const user2 = otherAccounts[1];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        const { tokenId: user2TokenId } = await stakeAndMatureNFT(
            user2,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        tx = await stargateContract.connect(user2).delegate(user2TokenId, validator);
        await tx.wait();
        // fast forward to the 9 periods
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // request to exit the delegation
        tx = await stargateContract.connect(user1).requestDelegationExit(user1TokenId);
        await tx.wait();
        tx = await stargateContract.connect(user2).requestDelegationExit(user2TokenId);
        await tx.wait();
        // fast forward to the next period
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 0);
        // claim the rewards
        let user1TotalRewards: bigint = BigInt(0);
        let user2TotalRewards: bigint = BigInt(0);
        // get the pre claim balances
        const user1PreClaimBalance = await mockedVthoToken.balanceOf(user1.address);
        const user2PreClaimBalance = await mockedVthoToken.balanceOf(user2.address);
        // claim the rewards
        user1TotalRewards += await stargateContract["claimableRewards(uint256)"](user1TokenId);
        tx = await stargateContract.connect(user1).claimRewards(user1TokenId);
        await tx.wait();
        user2TotalRewards += await stargateContract["claimableRewards(uint256)"](user2TokenId);
        tx = await stargateContract.connect(user2).claimRewards(user2TokenId);
        await tx.wait();
        // expect the total rewards to be the same for both users
        expect(user1TotalRewards).to.equal(user2TotalRewards);
        // expect the balances to be the same for both users
        const user1Balance = await mockedVthoToken.balanceOf(user1.address);
        const user2Balance = await mockedVthoToken.balanceOf(user2.address);
        // expect the balances to be aproximately the pre claim balances + the total rewards
        expect(user1Balance).to.be.approximately(
            user1PreClaimBalance + user1TotalRewards,
            user1TotalRewards / GAS_PERCENTAGE
        );
        expect(user2Balance).to.be.approximately(
            user2PreClaimBalance + user2TotalRewards,
            user2TotalRewards / GAS_PERCENTAGE
        );
    });

    it("2 users entering in a different period with the same amount of VET should get the scaled rewards", async () => {
        // stake an NFT of level 1 and wait for it to mature
        const user1 = otherAccounts[0];
        const user2 = otherAccounts[1];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        const { tokenId: user2TokenId } = await stakeAndMatureNFT(
            user2,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        // user 1 delegates 10 periods
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // fast forward to the 9 periods
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // user 2 delegates 10 periods
        tx = await stargateContract.connect(user2).delegate(user2TokenId, validator);
        await tx.wait();
        // fast forward to the 9 periods
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // request to exit the delegation
        await exitDelegation(user1, user1TokenId, stargateContract, periodSize, startBlock);
        await exitDelegation(user2, user2TokenId, stargateContract, periodSize, startBlock);
        // fast forward to the next period
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 0);

        // claim the rewards
        let user1TotalRewards: bigint = BigInt(0);
        let user2TotalRewards: bigint = BigInt(0);
        // get the pre claim balances
        const user1PreClaimBalance = await mockedVthoToken.balanceOf(user1.address);
        const user2PreClaimBalance = await mockedVthoToken.balanceOf(user2.address);

        user1TotalRewards += await stargateContract["claimableRewards(uint256)"](user1TokenId);
        tx = await stargateContract.connect(user1).claimRewards(user1TokenId);
        await tx.wait();
        user2TotalRewards += await stargateContract["claimableRewards(uint256)"](user2TokenId);
        tx = await stargateContract.connect(user2).claimRewards(user2TokenId);
        await tx.wait();
        // expect the total rewards to be the same for both users
        expect(user1TotalRewards).to.be.greaterThan(user2TotalRewards);
        // expect the balances to be the same for both users
        const user1Balance = await mockedVthoToken.balanceOf(user1.address);
        const user2Balance = await mockedVthoToken.balanceOf(user2.address);
        // expect the balances to be aproximately the pre claim balances + the total rewards
        expect(user1Balance).to.be.approximately(
            user1PreClaimBalance + user1TotalRewards,
            user1TotalRewards / GAS_PERCENTAGE
        );
        expect(user2Balance).to.be.approximately(
            user2PreClaimBalance + user2TotalRewards,
            user2TotalRewards / GAS_PERCENTAGE
        );
    });

    it("simulate a complex scenario where multiple users come in and out of the validator", async () => {
        /**
         * USER 1 DELEGATES
         * 10 PERIODS PASS
         * USER 2 DELEGATES
         * 5 PERIODS PASS
         * USER 3 DELEGATES
         * USER 1 REQUESTS TO EXIT THE DELEGATION
         * 10 PERIODS PASS
         * USER 2 REQUESTS TO ENTER THE DELEGATION
         * USER 1 DELEGATES (FAILS BECAUSE HAS UNCLAIMED REWARDS)
         * CLAIM PENDING USER 1REWARDS
         * USER 1 DELEGATES AGAIN
         * 10 PERIODS PASS
         * USER 3 EXITS DELEGATION
         * WAIT FOR PERIOD TO END
         * USER 1 CLAIMS REWARDS WHILE DELEGATING
         * USER 2 CLAIMS REWARDS
         * USER 3 CLAIMS REWARDS
         * 10 PERIODS PASS
         * USER 1 EXITS DELEGATION
         * WAIT FOR PERIOD TO END
         * USER 1 CLAIMS REWARDS
         */

        let startBlock: bigint, periodSize: bigint;
        let user1TotalRewards: bigint = BigInt(0);
        let user2TotalRewards: bigint = BigInt(0);
        let user3TotalRewards: bigint = BigInt(0);

        const user1 = otherAccounts[0];
        const user2 = otherAccounts[1];
        const user3 = otherAccounts[2];

        const user1VthoInitialBalance = await mockedVthoToken.balanceOf(user1.address);
        const user2VthoInitialBalance = await mockedVthoToken.balanceOf(user2.address);
        const user3VthoInitialBalance = await mockedVthoToken.balanceOf(user3.address);

        const user1TokenLevelId = 1; // 100 VET
        const user2TokenLevelId = 2; // 500 VET
        const user3TokenLevelId = 3; // 1500 VET
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            user1TokenLevelId,
            stargateNFTContract,
            stargateContract
        );
        const { tokenId: user2TokenId } = await stakeAndMatureNFT(
            user2,
            user2TokenLevelId,
            stargateNFTContract,
            stargateContract
        );
        const { tokenId: user3TokenId } = await stakeAndMatureNFT(
            user3,
            user3TokenLevelId,
            stargateNFTContract,
            stargateContract
        );

        /* USER 1 DELEGATES 10 PERIODS */
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // fast forward 10 periods
        [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 10);

        /* USER 2 DELEGATES 5 PERIODS */
        tx = await stargateContract.connect(user2).delegate(user2TokenId, validator);
        await tx.wait();
        // fast forward 5 periods
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 5);

        /* USER 3 DELEGATES 10 PERIODS */
        /* USER 1 REQUESTS TO EXIT THE DELEGATION */
        tx = await stargateContract.connect(user3).delegate(user3TokenId, validator);
        await tx.wait();
        await exitDelegation(user1, user1TokenId, stargateContract, periodSize, startBlock, false);
        // fast forward 10 periods
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 10);

        /* USER 2 REQUESTS TO EXIT THE DELEGATION */
        /* USER 1 DELEGATES AGAIN */
        // DELEGATE AGAIN
        user1TotalRewards += await stargateContract["claimableRewards(uint256)"](user1TokenId);
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        // claimable rewards should be 0
        const user1Rewards = await stargateContract["claimableRewards(uint256)"](user1TokenId);
        expect(user1Rewards).to.be.equal(0);
        /* USER 2 REQUESTS TO EXIT THE DELEGATION */
        await exitDelegation(user2, user2TokenId, stargateContract, periodSize, startBlock);
        // fast forward 10 periods
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 10);
        /* USER 3 EXITS DELEGATION */
        await exitDelegation(user3, user3TokenId, stargateContract, periodSize, startBlock);
        /* USER 1 CLAIMS REWARDS WHILE DELEGATING */
        user1TotalRewards += await stargateContract["claimableRewards(uint256)"](user1TokenId);
        tx = await stargateContract.connect(user1).claimRewards(user1TokenId, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        /* USER 2 CLAIMS REWARDS */
        user2TotalRewards += await stargateContract["claimableRewards(uint256)"](user2TokenId);
        tx = await stargateContract.connect(user2).claimRewards(user2TokenId, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        /* USER 3 CLAIMS REWARDS */
        user3TotalRewards += await stargateContract["claimableRewards(uint256)"](user3TokenId);
        tx = await stargateContract.connect(user3).claimRewards(user3TokenId, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        // fast forward 10 periods
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 10);
        /* USER 1 EXITS DELEGATION */
        await exitDelegation(user1, user1TokenId, stargateContract, periodSize, startBlock);
        /* USER 1 CLAIMS REWARDS */
        user1TotalRewards += await stargateContract["claimableRewards(uint256)"](user1TokenId);
        tx = await stargateContract.connect(user1).claimRewards(user1TokenId);
        await tx.wait();

        const user1VthoFinalBalance = await mockedVthoToken.balanceOf(user1.address);
        const user2VthoFinalBalance = await mockedVthoToken.balanceOf(user2.address);
        const user3VthoFinalBalance = await mockedVthoToken.balanceOf(user3.address);

        expect(user1VthoFinalBalance).to.be.approximately(
            user1VthoInitialBalance + user1TotalRewards,
            user1TotalRewards / GAS_PERCENTAGE
        );
        // final balance should be greater than the initial balance
        expect(user1VthoFinalBalance).to.be.greaterThan(user1VthoInitialBalance);

        expect(user2VthoFinalBalance).to.be.approximately(
            user2VthoInitialBalance + user2TotalRewards,
            user2TotalRewards / GAS_PERCENTAGE
        );
        // final balance should be greater than the initial balance
        expect(user2VthoFinalBalance).to.be.greaterThan(user2VthoInitialBalance);

        expect(user3VthoFinalBalance).to.be.approximately(
            user3VthoInitialBalance + user3TotalRewards,
            user3TotalRewards / GAS_PERCENTAGE
        );
        // final balance should be greater than the initial balance
        expect(user3VthoFinalBalance).to.be.greaterThan(user3VthoInitialBalance);
    });

    it("should automatically claim rewards when user unstakes the NFT", async () => {
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // fast forward 10 periods
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 10);
        // request to exit the delegation
        tx = await stargateContract.connect(user1).requestDelegationExit(user1TokenId);
        await tx.wait();
        // fast forward to the next period
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 0);
        // unstake the NFT
        const preUnstakeVthoBalance = await mockedVthoToken.balanceOf(user1.address);
        const preUnstakeVetBalance = await ethers.provider.getBalance(user1.address);
        const claimableRewards = await stargateContract["claimableRewards(uint256)"](user1TokenId);
        expect(claimableRewards).to.be.greaterThan(0);
        tx = await stargateContract.connect(user1).unstake(user1TokenId, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        const postUnstakeVetBalance = await ethers.provider.getBalance(user1.address);
        const postUnstakeVthoBalance = await mockedVthoToken.balanceOf(user1.address);
        expect(postUnstakeVthoBalance).to.be.approximately(
            preUnstakeVthoBalance + claimableRewards,
            claimableRewards / GAS_PERCENTAGE
        );
        expect(postUnstakeVetBalance).to.be.greaterThan(preUnstakeVetBalance);
        await expect(stargateNFTContract.ownerOf(user1TokenId)).to.be.revertedWithCustomError(
            stargateNFTContract,
            "ERC721NonexistentToken"
        );
    });

    it("should be able to unstake the NFT if the user has no rewards", async () => {
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // fast forward 10 periods
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 0);
        // unstake the NFT
        const preUnstakeVetBalance = await ethers.provider.getBalance(user1.address);
        tx = await stargateContract.connect(user1).unstake(user1TokenId, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        const postUnstakeVetBalance = await ethers.provider.getBalance(user1.address);
        await expect(stargateNFTContract.ownerOf(user1TokenId)).to.be.revertedWithCustomError(
            stargateNFTContract,
            "ERC721NonexistentToken"
        );
        expect(postUnstakeVetBalance).to.be.greaterThan(preUnstakeVetBalance);
    });

    it("locked rewards should be greater than zero", async () => {
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // fast forward 10 periods
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 10);
        // mine half of the period to accumulate some non claimable rewards
        mineBlocks(Number(periodSize) / 2);
        // ensure that the delegation is active
        expect(await stargateContract.getDelegationStatus(user1TokenId)).to.equal(2n);
        // get the accumulated rewards and claimable rewards
        const lockedRewards = await stargateContract.lockedRewards(user1TokenId);
        // accumulated rewards should be greater than claimable rewards
        expect(lockedRewards).to.be.greaterThan(0);
    });

    it("should generate approximately the same rewards when claiming all at once", async () => {
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // fast forward 10 periods
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 10);
        // claim the rewards
        const firstClaimedAmount =
            await stargateContract["claimableRewards(uint256)"](user1TokenId);
        tx = await stargateContract.connect(user1).claimRewards(user1TokenId);
        await tx.wait();

        // finish the current period and fast forward 9 periods => total 10 periods
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 9);
        // claim the rewards
        const allClaimableAmount =
            await stargateContract["claimableRewards(uint256)"](user1TokenId);
        expect(firstClaimedAmount).to.be.equal(allClaimableAmount);
    });

    // test is skipped because it takes too long to run
    // it can be run manually if needed
    it.skip("ensure that the recursive functions dont run out of gas in 208 periods (2 years)", async () => {
        const user1 = otherAccounts[0];
        const levelId = 1;
        const { tokenId: user1TokenId } = await stakeAndMatureNFT(
            user1,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        // delegate the NFT to the validator
        tx = await stargateContract.connect(user1).delegate(user1TokenId, validator);
        await tx.wait();
        // fast forward 208 periods
        const [periodSize, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(validator);
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 208);
        // claim the rewards
        const claimableRewards = await stargateContract["claimableRewards(uint256)"](user1TokenId);
        const preClaimBalance = await mockedVthoToken.balanceOf(user1.address);
        // claim the rewards
        tx = await stargateContract.connect(user1).claimRewards(user1TokenId, {
            gasLimit: 40_000_000,
        });
        await tx.wait();
        const postClaimBalance = await mockedVthoToken.balanceOf(user1.address);
        expect(postClaimBalance).to.be.greaterThan(preClaimBalance);
        expect(postClaimBalance - preClaimBalance).to.be.approximately(
            claimableRewards,
            claimableRewards / GAS_PERCENTAGE
        );
    });

    // TODO: stake and delegate
    it("Should be able to stake and delegate a NFT and claim accumulated rewards", async () => {
        const user = otherAccounts[0];

        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        const boostAmount = await stargateNFTContract.boostAmountOfLevel(levelId);

        // Approve the boost amount
        tx = await mockedVthoToken.connect(user).approve(stargateNFTContract.target, boostAmount);
        await tx.wait();

        // Stake an NFT of level 1
        tx = await stargateContract.connect(user).stakeAndDelegate(levelId, deployer.address, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 40_000_000,
        });
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        // wait some periods
        const [periodDuration, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        await fastForwardValidatorPeriods(Number(periodDuration), Number(startBlock), 10);
        const claimableRewards = await stargateContract["claimableRewards(uint256)"](tokenId);
        expect(claimableRewards).to.be.greaterThan(0);

        const vthoBalanceBeforeClaim = await mockedVthoToken.balanceOf(user);

        // claim accumulated rewards
        tx = await stargateContract.connect(user).claimRewards(tokenId);
        await tx.wait();

        const vthoBalanceAfterClaim = await mockedVthoToken.balanceOf(user);
        expect(vthoBalanceAfterClaim).to.be.greaterThan(vthoBalanceBeforeClaim);
    });
});
