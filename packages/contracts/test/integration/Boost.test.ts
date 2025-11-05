import { expect } from "chai";
import { StartedTestContainer } from "testcontainers";
import { Errors, StargateNFT, Stargate } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse, ZeroAddress } from "ethers";
import {
    createThorSoloContainer,
    getOrDeployContracts,
    getStargateNFTErrorsInterface,
    mineBlocks,
    stakeAndMatureNFT,
    stakeNFT,
} from "../helpers";
import { ethers } from "hardhat";
import { MyERC20 } from "../../typechain-types";

describe("shard-i4: Boost Maturity Period", () => {
    let soloContainer: StartedTestContainer;

    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;
    let vthoTokenContract: MyERC20;

    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherUser: HardhatEthersSigner;
    let stargateNftErrors: Errors;
    let tx: TransactionResponse;

    beforeEach(async () => {
        soloContainer = await createThorSoloContainer();

        const contracts = await getOrDeployContracts({ forceDeploy: true });
        stargateNFTContract = contracts.stargateNFTContract;
        stargateContract = contracts.stargateContract;
        vthoTokenContract = contracts.mockedVthoToken;

        deployer = contracts.deployer;
        user = contracts.otherAccounts[0];
        otherUser = contracts.otherAccounts[1];
        stargateNftErrors = await getStargateNFTErrorsInterface();
    });

    afterEach(async () => {
        if (soloContainer) {
            await soloContainer.stop();
        }
    });

    it("Should be able to stake and delegate a NFT with boost", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        const boostAmount = await stargateNFTContract.boostAmountOfLevel(levelId);

        // Approve the boost amount
        tx = await vthoTokenContract.connect(user).approve(stargateNFTContract.target, boostAmount);
        await tx.wait();

        // Stake an NFT of level 1
        tx = await stargateContract.connect(user).stakeAndDelegate(levelId, deployer.address, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 10_000_000,
        });
        await tx.wait();

        const tokenId = await stargateNFTContract.getCurrentTokenId();
        expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.false;
        expect(await stargateContract.getDelegationIdOfToken(tokenId)).to.equal(1);
    });

    it("Should be able to boost a NFT an already minted NFT", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);

        tx = await stargateContract.connect(user).stake(levelId, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 10_000_000,
        });
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        const boostAmount = await stargateNFTContract.boostAmount(tokenId);

        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;

        // Approve the boost amount
        tx = await vthoTokenContract.connect(user).approve(stargateNFTContract.target, boostAmount);
        await tx.wait();

        tx = await stargateNFTContract.connect(user).boost(tokenId, {
            gasLimit: 10_000_000,
        });
        await tx.wait();

        expect(
            await vthoTokenContract.allowance(user.address, stargateNFTContract.target)
        ).to.lessThan(boostAmount);
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.false;
    });

    it("Shouldn't be able to boost an already matured NFT", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        const { tokenId } = await stakeAndMatureNFT(
            user,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        const boostAmount = await stargateNFTContract.boostAmount(tokenId);

        tx = await vthoTokenContract.connect(user).approve(stargateNFTContract.target, boostAmount);
        await tx.wait();

        await expect(
            stargateNFTContract.connect(user).boost(tokenId, {
                gasLimit: 10_000_000,
            })
        ).to.be.reverted;
    });

    it("Shouldn't be able to boost a NFT with too low VTHO amount", async () => {
        const levelId = 3;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);

        const boostAmount = await stargateNFTContract.boostAmount(tokenId);

        tx = await vthoTokenContract.connect(user).approve(stargateNFTContract.target, boostAmount);
        await tx.wait();

        // Burn all VTHO balance
        const currentVthoBalance = await vthoTokenContract.balanceOf(user.address);

        tx = await vthoTokenContract
            .connect(user)
            .transfer(ZeroAddress, currentVthoBalance - boostAmount);
        await tx.wait();

        expect(await vthoTokenContract.balanceOf(user.address)).to.be.lessThan(boostAmount);
        // expect the boost to be reverted
        await expect(
            stargateNFTContract.connect(user).boost(tokenId, {
                gasLimit: 10_000_000,
            })
        ).to.be.reverted;
    });

    it("Shouldn't be able to boost a NFT with too low allowance", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        const boostAmount = await stargateNFTContract.boostAmount(tokenId);

        tx = await vthoTokenContract
            .connect(user)
            .approve(stargateNFTContract.target, boostAmount / 2n);
        await tx.wait();

        await expect(
            stargateNFTContract.connect(user).boost(tokenId, {
                gasLimit: 10_000_000,
            })
        ).to.be.reverted;
    });

    it("Shouldn't be able to boost a NFT that is owned with another user allowance", async () => {
        // stake an NFT
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        // approve the boost amount in other user
        const boostAmount = await stargateNFTContract.boostAmount(tokenId);
        tx = await vthoTokenContract
            .connect(otherUser)
            .approve(stargateNFTContract.target, boostAmount);
        await tx.wait();
        // boost the token owned by other user
        await expect(
            stargateNFTContract.connect(user).boost(tokenId, {
                gasLimit: 10_000_000,
            })
        ).to.be.reverted;
        expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.true;
    });

    it("Should be able to boost a NFT that is owned by other user", async () => {
        // stake an NFT
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        // approve the boost amount in other user
        const boostAmount = await stargateNFTContract.boostAmount(tokenId);
        // approve the boost amount in other user
        tx = await vthoTokenContract
            .connect(otherUser)
            .approve(stargateNFTContract.target, boostAmount);
        await tx.wait();
        // other user boost the token owned by user
        tx = await stargateNFTContract.connect(otherUser).boost(tokenId, {
            gasLimit: 10_000_000,
        });
        await tx.wait();
        // expect the token to be owned by user
        expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);
        // expect the token to not be under maturity period
        expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.be.false;
    });

    it("Should return the boost amount", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        const boostPricePerBlock = await stargateNFTContract.boostPricePerBlock(levelId);
        tx = await stargateContract.connect(user).stake(levelId, {
            value: levelSpec.vetAmountRequiredToStake,
            gasLimit: 10_000_000,
        });
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        const initialBoostAmount = await stargateNFTContract.connect(user).boostAmount(tokenId);
        expect(initialBoostAmount).to.equal(levelSpec.maturityBlocks * boostPricePerBlock);
        await mineBlocks(Number(levelSpec.maturityBlocks) / 2);
        const newBoostAmount = await stargateNFTContract.connect(user).boostAmount(tokenId);
        expect(initialBoostAmount).to.be.greaterThan(newBoostAmount);
        await mineBlocks(Number(levelSpec.maturityBlocks) / 2);
        const finalBoostAmount = await stargateNFTContract.connect(user).boostAmount(tokenId);
        expect(finalBoostAmount).to.equal(0);
    });

    it("Shouldn't be able to call boostInBehalfOf he caller is not the Stargate contract", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        await expect(
            stargateNFTContract.connect(user).boostOnBehalfOf(user.address, tokenId, {
                gasLimit: 10_000_000,
            })
        ).to.be.reverted;
    });

    it("Shouldnt be able to send VET to the contract directly", async () => {
        await expect(
            user.sendTransaction({
                to: stargateNFTContract.target,
                value: ethers.parseEther("1"),
            })
        ).to.be.reverted;
    });
});
