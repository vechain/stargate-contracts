import { expect } from "chai";
import { StartedTestContainer } from "testcontainers";
import { Errors, StargateNFT, Stargate } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse, ZeroAddress } from "ethers";
import {
    getStargateNFTErrorsInterface,
    getOrDeployContracts,
    createThorSoloContainer,
    stakeAndMatureNFT,
    stakeNFT,
} from "../helpers";

describe("shard-i9: Token Manager", () => {
    let soloContainer: StartedTestContainer;

    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;

    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let manager: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tx: TransactionResponse;
    let stargateNftErrors: Errors;

    beforeEach(async () => {
        soloContainer = await createThorSoloContainer();

        const contracts = await getOrDeployContracts({ forceDeploy: true });
        stargateNFTContract = contracts.stargateNFTContract;
        stargateContract = contracts.stargateContract;

        deployer = contracts.deployer;
        user = contracts.otherAccounts[0];
        manager = contracts.otherAccounts[1];
        otherAccounts = contracts.otherAccounts;
        stargateNftErrors = await getStargateNFTErrorsInterface();
    });

    afterEach(async () => {
        if (soloContainer) {
            await soloContainer.stop();
        }
    });

    it("should be able to add a token manager", async () => {
        const levelId = 1;
        const { tokenId } = await stakeAndMatureNFT(
            user,
            levelId,
            stargateNFTContract,
            stargateContract
        );

        tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
        await tx.wait();

        expect(tx)
            .to.emit(stargateNFTContract, "TokenManagerAdded")
            .withArgs(tokenId, manager.address);

        expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(manager.address);
        expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.true;
    });

    it("shouldn't be able to add a token manager if the token is not owned by the caller", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);

        await expect(
            stargateNFTContract.connect(manager).addTokenManager(user.address, tokenId)
        ).to.be.revertedWithCustomError(stargateNftErrors, "NotOwner");
    });

    it("shouldn't be able to the owner as a token manager", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);

        await expect(
            stargateNFTContract.connect(user).addTokenManager(user.address, tokenId)
        ).to.be.revertedWithCustomError(stargateNftErrors, "SelfManager");
    });

    it("shouldn't be able to add a token manager if the token does not exist", async () => {
        await expect(
            stargateNFTContract.connect(user).addTokenManager(manager.address, 1)
        ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken");
    });

    it("should be able to add a token manager if the token is already managed by another address", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);

        tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
        await tx.wait();

        tx = await stargateNFTContract
            .connect(user)
            .addTokenManager(otherAccounts[2].address, tokenId);
        await tx.wait();

        expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(
            otherAccounts[2].address
        );
        expect(await stargateNFTContract.isTokenManager(otherAccounts[2].address, tokenId)).to.be
            .true;
        expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.false;
    });

    it("should be able to remove a token manager", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);

        tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
        await tx.wait();

        tx = await stargateNFTContract.connect(user).removeTokenManager(tokenId);
        await tx.wait();

        expect(tx)
            .to.emit(stargateNFTContract, "TokenManagerRemoved")
            .withArgs(tokenId, manager.address);

        expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(user.address);
        expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.false;
    });

    it("shouldn't be able to remove a token manager if the token is not owned by the caller", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
        await tx.wait();

        await expect(
            stargateNFTContract.connect(otherAccounts[2]).removeTokenManager(tokenId)
        ).to.be.revertedWithCustomError(stargateNftErrors, "NotTokenManagerOrOwner");
    });

    it("should be able to remove a token manager if its called by the token manager", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
        await tx.wait();

        tx = await stargateNFTContract.connect(manager).removeTokenManager(tokenId);
        await tx.wait();

        expect(tx)
            .to.emit(stargateNFTContract, "TokenManagerRemoved")
            .withArgs(tokenId, manager.address);
        expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(user.address);
        expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.false;
    });

    it("shouldn't be able to remove a token manager if it has no manager", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        await expect(
            stargateNFTContract.connect(user).removeTokenManager(tokenId)
        ).to.be.revertedWithCustomError(stargateNftErrors, "NoTokenManager");
    });

    it("should automatically remove a token manager if the token is transferred", async () => {
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
        await tx.wait();

        expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(manager.address);
        expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.true;

        tx = await stargateNFTContract
            .connect(user)
            .transferFrom(user.address, otherAccounts[2].address, tokenId);
        await tx.wait();

        expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(
            otherAccounts[2].address
        );
        expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.false;
        // other account is the new manager because it is the new owner
        expect(await stargateNFTContract.isTokenManager(otherAccounts[2].address, tokenId)).to.be
            .true;
        expect(await stargateNFTContract.ownerOf(tokenId)).to.deep.equal(otherAccounts[2].address);
    });

    it("should be able to remove a token manager if the token is burned", async () => {
        const levelId = 1;
        const { tokenId } = await stakeAndMatureNFT(
            user,
            levelId,
            stargateNFTContract,
            stargateContract
        );
        tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
        await tx.wait();

        tx = await stargateContract.connect(user).unstake(tokenId);
        await tx.wait();

        expect(tx)
            .to.emit(stargateNFTContract, "TokenManagerRemoved")
            .withArgs(tokenId, manager.address);

        await expect(stargateNFTContract.getTokenManager(tokenId)).to.be.revertedWithCustomError(
            stargateNFTContract,
            "ERC721NonexistentToken"
        );
        await expect(
            stargateNFTContract.isTokenManager(manager.address, tokenId)
        ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721NonexistentToken");
        await expect(stargateNFTContract.isManagedByOwner(tokenId)).to.be.revertedWithCustomError(
            stargateNFTContract,
            "ERC721NonexistentToken"
        );
    });

    it("should ensure getters are working correctly", async () => {
        let managerTokenIds: bigint[];
        let userTokenIds: bigint[];
        const levelId = 1;
        const { tokenId } = await stakeNFT(user, levelId, stargateContract, stargateNFTContract);
        tx = await stargateNFTContract.connect(user).addTokenManager(manager.address, tokenId);
        await tx.wait();

        let managerTokensOverview = await stargateNFTContract.tokensOverview(manager.address);
        let userTokensOverview = await stargateNFTContract.tokensOverview(user.address);
        expect(managerTokensOverview).to.deep.equal([
            [tokenId, user.address, manager.address, levelId],
        ]);
        expect(userTokensOverview).to.deep.equal([
            [tokenId, user.address, manager.address, levelId],
        ]);
        // manager is managing the token
        managerTokenIds = await stargateNFTContract.idsManagedBy(manager.address);
        // user is not managing the token
        userTokenIds = await stargateNFTContract.idsManagedBy(user.address);
        // it should get the token id that the manager is managing
        expect(managerTokenIds).to.deep.equal([tokenId]);
        // user is not managing the token
        expect(userTokenIds).to.deep.equal([]);
        // manager is managing the token
        expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(manager.address);
        expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.true;
        expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.false;

        // remove the manager
        tx = await stargateNFTContract.connect(user).removeTokenManager(tokenId);
        await tx.wait();

        managerTokensOverview = await stargateNFTContract.tokensOverview(manager.address);
        userTokensOverview = await stargateNFTContract.tokensOverview(user.address);
        expect(managerTokensOverview).to.deep.equal([]);
        expect(userTokensOverview).to.deep.equal([[tokenId, user.address, user.address, levelId]]);

        // manager is not managing the token
        managerTokenIds = await stargateNFTContract.idsManagedBy(manager.address);
        // user is managing the token
        userTokenIds = await stargateNFTContract.idsManagedBy(user.address);
        // it should get no tokens for the manager
        expect(managerTokenIds).to.deep.equal([]);
        // user is managing the token
        expect(userTokenIds).to.deep.equal([tokenId]);
        // user is managing the token
        expect(await stargateNFTContract.getTokenManager(tokenId)).to.equal(user.address);
        // manager is no longer a manager of the token
        expect(await stargateNFTContract.isTokenManager(manager.address, tokenId)).to.be.false;
        // user is managing the token
        expect(await stargateNFTContract.isManagedByOwner(tokenId)).to.be.true;
    });
});
