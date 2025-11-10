import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts, getStargateNFTErrorsInterface, log } from "../../helpers";
import { Errors, MyERC20__factory, StargateNFT } from "../../../typechain-types";
import { TransactionResponse, ZeroAddress } from "ethers";

describe("shard-u105: StargateNFT: Token Manager", () => {
    const config = createLocalConfig();
    let otherAccounts: HardhatEthersSigner[];
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherUser: HardhatEthersSigner;
    let manager: HardhatEthersSigner;
    let stargateNFTContract: StargateNFT;
    let errorsInterface: Errors;
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
        user = otherAccounts[0];
        otherUser = otherAccounts[1];
        manager = otherAccounts[2];
        stargateNFTContract = contracts.stargateNFTContract;
        errorsInterface = await getStargateNFTErrorsInterface();
    });

    describe("Add token manager", () => {
        it("shouldn't be able to add address zero as a token manager", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            await expect(
                stargateNFTContract.connect(user).addTokenManager(ZeroAddress, tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "ManagerZeroAddress");
        });

        it("shouldn't be able to add the caller as a token manager", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            await expect(
                stargateNFTContract.connect(user).addTokenManager(user.address, tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "SelfManager");
        });

        it("shouldn't be able to add a token manager if the token does not exist", async () => {
            await expect(
                stargateNFTContract.connect(user).addTokenManager(manager.address, 10001)
            ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken");
        });

        it("shouldn't be able to add a token manager if the token is not owned by the caller", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            await expect(
                stargateNFTContract.connect(otherUser).addTokenManager(manager.address, tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "NotOwner");
        });

        it("should be able to add a token manager if the token is already managed by another address", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract
                .connect(user)
                .addTokenManager(otherUser.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", otherUser.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, otherUser.address);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerRemoved")
                .withArgs(tokenId, otherUser.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(manager.address);
            expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.true;
            expect(await stargateNFTContract.isTokenManager(otherUser.address, tokenId)).to.be
                .false;
            expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.false;
        });

        it("should be able to add a token manager if the token is not managed by anyone", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(manager.address);
            expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.true;
            expect(await stargateNFTContract.isTokenManager(otherUser.address, tokenId)).to.be
                .false;
            expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.false;
        });
    });

    describe("Remove token manager", () => {
        it("should't be able to remove a token manager if the token is not managed or owned by the caller", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            await expect(
                stargateNFTContract.connect(otherUser).removeTokenManager(tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "NotTokenManagerOrOwner");
        });

        it("shouldn't be able to remove a token manager if the token does not have a manager", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            await expect(
                stargateNFTContract.connect(user).removeTokenManager(tokenId)
            ).to.be.revertedWithCustomError(errorsInterface, "NoTokenManager");
        });

        it("should be able to remove the token manager if the token is managed by the caller", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            tx = await stargateNFTContract.connect(manager).removeTokenManager(tokenId);
            await tx.wait();
            log("✅ Removed token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerRemoved")
                .withArgs(tokenId, manager.address);

            expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(user.address);
            expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.false;
            expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.true;
        });

        it("should be able to remove a token manager if the token is owned by the caller", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            tx = await stargateNFTContract.connect(user).removeTokenManager(tokenId);
            await tx.wait();
            log("✅ Removed token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerRemoved")
                .withArgs(tokenId, manager.address);

            expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(user.address);
            expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.false;
            expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.true;
        });
    });

    describe("Migrate token manager", () => {
        it("should be able to migrate a token manager", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract
                .connect(deployer)
                .grantRole(
                    await stargateNFTContract.TOKEN_MANAGER_MIGRATOR_ROLE(),
                    deployer.address
                );
            await tx.wait();
            log("✅ Granted token manager migrator role to deployer: ", deployer.address);

            tx = await stargateNFTContract
                .connect(deployer)
                .migrateTokenManager(tokenId, manager.address);
            await tx.wait();
            log("✅ Migrated token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(manager.address);
            expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.true;
            expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.false;
        });
        it("shouldn't be able to migrate a token manager if the caller does not have the token manager migrator role", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            await expect(
                stargateNFTContract.connect(deployer).migrateTokenManager(tokenId, manager.address)
            )
                .to.be.revertedWithCustomError(
                    stargateNFTContract,
                    "AccessControlUnauthorizedAccount"
                )
                .withArgs(
                    deployer.address,
                    await stargateNFTContract.TOKEN_MANAGER_MIGRATOR_ROLE()
                );
        });
    });

    describe("Getters", () => {
        it("should revert if the token does not exist", async () => {
            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            await expect(
                stargateNFTContract.getTokenManager(tokenId)
            ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken");
        });

        it("should return the owner of the token if the token is not managed by anyone", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(user.address);
        });

        it("should return the manager of the token if the token is managed by someone", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);
            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(manager.address);
        });

        it("should return the token ids managed by the address", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId2 = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId2);

            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId3 = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId3);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            // owner should not be a manager of the tokens that dont have a specific manager
            expect(await stargateNFTContract.idsManagedBy(user.address)).to.deep.equal([
                tokenId2,
                tokenId3,
            ]);
            expect(await stargateNFTContract.idsManagedBy(manager.address)).to.deep.equal([
                tokenId,
            ]);

            const tokensManagedByUser = await stargateNFTContract.tokensOverview(user.address);
            const tokensManagedByManager = await stargateNFTContract.tokensOverview(
                manager.address
            );
            expect(tokensManagedByUser).to.deep.equal([
                [tokenId, user.address, manager.address, levelId],
                [tokenId2, user.address, user.address, levelId],
                [tokenId3, user.address, user.address, levelId],
            ]);
            expect(tokensManagedByManager).to.deep.equal([
                [tokenId, user.address, manager.address, levelId],
            ]);
        });

        it("should return the token managed by the address", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId2 = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId2);

            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId3 = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId3);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            const tokensManagetByOwner = await stargateNFTContract.tokensManagedBy(user.address);
            expect(tokensManagetByOwner.length).to.equal(2);
            const tokensManagedByManager = await stargateNFTContract.tokensManagedBy(
                manager.address
            );
            expect(tokensManagedByManager.length).to.equal(1);
            expect(tokensManagedByManager[0].tokenId).to.equal(tokenId);
            expect(tokensManagedByManager[0].levelId).to.equal(levelId);
            expect(tokensManagedByManager[0].vetAmountStaked).to.equal(ethers.parseEther("100"));
        });

        it("should return true if the address is a token manager", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.true;
        });

        it("Should return false if the address is not a token manager", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            expect(await stargateNFTContract.isTokenManager(otherUser.address, tokenId)).to.be
                .false;
        });

        it("should return true if the token has a manager", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
            await tx.wait();
            log("✅ Added token manager: ", manager.address);
            await expect(tx)
                .to.emit(stargateNFTContract, "TokenManagerAdded")
                .withArgs(tokenId, manager.address);

            expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.false;
        });

        it("should return false if the token does not have a manager", async () => {
            const levelId = 1;
            tx = await stargateNFTContract.mint(levelId, user.address);
            await tx.wait();

            const tokenId = await stargateNFTContract.getCurrentTokenId();
            log("✅ Minted token id: ", tokenId);

            expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.true;
        });
    });
});
