import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts, getStargateNFTErrorsInterface, log } from "../../helpers";
import {
    Errors,
    Stargate,
    StargateNFT,
    TokenAuctionMock,
    TokenAuctionMock__factory,
} from "../../../typechain-types";
import { TransactionResponse, ZeroAddress } from "ethers";

describe("shard-u104: StargateNFT: Migrate", () => {
    const config = createLocalConfig();

    let otherAccounts: HardhatEthersSigner[];
    let stargateNFTContract: StargateNFT;
    let legacyNodesMock: TokenAuctionMock;

    let stargateContract: Stargate;
    let errorsInterface: Errors;
    let user: HardhatEthersSigner;
    let otherUser: HardhatEthersSigner;
    let tx: TransactionResponse;
    let deployer: HardhatEthersSigner;

    const LEVEL_ID = 4;
    const TOKEN_ID = 500;

    beforeEach(async () => {
        [deployer, user, otherUser] = await ethers.getSigners();

        const legacyNodesMockFactory = new TokenAuctionMock__factory(deployer);
        legacyNodesMock = await legacyNodesMockFactory.deploy();
        await legacyNodesMock.waitForDeployment();

        config.WHITELIST_ENTRIES_V2 = [
            {
                owner: otherUser.address,
                tokenId: TOKEN_ID,
                levelId: LEVEL_ID,
            },
        ];

        // simulate the stargate contract is deployed in the deployer addess
        // so the deployer can call the functions with onlyStargate modifier
        config.STARGATE_CONTRACT_ADDRESS = deployer.address;
        config.TOKEN_AUCTION_CONTRACT_ADDRESS = await legacyNodesMock.getAddress();

        const contracts = await getOrDeployContracts({
            forceDeploy: true,
            config,
        });

        otherAccounts = contracts.otherAccounts;
        stargateNFTContract = contracts.stargateNFTContract;
        stargateContract = contracts.stargateContract;
        errorsInterface = await getStargateNFTErrorsInterface();

        // mock a legacy node in the legacy nodes mock
        // the owner will be used to mint the new NFT
        tx = await legacyNodesMock.helper__setMetadata(TOKEN_ID, {
            owner: user.address,
            strengthLevel: LEVEL_ID,
            onUpgrade: false,
            isOnAuction: false,
            lastTransferTime: 0,
            createdAt: 0,
            updatedAt: 0,
        });
        await tx.wait();
    });

    describe("Migrate from legacy nodes contract", () => {
        it("should't be able to migrate if the token id is 0", async () => {
            await expect(
                stargateNFTContract.connect(deployer).migrate(0)
            ).to.be.revertedWithCustomError(errorsInterface, "ValueCannotBeZero");
        });
        it("should't be able to migrate if the token id does not exist in the legacy nodes contract", async () => {
            await expect(
                stargateNFTContract.connect(deployer).migrate(TOKEN_ID + 1)
            ).to.be.revertedWithCustomError(errorsInterface, "TokenNotEligible");
        });
        it("should't be able to migrate if the token is on upgrade", async () => {
            await legacyNodesMock.helper__setMetadata(TOKEN_ID, {
                owner: user.address,
                strengthLevel: LEVEL_ID,
                onUpgrade: true,
                isOnAuction: false,
                lastTransferTime: 0,
                createdAt: 0,
                updatedAt: 0,
            });
            await tx.wait();
            log("✅ Set legacy node on upgrade to true");
            await expect(
                stargateNFTContract.connect(deployer).migrate(TOKEN_ID)
            ).to.be.revertedWithCustomError(errorsInterface, "TokenNotReadyForMigration");
        });
        it("should't be able to migrate if the token is on auction", async () => {
            await legacyNodesMock.helper__setMetadata(TOKEN_ID, {
                owner: user.address,
                strengthLevel: LEVEL_ID,
                onUpgrade: false,
                isOnAuction: true,
                lastTransferTime: 0,
                createdAt: 0,
                updatedAt: 0,
            });
            await tx.wait();
            log("✅ Set legacy node on auction to true");
            await expect(
                stargateNFTContract.connect(deployer).migrate(TOKEN_ID)
            ).to.be.revertedWithCustomError(errorsInterface, "TokenNotReadyForMigration");
        });
        it("should be able to migrate the token", async () => {
            tx = await stargateNFTContract.connect(deployer).migrate(TOKEN_ID);
            await tx.wait();
            log("✅ Migrated token");
            expect(await stargateNFTContract.ownerOf(TOKEN_ID)).to.equal(user.address);
            expect(await stargateNFTContract.getTokenLevel(TOKEN_ID)).to.equal(LEVEL_ID);
            const token = await stargateNFTContract.getToken(TOKEN_ID);
            expect(token.levelId).to.equal(LEVEL_ID);
            expect(token.mintedAtBlock).to.equal(await stargateContract.clock());
            const supply = await stargateNFTContract.getLevelSupply(LEVEL_ID);
            expect(supply.circulating).to.equal(1);
            expect(supply.cap).to.equal(1);
        });

        it("should't be able to migrate the same token twice", async () => {
            tx = await stargateNFTContract.connect(deployer).migrate(TOKEN_ID);
            await tx.wait();
            log("✅ Migrated token");
            await expect(
                stargateNFTContract.connect(deployer).migrate(TOKEN_ID)
            ).to.be.revertedWithCustomError(errorsInterface, "TokenNotEligible");
        });
    });
});
