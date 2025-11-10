import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts, log } from "../../helpers";
import { StargateNFT, TokenAuctionMock, TokenAuctionMock__factory } from "../../../typechain-types";
import { TransactionResponse } from "ethers";
import { mine } from "@nomicfoundation/hardhat-network-helpers";

describe("shard-u107: StargateNFT: Token", () => {
    const config = createLocalConfig();

    let otherAccounts: HardhatEthersSigner[];
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let stargateNFTContract: StargateNFT;
    let legacyNodesMock: TokenAuctionMock;

    let tx: TransactionResponse;

    const X_TOKEN_LEVEL_ID = 5;
    const LEGACY_TOKEN_ID = 1;

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();
        const legacyNodesMockFactory = new TokenAuctionMock__factory(deployer);
        legacyNodesMock = await legacyNodesMockFactory.deploy();
        await legacyNodesMock.waitForDeployment();

        config.TOKEN_AUCTION_CONTRACT_ADDRESS = await legacyNodesMock.getAddress();
        config.STARGATE_CONTRACT_ADDRESS = deployer.address;
        const contracts = await getOrDeployContracts({
            forceDeploy: true,
            config,
        });

        otherAccounts = contracts.otherAccounts;
        deployer = contracts.deployer;
        user = otherAccounts[0];
        stargateNFTContract = contracts.stargateNFTContract;
    });

    it("should revert when trying tho get the maturity period end block of a token that does not exist", async () => {
        await expect(stargateNFTContract.maturityPeriodEndBlock(1))
            .to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken")
            .withArgs(1);
    });
    it("should return the maturity period end block of a token", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        const currentBlock = await stargateNFTContract.clock();
        const expectedMaturityPeriodEndBlock = levelSpec.maturityBlocks + currentBlock;
        log("👀 Expected maturity period end block: ", expectedMaturityPeriodEndBlock);
        const actualMaturityPeriodEndBlock =
            await stargateNFTContract.maturityPeriodEndBlock(tokenId);
        log("👀 Actual maturity period end block: ", actualMaturityPeriodEndBlock);
        expect(actualMaturityPeriodEndBlock).to.equal(expectedMaturityPeriodEndBlock);
    });
    it("should revert when calling isUnderMaturityPeriod with a token that does not exist", async () => {
        await expect(stargateNFTContract.isUnderMaturityPeriod(1))
            .to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken")
            .withArgs(1);
    });
    it("should return true if a token is under the maturity period", async () => {
        const levelId = 1;
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        const isUnderMaturityPeriod = await stargateNFTContract.isUnderMaturityPeriod(tokenId);
        log("👀 Is under maturity period: ", isUnderMaturityPeriod);
        expect(isUnderMaturityPeriod).to.equal(true);
    });
    it("should return false if a token is not under the maturity period", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        await mine(Number(levelSpec.maturityBlocks));
        log("🔄 Mined blocks to reach maturity period");
        const isUnderMaturityPeriod = await stargateNFTContract.isUnderMaturityPeriod(tokenId);
        log("👀 Is under maturity period: ", isUnderMaturityPeriod);
        expect(isUnderMaturityPeriod).to.equal(false);
    });
    it("should return the number of X tokens", async () => {
        const xTokensCount = await stargateNFTContract.xTokensCount();
        log("👀 X tokens count: ", xTokensCount);
        expect(xTokensCount).to.equal(0);

        await legacyNodesMock.helper__setMetadata(LEGACY_TOKEN_ID, {
            owner: user.address,
            strengthLevel: X_TOKEN_LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        // migrate legacy token
        tx = await stargateNFTContract.migrate(LEGACY_TOKEN_ID);
        await tx.wait();
        const xTokensCountAfterMint = await stargateNFTContract.xTokensCount();
        log("👀 X tokens count after mint: ", xTokensCountAfterMint);
        expect(xTokensCountAfterMint).to.equal(1);
    });
    it("should return a list of token ids owned by an address", async () => {
        const levelId = 1;
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        // migrate a X token
        await legacyNodesMock.helper__setMetadata(LEGACY_TOKEN_ID, {
            owner: user.address,
            strengthLevel: X_TOKEN_LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        // migrate legacy token
        tx = await stargateNFTContract.migrate(LEGACY_TOKEN_ID);
        await tx.wait();
        const tokenIds = await stargateNFTContract.idsOwnedBy(user.address);
        log("👀 Token ids: ", tokenIds);
        expect(tokenIds).to.deep.equal([tokenId, LEGACY_TOKEN_ID]);
    });
    it("should return a list of tokens owned by an address", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        // migrate a X token
        await legacyNodesMock.helper__setMetadata(LEGACY_TOKEN_ID, {
            owner: user.address,
            strengthLevel: X_TOKEN_LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        // migrate legacy token
        tx = await stargateNFTContract.migrate(LEGACY_TOKEN_ID);
        await tx.wait();
        const xTokenLevelSpec = await stargateNFTContract.getLevel(X_TOKEN_LEVEL_ID);
        log("✅ Minted token id: ", LEGACY_TOKEN_ID);
        const tokens = await stargateNFTContract.tokensOwnedBy(user.address);
        expect(tokens[0].levelId).to.equal(levelSpec.id);
        expect(tokens[0].vetAmountStaked).to.equal(levelSpec.vetAmountRequiredToStake);
        expect(tokens[1].levelId).to.equal(xTokenLevelSpec.id);
        expect(tokens[1].vetAmountStaked).to.equal(xTokenLevelSpec.vetAmountRequiredToStake);
    });
    it("should return the total VET staked by an address", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        // migrate a X token
        await legacyNodesMock.helper__setMetadata(LEGACY_TOKEN_ID, {
            owner: user.address,
            strengthLevel: X_TOKEN_LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        // migrate legacy token
        tx = await stargateNFTContract.migrate(LEGACY_TOKEN_ID);
        await tx.wait();
        const xTokenLevelSpec = await stargateNFTContract.getLevel(X_TOKEN_LEVEL_ID);
        log("✅ Minted token id: ", LEGACY_TOKEN_ID);
        const expectedTotalVetStaked =
            levelSpec.vetAmountRequiredToStake + xTokenLevelSpec.vetAmountRequiredToStake;
        const actualTotalVetStaked = await stargateNFTContract.ownerTotalVetStaked(user.address);
        log("👀 Actual total VET staked: ", actualTotalVetStaked);
        expect(actualTotalVetStaked).to.equal(expectedTotalVetStaked);
    });
    it("should return true if an address owns any X tokens", async () => {
        // migrate a X token
        await legacyNodesMock.helper__setMetadata(LEGACY_TOKEN_ID, {
            owner: user.address,
            strengthLevel: X_TOKEN_LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        // migrate legacy token
        tx = await stargateNFTContract.migrate(LEGACY_TOKEN_ID);
        await tx.wait();
        const actualOwnsXToken = await stargateNFTContract.ownsXToken(user.address);
        log("👀 Actual owns X token: ", actualOwnsXToken);
        expect(actualOwnsXToken).to.equal(true);
    });
    it("should return false if an address does not own any X tokens", async () => {
        const levelId = 1;
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        const actualOwnsXToken = await stargateNFTContract.ownsXToken(user.address);
        log("👀 Actual owns X token: ", actualOwnsXToken);
        expect(actualOwnsXToken).to.equal(false);
    });
    it("should return true if a token is an X token", async () => {
        // migrate a X token
        await legacyNodesMock.helper__setMetadata(LEGACY_TOKEN_ID, {
            owner: user.address,
            strengthLevel: X_TOKEN_LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        // migrate legacy token
        tx = await stargateNFTContract.migrate(LEGACY_TOKEN_ID);
        await tx.wait();
        log("✅ Minted token id: ", LEGACY_TOKEN_ID);
        const isXToken = await stargateNFTContract.isXToken(LEGACY_TOKEN_ID);
        log("👀 Is X token: ", isXToken);
        expect(isXToken).to.equal(true);
    });
    it("should return false if a token is not an X token", async () => {
        const levelId = 1;
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        const isXToken = await stargateNFTContract.isXToken(tokenId);
        log("👀 Is X token: ", isXToken);
        expect(isXToken).to.equal(false);
    });
    it("should revert when calling getTokenLevel with a token that does not exist", async () => {
        expect(await stargateNFTContract.getTokenLevel(1)).to.equal(0);
    });
    it("should return a token for a given token id", async () => {
        const levelId = 1;
        const levelSpec = await stargateNFTContract.getLevel(levelId);
        tx = await stargateNFTContract.mint(levelId, user.address);
        await tx.wait();
        const tokenId = await stargateNFTContract.getCurrentTokenId();
        log("✅ Minted token id: ", tokenId);
        const token = await stargateNFTContract.getToken(tokenId);
        log("👀 Token: ", token);
        expect(token.levelId).to.equal(levelSpec.id);
        expect(token.vetAmountStaked).to.equal(levelSpec.vetAmountRequiredToStake);
        expect(token.mintedAtBlock).to.equal(await stargateNFTContract.clock());
    });
});
