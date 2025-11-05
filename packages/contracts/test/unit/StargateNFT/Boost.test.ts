import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts, getStargateNFTErrorsInterface, log } from "../../helpers";
import { Errors, MyERC20, MyERC20__factory, Stargate, StargateNFT } from "../../../typechain-types";
import { TransactionResponse, ZeroAddress } from "ethers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

describe("shard-u103: StargateNFT: Boost", () => {
    const config = createLocalConfig();
    let otherAccounts: HardhatEthersSigner[];
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherUser: HardhatEthersSigner;
    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;
    let errorsInterface: Errors;
    let stargateMockCaller: HardhatEthersSigner;
    let vthoTokenContract: MyERC20;

    let tx: TransactionResponse;

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();

        const vthoTokenContractFactory = new MyERC20__factory(deployer);
        const tokenContract = await vthoTokenContractFactory.deploy(
            deployer.address,
            deployer.address
        );
        await tokenContract.waitForDeployment();

        config.VTHO_TOKEN_ADDRESS = await tokenContract.getAddress();
        config.STARGATE_CONTRACT_ADDRESS = deployer.address;
        const contracts = await getOrDeployContracts({
            forceDeploy: true,
            config,
        });

        otherAccounts = contracts.otherAccounts;
        deployer = contracts.deployer;
        stargateMockCaller = deployer;
        user = otherAccounts[0];
        otherUser = otherAccounts[1];
        stargateNFTContract = contracts.stargateNFTContract;
        stargateContract = contracts.stargateContract;
        vthoTokenContract = contracts.mockedVthoToken;
        errorsInterface = await getStargateNFTErrorsInterface();
    });

    describe("Boost getters", () => {
        it("should return the boost amount of a level", async () => {
            const levelId = 1;
            const levelSpec = await stargateNFTContract.getLevel(levelId);
            const boostPricePerBlock = await stargateNFTContract.boostPricePerBlock(levelId);
            const boostAmount = await stargateNFTContract.boostAmountOfLevel(levelId);
            expect(boostAmount).to.equal(levelSpec.maturityBlocks * boostPricePerBlock);
        });
        it("should return the boost amount of a token", async () => {
            const levelId = 1;
            const levelSpec = await stargateNFTContract.getLevel(levelId);
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            const boostAmount = await stargateNFTContract.boostAmount(tokenId);
            const boostPricePerBlock = await stargateNFTContract.boostPricePerBlock(levelId);
            expect(boostAmount).to.equal(levelSpec.maturityBlocks * boostPricePerBlock);
            log("👀 Boost amount", boostAmount);
            await mine(Number(levelSpec.maturityBlocks + 1n));
            log("🔄 Mined blocks to reach maturity period");
            const newBoostAmount = await stargateNFTContract.boostAmount(tokenId);
            expect(newBoostAmount).to.equal(0);
            log("👀 New boost amount", newBoostAmount);
        });
        it("should return the maturity period end block of a token", async () => {
            const levelId = 1;
            const levelSpec = await stargateNFTContract.getLevel(levelId);
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            const maturityPeriodEndBlock =
                await stargateNFTContract.maturityPeriodEndBlock(tokenId);
            let currentBlock = await stargateContract.clock();
            expect(maturityPeriodEndBlock).to.equal(levelSpec.maturityBlocks + currentBlock);
            log("🔄 Mined blocks to reach maturity period");
            await mine(Number(levelSpec.maturityBlocks));
            const newMaturityPeriodEndBlock =
                await stargateNFTContract.maturityPeriodEndBlock(tokenId);
            currentBlock = await stargateContract.clock();
            expect(newMaturityPeriodEndBlock).to.equal(currentBlock);
            log(
                "👀 Current block should be the same as the maturity period end block",
                currentBlock,
                newMaturityPeriodEndBlock
            );
        });

        it("should return if a token is under the maturity period", async () => {
            const levelId = 1;
            const levelSpec = await stargateNFTContract.getLevel(levelId);
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            const isUnderMaturityPeriod = await stargateNFTContract.isUnderMaturityPeriod(tokenId);
            log("👀 Is under maturity period", isUnderMaturityPeriod);
            expect(isUnderMaturityPeriod).to.equal(true);
            await mine(Number(levelSpec.maturityBlocks));
            log("🔄 Mined blocks to reach maturity period");
            const newIsUnderMaturityPeriod =
                await stargateNFTContract.isUnderMaturityPeriod(tokenId);
            log("👀 Is under maturity period", newIsUnderMaturityPeriod);
            expect(newIsUnderMaturityPeriod).to.equal(false);
        });
    });
    describe("Boost", () => {
        it("shouldn't be able to boost when the token is not under the maturity period", async () => {
            const levelId = 1;
            const levelSpec = await stargateNFTContract.getLevel(levelId);
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            await mine(Number(levelSpec.maturityBlocks));
            log("🔄 Mined blocks to reach maturity period");
            await expect(
                stargateNFTContract.connect(user).boost(tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "MaturityPeriodEnded");
            log("👀 Should not be able to boost when the token is not under the maturity period");
        });
        it("shouldn't be able to boost when the balance is not enough", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            const boostAmount = await stargateNFTContract.boostAmount(tokenId);
            tx = await vthoTokenContract
                .connect(user)
                .approve(stargateNFTContract.target, boostAmount);
            await tx.wait();
            const currentVthoBalance = await vthoTokenContract.balanceOf(user.address);
            log("👀 Current VTHO balance", currentVthoBalance);
            expect(currentVthoBalance).to.be.lessThan(boostAmount);
            await expect(
                stargateNFTContract.connect(user).boost(tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "InsufficientBalance");
            log("👀 Should not be able to boost when the balance is not enough");
        });
        it("shouldn't be able to boost when the allowance is not enough", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            const boostAmount = await stargateNFTContract.boostAmount(tokenId);
            // deployer transfer the boost amount to the user
            tx = await vthoTokenContract.connect(deployer).transfer(user.address, boostAmount);
            await tx.wait();
            const currentVthoBalance = await vthoTokenContract.balanceOf(user.address);
            log("👀 Current VTHO balance", currentVthoBalance);
            expect(currentVthoBalance).to.equal(boostAmount);
            await expect(
                stargateNFTContract.connect(user).boost(tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "InsufficientAllowance");
            log("👀 Should not be able to boost when the allowance is not enough");
        });
        it("shouldn't be able to boost on behalf of when the caller is not the stargate contract", async () => {
            const levelId = 1;
            const levelSpec = await stargateNFTContract.getLevel(levelId);
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            await expect(
                stargateNFTContract.connect(user).boostOnBehalfOf(user.address, tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "UnauthorizedCaller");
            log(
                "👀 Should not be able to boost on behalf of when the caller is not the stargate contract"
            );
        });
        it("should be able to boost on behalf of other user using the user's allowance when the caller is the stargate contract", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            const boostAmount = await stargateNFTContract.boostAmount(tokenId);
            // deployer transfer the boost amount to the user
            tx = await vthoTokenContract.connect(deployer).transfer(user.address, boostAmount);
            await tx.wait();
            const currentVthoBalance = await vthoTokenContract.balanceOf(user.address);
            log("👀 Current VTHO balance", currentVthoBalance);
            tx = await vthoTokenContract
                .connect(user)
                .approve(stargateNFTContract.target, boostAmount);
            await tx.wait();
            const currentVthoAllowance = await vthoTokenContract.allowance(
                user.address,
                stargateNFTContract.target
            );
            log("👀 Current VTHO allowance", currentVthoAllowance);
            expect(currentVthoBalance).to.equal(boostAmount);
            expect(currentVthoAllowance).to.equal(boostAmount);
            tx = await stargateNFTContract
                .connect(stargateMockCaller)
                .boostOnBehalfOf(user.address, tokenId);
            await tx.wait();
            log("✅ Boosted NFT");
            const newVthoBalance = await vthoTokenContract.balanceOf(user.address);
            log("👀 New VTHO balance", newVthoBalance);
            expect(newVthoBalance).to.be.lessThan(boostAmount);
            const newVthoAllowance = await vthoTokenContract.allowance(
                user.address,
                stargateNFTContract.target
            );
            log("👀 New VTHO allowance", newVthoAllowance);
            expect(newVthoAllowance).to.be.lessThan(boostAmount);
            const currentBlock = await stargateContract.clock();
            const maturityPeriodEndBlock =
                await stargateNFTContract.maturityPeriodEndBlock(tokenId);
            log(
                "👀 New maturity period end block is equal to the current block",
                maturityPeriodEndBlock,
                currentBlock
            );
            expect(maturityPeriodEndBlock).to.equal(currentBlock);
            const newBoostAmount = await stargateNFTContract.boostAmount(tokenId);
            log("👀 New boost amount", newBoostAmount);
            expect(newBoostAmount).to.equal(0);
            const isUnderMaturityPeriod = await stargateNFTContract.isUnderMaturityPeriod(tokenId);
            log("Shouldn't be under maturity period", isUnderMaturityPeriod);
            expect(isUnderMaturityPeriod).to.equal(false);
        });
        it("should be able to boost", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            const boostAmount = await stargateNFTContract.boostAmount(tokenId);
            // deployer transfer the boost amount to the user
            tx = await vthoTokenContract.connect(deployer).transfer(user.address, boostAmount);
            await tx.wait();
            const currentVthoBalance = await vthoTokenContract.balanceOf(user.address);
            log("👀 Current VTHO balance", currentVthoBalance);
            tx = await vthoTokenContract
                .connect(user)
                .approve(stargateNFTContract.target, boostAmount);
            await tx.wait();
            const currentVthoAllowance = await vthoTokenContract.allowance(
                user.address,
                stargateNFTContract.target
            );
            log("👀 Current VTHO allowance", currentVthoAllowance);
            expect(currentVthoBalance).to.equal(boostAmount);
            expect(currentVthoAllowance).to.equal(boostAmount);
            tx = await stargateNFTContract.connect(user).boost(tokenId);
            await tx.wait();
            log("✅ Boosted NFT");
            const newVthoBalance = await vthoTokenContract.balanceOf(user.address);
            log("👀 New VTHO balance", newVthoBalance);
            expect(newVthoBalance).to.be.lessThan(boostAmount);
            const newVthoAllowance = await vthoTokenContract.allowance(
                user.address,
                stargateNFTContract.target
            );
            log("👀 New VTHO allowance", newVthoAllowance);
            expect(newVthoAllowance).to.be.lessThan(boostAmount);
            const currentBlock = await stargateContract.clock();
            const maturityPeriodEndBlock =
                await stargateNFTContract.maturityPeriodEndBlock(tokenId);
            log(
                "👀 New maturity period end block is equal to the current block",
                maturityPeriodEndBlock,
                currentBlock
            );
            expect(maturityPeriodEndBlock).to.equal(currentBlock);
            const newBoostAmount = await stargateNFTContract.boostAmount(tokenId);
            log("👀 New boost amount", newBoostAmount);
            expect(newBoostAmount).to.equal(0);
            const isUnderMaturityPeriod = await stargateNFTContract.isUnderMaturityPeriod(tokenId);
            log("Shouldn't be under maturity period", isUnderMaturityPeriod);
            expect(isUnderMaturityPeriod).to.equal(false);
        });

        it("should be able to boost a token owned by another user with my own allowance", async () => {
            const levelId = 1;
            // mint the NFT for the user
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted NFT with id", tokenId);
            const boostAmount = await stargateNFTContract.boostAmount(tokenId);
            // deployer transfer the boost amount to the user
            tx = await vthoTokenContract.connect(deployer).transfer(otherUser.address, boostAmount);
            await tx.wait();
            const currentVthoBalance = await vthoTokenContract.balanceOf(otherUser.address);
            log("👀 Current VTHO balance", currentVthoBalance);
            tx = await vthoTokenContract
                .connect(otherUser)
                .approve(stargateNFTContract.target, boostAmount);
            await tx.wait();
            const currentVthoAllowance = await vthoTokenContract.allowance(
                otherUser.address,
                stargateNFTContract.target
            );
            log("👀 Current VTHO allowance", currentVthoAllowance);
            expect(currentVthoBalance).to.equal(boostAmount);
            expect(currentVthoAllowance).to.equal(boostAmount);
            // boost the NFT with other user
            tx = await stargateNFTContract.connect(otherUser).boost(tokenId);
            await tx.wait();
            log("✅ Boosted NFT");
            const newVthoBalance = await vthoTokenContract.balanceOf(otherUser.address);
            log("👀 New VTHO balance", newVthoBalance);
            expect(newVthoBalance).to.be.lessThan(boostAmount);
            const newVthoAllowance = await vthoTokenContract.allowance(
                user.address,
                stargateNFTContract.target
            );
            log("👀 New VTHO allowance", newVthoAllowance);
            expect(newVthoAllowance).to.be.lessThan(boostAmount);
            const currentBlock = await stargateContract.clock();
            const maturityPeriodEndBlock =
                await stargateNFTContract.maturityPeriodEndBlock(tokenId);
            log(
                "👀 New maturity period end block is equal to the current block",
                maturityPeriodEndBlock,
                currentBlock
            );
            expect(maturityPeriodEndBlock).to.equal(currentBlock);
            const newBoostAmount = await stargateNFTContract.boostAmount(tokenId);
            log("👀 New boost amount", newBoostAmount);
            expect(newBoostAmount).to.equal(0);
            const isUnderMaturityPeriod = await stargateNFTContract.isUnderMaturityPeriod(tokenId);
            log("Shouldn't be under maturity period", isUnderMaturityPeriod);
            expect(isUnderMaturityPeriod).to.equal(false);
        });
    });
});
