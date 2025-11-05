import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts, getStargateNFTErrorsInterface } from "../../helpers";
import {
    Errors,
    Stargate,
    StargateNFT,
    TokenAuctionMock,
    TokenAuctionMock__factory,
} from "../../../typechain-types";
import { TransactionResponse } from "ethers";

describe("shard-u102: StargateNFT: MintingLogic", () => {
    const config = createLocalConfig();

    let otherAccounts: HardhatEthersSigner[];
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherUser: HardhatEthersSigner;
    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;
    let legacyNodesMock: TokenAuctionMock;
    let errorsInterface: Errors;
    let stargateMockCaller: HardhatEthersSigner;

    let tx: TransactionResponse;

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();

        const legacyNodesMockFactory = new TokenAuctionMock__factory(deployer);
        legacyNodesMock = await legacyNodesMockFactory.deploy();
        await legacyNodesMock.waitForDeployment();

        // simulate the stargate contract is deployed in the deployer addess
        // so the deployer can call the functions with onlyStargate modifier
        config.STARGATE_CONTRACT_ADDRESS = deployer.address;
        config.TOKEN_AUCTION_CONTRACT_ADDRESS = await legacyNodesMock.getAddress();

        // set cap to 0 for token level 3
        config.TOKEN_LEVELS[2].cap = 0;
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
        errorsInterface = await getStargateNFTErrorsInterface();
    });

    describe("Minting", () => {
        it("shouldn't be able to mint an NFT when the caller is not the stargate contract", async () => {
            await expect(stargateNFTContract.connect(user).mint(1, user.address))
                .to.be.revertedWithCustomError(errorsInterface, "UnauthorizedCaller")
                .withArgs(user.address);
        });

        it("shouldn't be able to mint an NFT when the level id does not exist", async () => {
            await expect(stargateNFTContract.connect(stargateMockCaller).mint(100, user.address))
                .to.be.revertedWithCustomError(errorsInterface, "LevelNotFound")
                .withArgs(100);
        });

        it("should revert when the level circulating supply has reached the cap", async () => {
            const levelSupply = await stargateNFTContract.getLevelSupply(3);
            expect(levelSupply.cap).to.equal(0);
            await expect(stargateNFTContract.connect(stargateMockCaller).mint(3, user.address))
                .to.be.revertedWithCustomError(errorsInterface, "LevelCapReached")
                .withArgs(3);
        });

        it("should revert when trying to mint an NFT when the level is X", async () => {
            const level = await stargateNFTContract.getLevel(5);
            expect(level.isX).to.equal(true);
            await expect(stargateNFTContract.connect(stargateMockCaller).mint(5, user.address))
                .to.be.revertedWithCustomError(errorsInterface, "CannotMintXToken")
                .withArgs(5);
        });

        it("should mint an NFT", async () => {
            const level = await stargateNFTContract.getLevel(1);
            const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;
            tx = await stargateNFTContract.connect(stargateMockCaller).mint(level.id, user.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenMinted")
                .withArgs(user.address, level.id, false, tokenId, level.vetAmountRequiredToStake);

            const token = await stargateNFTContract.getToken(tokenId);
            expect(token.levelId).to.equal(level.id);
            expect(token.mintedAtBlock).to.equal(await stargateContract.clock());
            expect(token.vetAmountStaked).to.equal(level.vetAmountRequiredToStake);
            expect(token.tokenId).to.equal(tokenId);

            const levelSupply = await stargateNFTContract.getLevelSupply(level.id);
            expect(levelSupply.circulating).to.equal(1);

            // verify maturity period end block
            expect(await stargateNFTContract.maturityPeriodEndBlock(tokenId)).to.equal(
                (await stargateContract.clock()) + level.maturityBlocks
            );

            // verify is under maturity period
            expect(await stargateNFTContract.isUnderMaturityPeriod(tokenId)).to.equal(true);

            // update current token id
            const currentTokenId = await stargateNFTContract.getCurrentTokenId();
            expect(currentTokenId).to.equal(tokenId);

            // verify owner
            expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);

            // verify token exists
            expect(await stargateNFTContract.tokenExists(tokenId)).to.equal(true);

            // verify token level
            expect(await stargateNFTContract.getTokenLevel(tokenId)).to.equal(level.id);
        });
    });

    describe("Burning", () => {
        it("shouldn't be able to burn an NFT when the caller is not the stargate contract", async () => {
            await expect(stargateNFTContract.connect(user).burn(1))
                .to.be.revertedWithCustomError(errorsInterface, "UnauthorizedCaller")
                .withArgs(user.address);
        });
        it("shouldn't be able to burn an NFT when the token does not exist", async () => {
            await expect(stargateNFTContract.connect(stargateMockCaller).burn(1))
                .to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken")
                .withArgs(1);
        });
        it("should burn an NFT", async () => {
            const level = await stargateNFTContract.getLevel(1);
            const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;
            tx = await stargateNFTContract.connect(stargateMockCaller).mint(level.id, user.address);
            await tx.wait();

            // cap after mint
            const levelSupplyAfterMint = await stargateNFTContract.getLevelSupply(level.id);

            await expect(stargateNFTContract.connect(stargateMockCaller).burn(tokenId))
                .to.emit(stargateNFTContract, "TokenBurned")
                .withArgs(user.address, level.id, tokenId, level.vetAmountRequiredToStake);

            // verify token does not exist
            expect(await stargateNFTContract.tokenExists(tokenId)).to.equal(false);

            // verify level supply
            const levelSupply = await stargateNFTContract.getLevelSupply(level.id);
            expect(levelSupply.circulating).to.equal(0);

            // verify cap
            expect(levelSupply.cap).to.equal(levelSupplyAfterMint.cap);
            // verify owner
            await expect(stargateNFTContract.ownerOf(tokenId))
                .to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken")
                .withArgs(tokenId);
        });
        it("should burn an NFT when the token is X", async () => {
            const tokenId = 1;
            const LEVEL_ID = 5;
            await legacyNodesMock.helper__setMetadata(tokenId, {
                owner: user.address,
                strengthLevel: LEVEL_ID,
                onUpgrade: false,
                isOnAuction: false,
                lastTransferTime: 0,
                createdAt: 0,
                updatedAt: 0,
            });
            const level = await stargateNFTContract.getLevel(LEVEL_ID);
            expect(level.isX).to.equal(true);
            const levelSupply = await stargateNFTContract.getLevelSupply(level.id);
            expect(levelSupply.cap).to.equal(0);
            // migrate legacy token
            tx = await stargateNFTContract.connect(stargateMockCaller).migrate(tokenId);
            await tx.wait();

            // cap after mint
            const levelSupplyAfterMint = await stargateNFTContract.getLevelSupply(level.id);
            expect(levelSupplyAfterMint.circulating).to.equal(1);
            expect(levelSupplyAfterMint.cap).to.equal(1);

            await expect(stargateNFTContract.connect(stargateMockCaller).burn(tokenId))
                .to.emit(stargateNFTContract, "TokenBurned")
                .withArgs(user.address, level.id, tokenId, level.vetAmountRequiredToStake);

            // verify level supply
            const levelSupplyAfterBurn = await stargateNFTContract.getLevelSupply(level.id);
            expect(levelSupplyAfterBurn.circulating).to.equal(0);
            // verify cap
            expect(levelSupplyAfterBurn.cap).to.equal(0);

            // verify token does not exist
            expect(await stargateNFTContract.tokenExists(tokenId)).to.equal(false);

            // verify owner
            await expect(stargateNFTContract.ownerOf(tokenId))
                .to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken")
                .withArgs(tokenId);
        });
    });
});
