import { expect } from "chai";
import { StartedTestContainer } from "testcontainers";
import { createThorSoloContainer } from "../helpers/container";
import { IProtocolStaker, MyERC20, StargateNFT, Stargate } from "../../typechain-types";
import { IProtocolParams } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";
import { ethers } from "hardhat";
import { log } from "../helpers/log";
import {
    fastForwardValidatorPeriods,
    getOrDeployContracts,
    mineBlocks,
    stakeAndMatureNFT,
} from "../helpers";

describe("shard-i5: Stargate: Stake NFT", () => {
    let soloContainer: StartedTestContainer;

    let mockedVthoToken: MyERC20;
    let protocolStakerContract: IProtocolStaker;
    let protocolParamsContract: IProtocolParams;
    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;

    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let tx: TransactionResponse;

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
    it("Should be able to stake an NFT of level 1", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        // Snapshot balances before staking
        const userPreStakeBalance = await ethers.provider.getBalance(user.address);
        const StargatePreStakeBalance = await ethers.provider.getBalance(stargateContract.target);

        // Stake an NFT of level 1
        tx = await stargateContract.connect(user).stake(levelId, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 10_000_000,
        });
        await tx.wait();

        // Snapshot balances after staking
        const userPostStakeBalance = await ethers.provider.getBalance(user.address);
        const StargatePostStakeBalance = await ethers.provider.getBalance(stargateContract.target);
        // Get the token id
        const tokenId = await stargateNFTContract.getCurrentTokenId();

        // Assertions
        // User balance should be decreased by the staking amount
        expect(userPostStakeBalance).to.equal(
            userPreStakeBalance - levelSpec.vetAmountRequiredToStake
        );
        // Stargate balance should be increased by the staking amount
        expect(StargatePostStakeBalance).to.equal(
            StargatePreStakeBalance + levelSpec.vetAmountRequiredToStake
        );
        // The token should be owned by the user
        expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);
    });

    it("Should revert when staking with an invalid amount", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        await expect(
            stargateContract
                .connect(user)
                .stake(levelId, { value: levelSpec.vetAmountRequiredToStake - 1n })
        ).to.be.revertedWithCustomError(stargateContract, "VetAmountMismatch");
    });

    it("Should be able to unstake an NFT of level 1 if its mature and not delegated", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        // Snapshot balances before staking
        const userPreStakeBalance = await ethers.provider.getBalance(user.address);
        const StargatePreStakeBalance = await ethers.provider.getBalance(stargateContract.target);
        // Stake an NFT of level 1
        const { tokenId } = await stakeAndMatureNFT(
            user,
            levelId,
            stargateNFTContract,
            stargateContract
        );

        // assert the token is not delegated
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        // NONE is 0
        expect(delegationStatus).to.equal(0n);

        // Unstake the NFT
        tx = await stargateContract.connect(user).unstake(tokenId, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        expect(tx)
            .to.emit(stargateNFTContract, "TokenBurned")
            .withArgs(user.address, levelId, tokenId, levelSpec.vetAmountRequiredToStake);

        // Snapshot balances after unstaking
        const userPostUnstakeBalance = await ethers.provider.getBalance(user.address);
        const StargatePostUnstakeBalance = await ethers.provider.getBalance(
            stargateContract.target
        );

        // Assertions
        // User balance should be increased by the unstaking amount
        await expect(
            stargateNFTContract.connect(user).ownerOf(tokenId)
        ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken");
        // Stargate balance should be equal to the previous balance
        expect(StargatePostUnstakeBalance).to.equal(StargatePreStakeBalance);
        // User balance should be equal to the previous balance
        expect(userPostUnstakeBalance).to.equal(userPreStakeBalance);
    });

    it("Should revert when unstaking an ACTIVE delegated NFT", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);

        // stake an NFT of level 1
        tx = await stargateContract.connect(user).stake(levelId, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 10_000_000,
        });
        await tx.wait();

        await mineBlocks(Number(levelSpec.maturityBlocks));

        const tokenId = await stargateNFTContract.getCurrentTokenId();

        // delegate the NFT to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await tx.wait();

        // fast forward to the next period
        const [periodDuration, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        await fastForwardValidatorPeriods(Number(periodDuration), Number(startBlock), 1);

        // assert the delegation is active (2)
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(2n);
        await expect(stargateContract.connect(user).unstake(tokenId))
            .to.be.revertedWithCustomError(stargateContract, "InvalidDelegationStatus")
            .withArgs(tokenId, 2n);
    });
    it("Should be able to unstake an EXITED delegated NFT", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);

        const StargatePreStakeBalance = await ethers.provider.getBalance(stargateContract.target);
        const userPreStakeBalance = await ethers.provider.getBalance(user.address);
        const userPreStakeVthoBalance = await mockedVthoToken.balanceOf(user.address);

        log("********* BEFORE STAKING *********");
        log("Stargate balance:", StargatePreStakeBalance);
        log("User balance:", userPreStakeBalance);
        log("User VTHO balance:", userPreStakeVthoBalance);
        // stake an NFT of level 1
        tx = await stargateContract.connect(user).stake(levelId, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 10_000_000,
        });
        await tx.wait();

        const StargatePostStakeBalance = await ethers.provider.getBalance(stargateContract.target);
        const userPostStakeBalance = await ethers.provider.getBalance(user.address);

        log("********* AFTER STAKING *********");
        log("Stargate balance:", StargatePostStakeBalance);
        log("User balance:", userPostStakeBalance);

        // assert that the balances are correct
        expect(StargatePostStakeBalance).to.equal(
            StargatePreStakeBalance + levelSpec.vetAmountRequiredToStake
        );
        expect(userPostStakeBalance).to.equal(
            userPreStakeBalance - levelSpec.vetAmountRequiredToStake
        );

        await mineBlocks(Number(levelSpec.maturityBlocks));

        const tokenId = await stargateNFTContract.getCurrentTokenId();

        // delegate the NFT to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await tx.wait();

        // assert that the balances are correct
        const StargatePostDelegateBalance = await ethers.provider.getBalance(
            stargateContract.target
        );
        const userPostDelegateBalance = await ethers.provider.getBalance(user.address);

        log("********* AFTER DELEGATING *********");
        log("Stargate balance:", StargatePostDelegateBalance);
        log("User balance:", userPostDelegateBalance);

        expect(StargatePostDelegateBalance).to.equal(
            StargatePostStakeBalance - levelSpec.vetAmountRequiredToStake
        );
        expect(userPostDelegateBalance).to.equal(userPostStakeBalance);

        // fast forward to the next period
        const [periodDuration, startBlock, ,] =
            await protocolStakerContract.getValidationPeriodDetails(deployer.address);
        await fastForwardValidatorPeriods(Number(periodDuration), Number(startBlock), 1);

        // request to exit the delegation
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();

        // fast forward to the next period
        await fastForwardValidatorPeriods(Number(periodDuration), Number(startBlock), 0);

        // assert the delegation is exited (3)
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(3n);

        // unstake the NFT
        tx = await stargateContract.connect(user).unstake(tokenId);
        await tx.wait();

        const userPostUnstakeBalance = await ethers.provider.getBalance(user.address);
        const StargatePostUnstakeBalance = await ethers.provider.getBalance(
            stargateContract.target
        );
        const userPostUnstakeVthoBalance = await mockedVthoToken.balanceOf(user.address);

        log("********* AFTER UNSTAKING *********");
        log("Stargate balance:", StargatePostUnstakeBalance);
        log("User balance:", userPostUnstakeBalance);
        log("User VTHO balance:", userPostUnstakeVthoBalance);

        // assert the token is not owned by the user
        await expect(
            stargateNFTContract.connect(user).ownerOf(tokenId)
        ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken");

        // assert the delegation is not active
        const delegationStatusAfterUnstake = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatusAfterUnstake).to.equal(0n);

        // assert that thew balances are correct
        expect(userPostUnstakeBalance).to.equal(userPreStakeBalance);
        expect(StargatePostUnstakeBalance).to.equal(StargatePreStakeBalance);
        // assert that the user received the VTHO rewards
        expect(userPostUnstakeVthoBalance).to.be.greaterThan(userPreStakeVthoBalance);
    });

    it("should be able to unstake an NFT a PENDING delegated NFT", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);

        const StargatePreStakeBalance = await ethers.provider.getBalance(stargateContract.target);
        const userPreStakeBalance = await ethers.provider.getBalance(user.address);

        log("********* BEFORE STAKING *********");
        log("Stargate balance:", StargatePreStakeBalance);
        log("User balance:", userPreStakeBalance);

        // stake an NFT of level 1
        tx = await stargateContract.connect(user).stake(levelId, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 10_000_000,
        });
        await tx.wait();

        const StargatePostStakeBalance = await ethers.provider.getBalance(stargateContract.target);
        const userPostStakeBalance = await ethers.provider.getBalance(user.address);

        log("********* AFTER STAKING *********");
        log("Stargate balance:", StargatePostStakeBalance);
        log("User balance:", userPostStakeBalance);

        expect(StargatePostStakeBalance).to.equal(
            StargatePreStakeBalance + levelSpec.vetAmountRequiredToStake
        );
        expect(userPostStakeBalance).to.equal(
            userPreStakeBalance - levelSpec.vetAmountRequiredToStake
        );

        await mineBlocks(Number(levelSpec.maturityBlocks));

        const tokenId = await stargateNFTContract.getCurrentTokenId();

        // delegate the NFT to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await tx.wait();

        const StargatePostDelegateBalance = await ethers.provider.getBalance(
            stargateContract.target
        );
        const userPostDelegateBalance = await ethers.provider.getBalance(user.address);

        log("********* AFTER DELEGATING *********");
        log("Stargate balance:", StargatePostDelegateBalance);
        log("User balance:", userPostDelegateBalance);

        expect(StargatePostDelegateBalance).to.equal(
            StargatePostStakeBalance - levelSpec.vetAmountRequiredToStake
        );
        expect(userPostDelegateBalance).to.equal(userPostStakeBalance);

        // unstake before the delegation is active
        const delegationStatus = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatus).to.equal(1n);

        tx = await stargateContract.connect(user).unstake(tokenId);
        await tx.wait();

        const userPostUnstakeBalance = await ethers.provider.getBalance(user.address);
        const StargatePostUnstakeBalance = await ethers.provider.getBalance(
            stargateContract.target
        );

        log("********* AFTER UNSTAKING *********");
        log("Stargate balance:", StargatePostUnstakeBalance);
        log("User balance:", userPostUnstakeBalance);

        // assert that the balances are correct
        expect(StargatePostUnstakeBalance).to.equal(StargatePreStakeBalance);
        expect(userPostUnstakeBalance).to.equal(userPreStakeBalance);

        // assert that the token is not owned by the user
        await expect(
            stargateNFTContract.connect(user).ownerOf(tokenId)
        ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken");

        // assert that the delegation is not active
        const delegationStatusAfterUnstake = await stargateContract.getDelegationStatus(tokenId);
        expect(delegationStatusAfterUnstake).to.equal(0n);
    });

    it("should not be able to unstake an NFT if its under the maturity period", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        tx = await stargateContract.connect(user).stake(levelId, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 10_000_000,
        });
        await tx.wait();

        const tokenId = await stargateNFTContract.getCurrentTokenId();
        await expect(stargateContract.connect(user).unstake(tokenId)).to.be.revertedWithCustomError(
            stargateContract,
            "TokenUnderMaturityPeriod"
        );
    });
});
