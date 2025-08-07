import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { StargateNFT, TokenAuction } from "../../typechain-types";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  time,
  setBalance,
  impersonateAccount,
  stopImpersonatingAccount,
} from "@nomicfoundation/hardhat-network-helpers";

// This tests were written to demonstrate the functionality of the TokenAuction contract
// They are not used in the app and are skipped for now
describe.skip("TokenAuction", () => {
  describe("Mint NFT via addToken, an external function restricted to onlyOperator", () => {
    let legacyNodes: TokenAuction;
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let user3: HardhatEthersSigner;

    before(async () => {
      const { legacyNodesContract, deployer, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });

      legacyNodes = legacyNodesContract;
      admin = deployer;
      user1 = otherAccounts[0]; // whale account
      user2 = otherAccounts[10];
      user3 = otherAccounts[1]; // another whale account
    });

    it("should revert if a non-operator calls addToken", async () => {
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: 1, // Mint Strength level 1 NFT
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      await expect(
        legacyNodes
          .connect(user1)
          .addToken(
            addTokenParams.addr,
            addTokenParams.lvl,
            addTokenParams.onUpgrade,
            addTokenParams.applyUpgradeTime,
            addTokenParams.applyUpgradeBlockno
          )
      ).to.be.reverted;
    });

    it("should allow admin to call addToken", async () => {
      // Mint NFT
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: 1, // Mint Strength level 1 NFT
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      const tx = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );
      const txTimestamp = (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp;
      const expectedTokenId = 1;

      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1); // FYI returns isToken(_owner) ? 1 : 0;

      expect(await legacyNodes.ownerOf(expectedTokenId)).to.be.equal(user1); // FYI returns idToOwner[_tokenId];
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(expectedTokenId);

      expect(await legacyNodes.isToken(user1)).to.be.true;
      expect(await legacyNodes.isNormalToken(user1)).to.be.true;
      expect(await legacyNodes.isX(user1)).to.be.false;

      // Assertions re token supply
      expect(await legacyNodes.totalSupply()).to.be.equal(1); // FYI returns uint256(normalTokenCount + xTokenCount);
      expect(await legacyNodes.normalTokenCount()).to.be.equal(1);
      expect(await legacyNodes.xTokenCount()).to.be.equal(0);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(addTokenParams.addr); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(addTokenParams.lvl); // level
      expect(tokenMetadata[2]).to.be.equal(addTokenParams.onUpgrade); // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(txTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(txTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(txTimestamp); // updatedAt
    });

    it("should revert when admin tries to mint an NFT for an address that already has an NFT", async () => {
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: 6, // Mint Thunder X level 6 NFT
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      await expect(
        legacyNodes
          .connect(admin)
          .addToken(
            addTokenParams.addr,
            addTokenParams.lvl,
            addTokenParams.onUpgrade,
            addTokenParams.applyUpgradeTime,
            addTokenParams.applyUpgradeBlockno
          )
      ).to.be.revertedWith("you already hold a token");
    });

    it("should allow admin to mint an NFT of any level, regardless of the wallet balance", async () => {
      // Assert that user2 has insufficient balance...
      const user2Balance = await ethers.provider.getBalance(user2);
      const requiredBalance = ethers.parseEther("5600000");
      expect(user2Balance).to.be.lessThan(requiredBalance);

      // Mint NFT
      const addTokenParams = {
        addr: await user2.getAddress(),
        lvl: 6, // Mint Thunder X level 6 NFT
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      const tx = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );
      const txTimestamp = (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp;
      const expectedTokenId = 2;

      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user2)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user2);
      expect(await legacyNodes.ownerToId(user2)).to.be.equal(expectedTokenId);

      expect(await legacyNodes.isToken(user2)).to.be.true;
      expect(await legacyNodes.isNormalToken(user2)).to.be.false;
      expect(await legacyNodes.isX(user2)).to.be.true;

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(1);
      expect(await legacyNodes.xTokenCount()).to.be.equal(1);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(addTokenParams.addr); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(addTokenParams.lvl); // level
      expect(tokenMetadata[2]).to.be.equal(addTokenParams.onUpgrade); // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(txTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(txTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(txTimestamp); // updatedAt
    });

    it("should update supply even if admin marks token as onUpgrade true", async () => {
      // Arrange upgrade data
      const currentBlockNumber = (await ethers.provider.getBlockNumber()) ?? 0;
      const currentBlockTimestamp =
        (await ethers.provider.getBlock(currentBlockNumber))?.timestamp ?? 0;

      // Mint NFT
      const addTokenParams = {
        addr: await user3.getAddress(),
        lvl: 6, // Mint Thunder X level 6 NFT
        onUpgrade: true,
        applyUpgradeTime: currentBlockTimestamp + 1,
        applyUpgradeBlockno: currentBlockNumber + 1,
      };
      const tx = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );
      const txTimestamp = (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp;
      const expectedTokenId = 3;
      // console.log("***** FYI currentBlockTimestamp vs txTimestamp", currentBlockTimestamp, txTimestamp);

      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user3)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user3);
      expect(await legacyNodes.ownerToId(user3)).to.be.equal(expectedTokenId);

      expect(await legacyNodes.isToken(user3)).to.be.true;
      expect(await legacyNodes.isNormalToken(user3)).to.be.false;
      expect(await legacyNodes.isX(user3)).to.be.true;

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(1);
      expect(await legacyNodes.xTokenCount()).to.be.equal(2);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(addTokenParams.addr); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(addTokenParams.lvl); // level
      expect(tokenMetadata[2]).to.be.equal(addTokenParams.onUpgrade); // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(txTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(txTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(txTimestamp); // updatedAt
    });
  });

  describe("Upgrade NFT via upgradeTo, an external function restricted to onlyOperator", () => {
    let legacyNodes: TokenAuction;
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    let mintingTimestamp: number;
    const levelToMint = 3; // Mint Mjolnir level 3 NFT
    const expectedTokenId = 1;

    before(async () => {
      const { legacyNodesContract, deployer, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });

      legacyNodes = legacyNodesContract;
      admin = deployer;
      user1 = otherAccounts[10];

      // Mint NFT
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: levelToMint,
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      const tx = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );
      mintingTimestamp = (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp ?? 0;
    });

    it("should start testing with expected state", async () => {
      // A reminder that user adress balance does not matter
      const requiredBalance = ethers.parseEther("15000000");
      const user1Balance = await ethers.provider.getBalance(user1);
      expect(user1Balance).to.be.lessThan(requiredBalance);

      // More assertions re user
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(expectedTokenId);

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(1);
      expect(await legacyNodes.xTokenCount()).to.be.equal(0);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(levelToMint); // level
      expect(tokenMetadata[2]).to.be.false; // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(mintingTimestamp); // updatedAt
    });

    it("should allow admin to upgrade NFT to any level", async () => {
      // Upgrade NFT to Mjolnir X level 6
      const upgradeLevel = levelToMint + 3;
      const tx = await legacyNodes.connect(admin).upgradeTo(expectedTokenId, upgradeLevel);
      const txTimestamp = (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp ?? 0;

      // Assertions re user - tokenId remains since it's the same NFT but with different metadata
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(expectedTokenId);

      // Assertions re token supply - we're upgrading from a normal token to an X token, hence the change
      expect(await legacyNodes.normalTokenCount()).to.be.equal(0);
      expect(await legacyNodes.xTokenCount()).to.be.equal(1);

      // Assertions re token metadata - notice changes compared to the previous test
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(upgradeLevel); // level
      expect(tokenMetadata[2]).to.be.false; // onUpgrade NOTICE: function `upgradeTo` sets `onUpgrade` to false
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(txTimestamp); // updatedAt
    });
  });

  describe("Apply for a token via applyUpgrade, which is an external function", () => {
    let legacyNodes: TokenAuction;
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    let mintingTimestamp: number;
    const levelToMint = 1; // Mint Strength level 1 NFT
    const expectedTokenId = 1;

    before(async () => {
      const { legacyNodesContract, deployer, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });

      legacyNodes = legacyNodesContract;
      admin = deployer;
      user1 = otherAccounts[0];
    });

    it("should revert when a user that does not hold an NFT applies for a level > 1", async () => {
      // Assertions re user balance before minting
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(0); // User does not have any NFTs yet

      // Apply for Thunder level 2 NFT
      const forbiddenLevel = 2;
      await expect(legacyNodes.connect(user1).applyUpgrade(forbiddenLevel)).to.be.revertedWith(
        "invalid _toLvl"
      );

      // Assert that contract state has not changed
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(0);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(ethers.ZeroAddress);
    });

    it("should be able to apply for an NFT of level 1, for as long as the wallet has enough VET", async () => {
      // Specs to mint Strength level 1 NFT
      const requiredBalance = ethers.parseEther("1000000");

      // Assertions re user balance before minting
      const user1Balance = await ethers.provider.getBalance(user1);
      expect(user1Balance).to.be.greaterThan(requiredBalance);
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(0); // User does not have any NFTs yet

      // Apply for NFT
      const tx = await legacyNodes.connect(user1).applyUpgrade(levelToMint);
      mintingTimestamp = (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp ?? 0;

      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(0); // Remember balanceOf relies on isToken being true
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(expectedTokenId);

      expect(await legacyNodes.isToken(user1)).to.be.false; // because level has to be > 0
      expect(await legacyNodes.isNormalToken(user1)).to.be.false; // because relies on isToken being true
      expect(await legacyNodes.isX(user1)).to.be.false;

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(0); // because only addToken and _levelChange update this count
      expect(await legacyNodes.xTokenCount()).to.be.equal(0); // because only addToken and _levelChange update this count

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(levelToMint - 1); // level NOTICE: level is still 0!
      expect(tokenMetadata[2]).to.be.true; // onUpgrade NOTICE: function `applyUpgrade` sets `onUpgrade` to true
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(mintingTimestamp); // updatedAt
    });

    it("should finish upgrade when calling upgradeTo", async () => {
      // A reminder that user still has no balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(0);

      // Upgrade task runs
      // https://github.com/vechain/rewards-cronjob/blob/301736a60b72e25e447656a84b1d19e7f0e2f8c0/xnode-scripts/node/node_upgrade.js#L479
      const tx = await legacyNodes.connect(admin).upgradeTo(expectedTokenId, levelToMint);
      const txTimestamp = (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp ?? 0;

      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1); // Changed from 0 to 1
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(expectedTokenId);

      expect(await legacyNodes.isToken(user1)).to.be.true; // Changed from false to true
      expect(await legacyNodes.isNormalToken(user1)).to.be.true; // Changed from false to true
      expect(await legacyNodes.isX(user1)).to.be.false;

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(1); // Changed from 0 to 1
      expect(await legacyNodes.xTokenCount()).to.be.equal(0);

      // Assertions re token metadata - notice changes compared to the previous test
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(levelToMint); // level
      expect(tokenMetadata[2]).to.be.false; // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(txTimestamp); // updatedAt
    });
  });

  describe("Apply for a token level upgrade via applyUpgrade", () => {
    let legacyNodes: TokenAuction;
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;

    let user1MintingTimestamp: number;
    let user2MintingTimestamp: number;

    let user1LevelToMint = 1; // Mint Strength level 1 NFT
    let user2LevelToMint = 5; // Mint Strength X level 5 NFT
    const user1TokenId = 1;
    const user2TokenId = 2;

    const supply = 1;

    before(async () => {
      const { legacyNodesContract, deployer, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });

      legacyNodes = legacyNodesContract;
      admin = deployer;
      user1 = otherAccounts[0];
      user2 = otherAccounts[1];

      // Mint an NFT to user1, who's to be a normal node holder
      const addTokenParamsUser1 = {
        addr: await user1.getAddress(),
        lvl: user1LevelToMint,
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      const txUser1 = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParamsUser1.addr,
          addTokenParamsUser1.lvl,
          addTokenParamsUser1.onUpgrade,
          addTokenParamsUser1.applyUpgradeTime,
          addTokenParamsUser1.applyUpgradeBlockno
        );
      user1MintingTimestamp =
        (await ethers.provider.getBlock(txUser1.blockHash ?? "0x"))?.timestamp ?? 0;

      // Mint an NFT to user2, who's to be an X node holder
      const addTokenParamsUser2 = {
        addr: await user2.getAddress(),
        lvl: user2LevelToMint,
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      const txUser2 = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParamsUser2.addr,
          addTokenParamsUser2.lvl,
          addTokenParamsUser2.onUpgrade,
          addTokenParamsUser2.applyUpgradeTime,
          addTokenParamsUser2.applyUpgradeBlockno
        );
      user2MintingTimestamp =
        (await ethers.provider.getBlock(txUser2.blockHash ?? "0x"))?.timestamp ?? 0;
    });

    it("should start testing with expected state", async () => {
      // Assertions re user1
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(user1TokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(user1TokenId);

      // Assertions re token1 metadata
      const tokenMetadataUser1 = await legacyNodes.getMetadata(user1TokenId);
      expect(tokenMetadataUser1[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadataUser1[1]).to.be.equal(user1LevelToMint); // level
      expect(tokenMetadataUser1[2]).to.be.false; // onUpgrade
      expect(tokenMetadataUser1[3]).to.be.false; // isOnAuction
      expect(tokenMetadataUser1[4]).to.be.equal(user1MintingTimestamp); // lastTransferTime
      expect(tokenMetadataUser1[5]).to.be.equal(user1MintingTimestamp); // createdAt
      expect(tokenMetadataUser1[6]).to.be.equal(user1MintingTimestamp); // updatedAt

      // Assertions re user2
      expect(await legacyNodes.balanceOf(user2)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(user2TokenId)).to.be.equal(user2);
      expect(await legacyNodes.ownerToId(user2)).to.be.equal(user2TokenId);

      // Assertions re token2 metadata
      const tokenMetadataUser2 = await legacyNodes.getMetadata(user2TokenId);
      expect(tokenMetadataUser2[0]).to.be.equal(user2); // idToOwner
      expect(tokenMetadataUser2[1]).to.be.equal(user2LevelToMint); // level
      expect(tokenMetadataUser2[2]).to.be.false; // onUpgrade
      expect(tokenMetadataUser2[3]).to.be.false; // isOnAuction
      expect(tokenMetadataUser2[4]).to.be.equal(user2MintingTimestamp); // lastTransferTime
      expect(tokenMetadataUser2[5]).to.be.equal(user2MintingTimestamp); // createdAt
      expect(tokenMetadataUser2[6]).to.be.equal(user2MintingTimestamp); // updatedAt

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(supply);
      expect(await legacyNodes.xTokenCount()).to.be.equal(supply);
    });

    it("should revert if any user applies for a level that is not consecutive", async () => {
      const forbiddenLevel1 = user1LevelToMint + 2;
      const forbiddenLevel2 = user2LevelToMint + 2;
      await expect(legacyNodes.connect(user1).applyUpgrade(forbiddenLevel1)).to.be.revertedWith(
        "invalid _toLvl"
      );
      await expect(legacyNodes.connect(user2).applyUpgrade(forbiddenLevel2)).to.be.revertedWith(
        "invalid _toLvl"
      );
    });

    it("should allow users to apply for consecutive levels", async () => {
      // Apply for consecutive levels
      const nextLevel1 = user1LevelToMint + 1; // Apply for Thunder level 2 NFT
      const nextLevel2 = user2LevelToMint + 1; // Apply for Thunder X level 6 NFT
      const txUser1 = await legacyNodes.connect(user1).applyUpgrade(nextLevel1);
      const txUser2 = await legacyNodes.connect(user2).applyUpgrade(nextLevel2);
      const tx1Timestamp =
        (await ethers.provider.getBlock(txUser1.blockHash ?? "0x"))?.timestamp ?? 0;
      const tx2Timestamp =
        (await ethers.provider.getBlock(txUser2.blockHash ?? "0x"))?.timestamp ?? 0;

      // Assert that balance of user1 and user2 is still 1
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1);
      expect(await legacyNodes.balanceOf(user2)).to.be.equal(1);

      // Assert that supply has not changed
      expect(await legacyNodes.normalTokenCount()).to.be.equal(supply);
      expect(await legacyNodes.xTokenCount()).to.be.equal(supply);

      // Assertions re token1 metadata
      const tokenMetadataUser1 = await legacyNodes.getMetadata(user1TokenId);
      expect(tokenMetadataUser1[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadataUser1[1]).to.be.equal(user1LevelToMint); // level - UPGRADE DID NOT HAPPEN YET
      expect(tokenMetadataUser1[2]).to.be.true; // onUpgrade - NFT IS MARKED AS UPGRADING
      expect(tokenMetadataUser1[3]).to.be.false; // isOnAuction
      expect(tokenMetadataUser1[4]).to.be.equal(user1MintingTimestamp); // lastTransferTime
      expect(tokenMetadataUser1[5]).to.be.equal(user1MintingTimestamp); // createdAt
      expect(tokenMetadataUser1[6]).to.be.equal(tx1Timestamp); // updatedAt - TIMESTAMP OF UPGRADE APPLICATION

      // Assertions re token2 metadata
      const tokenMetadataUser2 = await legacyNodes.getMetadata(user2TokenId);
      expect(tokenMetadataUser2[0]).to.be.equal(user2); // idToOwner
      expect(tokenMetadataUser2[1]).to.be.equal(user2LevelToMint); // level - UPGRADE DID NOT HAPPEN YET
      expect(tokenMetadataUser2[2]).to.be.true; // onUpgrade - NFT IS MARKED AS UPGRADING
      expect(tokenMetadataUser2[3]).to.be.false; // isOnAuction
      expect(tokenMetadataUser2[4]).to.be.equal(user2MintingTimestamp); // lastTransferTime
      expect(tokenMetadataUser2[5]).to.be.equal(user2MintingTimestamp); // createdAt
      expect(tokenMetadataUser2[6]).to.be.equal(tx2Timestamp); // updatedAt - TIMESTAMP OF UPGRADE APPLICATION
    });

    it("should revert if any user tries to apply for another upgrade while token is still upgrading", async () => {
      const nextNextLevel1 = user1LevelToMint + 2;
      const nextNextLevel2 = user2LevelToMint + 2;
      await expect(legacyNodes.connect(user1).applyUpgrade(nextNextLevel1)).to.be.revertedWith(
        "still upgrading"
      );
      await expect(legacyNodes.connect(user2).applyUpgrade(nextNextLevel2)).to.be.revertedWith(
        "still upgrading"
      );
    });

    it("should finish upgrade when calling upgradeTo", async () => {
      // Complete upgrade
      user1LevelToMint += 1;
      const txUser1 = await legacyNodes.connect(admin).upgradeTo(user1TokenId, user1LevelToMint);
      const tx1Timestamp =
        (await ethers.provider.getBlock(txUser1.blockHash ?? "0x"))?.timestamp ?? 0;

      user2LevelToMint += 1;
      const txUser2 = await legacyNodes.connect(admin).upgradeTo(user2TokenId, user2LevelToMint);
      const tx2Timestamp =
        (await ethers.provider.getBlock(txUser2.blockHash ?? "0x"))?.timestamp ?? 0;

      // Assertions re token1 metadata
      const tokenMetadataUser1 = await legacyNodes.getMetadata(user1TokenId);
      expect(tokenMetadataUser1[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadataUser1[1]).to.be.equal(user1LevelToMint); // level - UPGRADE FINISHED
      expect(tokenMetadataUser1[2]).to.be.false; // onUpgrade - BACK TO FALSE
      expect(tokenMetadataUser1[3]).to.be.false; // isOnAuction
      expect(tokenMetadataUser1[4]).to.be.equal(user1MintingTimestamp); // lastTransferTime
      expect(tokenMetadataUser1[5]).to.be.equal(user1MintingTimestamp); // createdAt
      expect(tokenMetadataUser1[6]).to.be.equal(tx1Timestamp); // updatedAt - TIMESTAMP OF UPGRADE FINISHING

      // Assertions re token2 metadata
      const tokenMetadataUser2 = await legacyNodes.getMetadata(user2TokenId);
      expect(tokenMetadataUser2[0]).to.be.equal(user2); // idToOwner
      expect(tokenMetadataUser2[1]).to.be.equal(user2LevelToMint); // level - UPGRADE FINISHED
      expect(tokenMetadataUser2[2]).to.be.false; // onUpgrade - BACK TO FALSE
      expect(tokenMetadataUser2[3]).to.be.false; // isOnAuction
      expect(tokenMetadataUser2[4]).to.be.equal(user2MintingTimestamp); // lastTransferTime
      expect(tokenMetadataUser2[5]).to.be.equal(user2MintingTimestamp); // createdAt
      expect(tokenMetadataUser2[6]).to.be.equal(tx2Timestamp); // updatedAt - TIMESTAMP OF UPGRADE FINISHING
    });

    it("should be able to bump another level", async () => {
      const nextLevel1 = user1LevelToMint + 1; // Apply for Mjolnir level 3 NFT
      const nextLevel2 = user2LevelToMint + 1; // Apply for Mjolnir X level 6 NFT

      // Apply for consecutive levels
      await legacyNodes.connect(user1).applyUpgrade(nextLevel1);
      await legacyNodes.connect(user2).applyUpgrade(nextLevel2);

      // Bump level
      user1LevelToMint += 1;
      const txUser1 = await legacyNodes.connect(admin).upgradeTo(user1TokenId, user1LevelToMint);
      const tx1Timestamp =
        (await ethers.provider.getBlock(txUser1.blockHash ?? "0x"))?.timestamp ?? 0;

      user2LevelToMint += 1;
      const txUser2 = await legacyNodes.connect(admin).upgradeTo(user2TokenId, user2LevelToMint);
      const tx2Timestamp =
        (await ethers.provider.getBlock(txUser2.blockHash ?? "0x"))?.timestamp ?? 0;

      // Assertions re token1 metadata
      const tokenMetadataUser1 = await legacyNodes.getMetadata(user1TokenId);
      expect(tokenMetadataUser1[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadataUser1[1]).to.be.equal(user1LevelToMint); // level - UPGRADE FINISHED
      expect(tokenMetadataUser1[2]).to.be.false; // onUpgrade - BACK TO FALSE
      expect(tokenMetadataUser1[3]).to.be.false; // isOnAuction
      expect(tokenMetadataUser1[4]).to.be.equal(user1MintingTimestamp); // lastTransferTime
      expect(tokenMetadataUser1[5]).to.be.equal(user1MintingTimestamp); // createdAt
      expect(tokenMetadataUser1[6]).to.be.equal(tx1Timestamp); // updatedAt - TIMESTAMP OF UPGRADE FINISHING

      // Assertions re token2 metadata
      const tokenMetadataUser2 = await legacyNodes.getMetadata(user2TokenId);
      expect(tokenMetadataUser2[0]).to.be.equal(user2); // idToOwner
      expect(tokenMetadataUser2[1]).to.be.equal(user2LevelToMint); // level - UPGRADE FINISHED
      expect(tokenMetadataUser2[2]).to.be.false; // onUpgrade - BACK TO FALSE
      expect(tokenMetadataUser2[3]).to.be.false; // isOnAuction
      expect(tokenMetadataUser2[4]).to.be.equal(user2MintingTimestamp); // lastTransferTime
      expect(tokenMetadataUser2[5]).to.be.equal(user2MintingTimestamp); // createdAt
      expect(tokenMetadataUser2[6]).to.be.equal(tx2Timestamp); // updatedAt - TIMESTAMP OF UPGRADE FINISHING
    });

    it("should revert another application from user1 since they cannot go into X levels", async () => {
      const forbiddenLevel1 = user1LevelToMint + 1; // Apply for VeThor X level 4 NFT
      await expect(legacyNodes.connect(user1).applyUpgrade(forbiddenLevel1)).to.be.revertedWith(
        "invalid _toLvl"
      );
    });

    it("should revert another application from user2 since they reached max level", async () => {
      const forbiddenLevel2 = user2LevelToMint + 1; // No more levels after Mjolnir X
      await expect(legacyNodes.connect(user2).applyUpgrade(forbiddenLevel2)).to.be.reverted; // Enum is "out of bounds", fails silently
    });
  });

  describe("Cancel an upgrade via cancelUpgrade, which is a public function", () => {
    let legacyNodes: TokenAuction;
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    let mintingTimestamp: number;
    let applyUpgradeTimestamp: number;
    const levelToMint = 1; // Mint Strength level 1 NFT
    const expectedTokenId = 1;

    before(async () => {
      const { legacyNodesContract, deployer, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });

      legacyNodes = legacyNodesContract;
      admin = deployer;
      user1 = otherAccounts[0];

      // Mint NFT
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: levelToMint,
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      const tx1 = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );
      mintingTimestamp = (await ethers.provider.getBlock(tx1.blockHash ?? "0x"))?.timestamp ?? 0;

      // Apply for an upgrade
      const nextLevel = levelToMint + 1;
      const tx2 = await legacyNodes.connect(user1).applyUpgrade(nextLevel);
      applyUpgradeTimestamp =
        (await ethers.provider.getBlock(tx2.blockHash ?? "0x"))?.timestamp ?? 0;
    });

    it("should start testing with expected state", async () => {
      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(expectedTokenId);

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(1);
      expect(await legacyNodes.xTokenCount()).to.be.equal(0);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(levelToMint); // level
      expect(tokenMetadata[2]).to.be.true; // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(applyUpgradeTimestamp); // updatedAt
    });

    it("should allow anyone to cancel upgrade", async () => {
      const tx = await legacyNodes.connect(user1).cancelUpgrade(expectedTokenId);
      const cancelUpgradeTimestamp =
        (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp ?? 0;

      // Assertions re token metadata - notice changes compared to the previous test
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(levelToMint); // level
      expect(tokenMetadata[2]).to.be.false; // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(cancelUpgradeTimestamp); // updatedAt
    });
  });

  describe("Downgrade tokens via downgradeTo, an external function restricted to onlyOperator", () => {
    let legacyNodes: TokenAuction;
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    let mintingTimestamp: number;
    let levelToMint = 5; // Mint Strength X level 5 NFT
    const expectedTokenId = 1;

    before(async () => {
      const { legacyNodesContract, deployer, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });

      legacyNodes = legacyNodesContract;
      admin = deployer;
      user1 = otherAccounts[0];

      // Arrange upgrade data
      const currentBlockNumber = (await ethers.provider.getBlockNumber()) ?? 0;
      const currentBlockTimestamp =
        (await ethers.provider.getBlock(currentBlockNumber))?.timestamp ?? 0;

      // Mint NFT, force it to an upgrade state
      const addTokenParamsUser1 = {
        addr: await user1.getAddress(),
        lvl: levelToMint,
        onUpgrade: true,
        applyUpgradeTime: currentBlockTimestamp + 1,
        applyUpgradeBlockno: currentBlockNumber + 1,
      };
      const txUser1 = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParamsUser1.addr,
          addTokenParamsUser1.lvl,
          addTokenParamsUser1.onUpgrade,
          addTokenParamsUser1.applyUpgradeTime,
          addTokenParamsUser1.applyUpgradeBlockno
        );
      mintingTimestamp =
        (await ethers.provider.getBlock(txUser1.blockHash ?? "0x"))?.timestamp ?? 0;

      // set lead time and transfer cooldown to original values
      await legacyNodes.setTransferCooldown(1 * 24 * 60 * 60); // 1 day in seconds
      await legacyNodes.setLeadTime(4 * 60 * 60); // 4 hours in seconds
    });

    it("should start testing with expected state", async () => {
      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(expectedTokenId);

      expect(await legacyNodes.isToken(user1)).to.be.true;
      expect(await legacyNodes.isNormalToken(user1)).to.be.false;
      expect(await legacyNodes.isX(user1)).to.be.true;

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(0);
      expect(await legacyNodes.xTokenCount()).to.be.equal(1);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(levelToMint); // level
      expect(tokenMetadata[2]).to.be.true; // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(mintingTimestamp); // updatedAt
    });

    it("should revert when attempting to downgrade before leadtime ends", async () => {
      const lowerLevel = 1;
      await expect(
        legacyNodes.connect(admin).downgradeTo(expectedTokenId, lowerLevel)
      ).to.be.revertedWith("cannot downgrade token");
    });

    it("should allow an operator to downgrade an NFT to any level", async () => {
      // Arrange downgrading - ie, fast forward leadtime, which is 4h
      await time.setNextBlockTimestamp((await time.latest()) + 4 * 60 * 60);

      // Downgrade task runs
      // https://github.com/vechain/rewards-cronjob/blob/301736a60b72e25e447656a84b1d19e7f0e2f8c0/xnode-scripts/node/node_monitor.js#L434
      levelToMint = 1; // Downgrade to normal Strength
      const tx = await legacyNodes.connect(admin).downgradeTo(expectedTokenId, levelToMint);
      const txTimestamp = (await ethers.provider.getBlock(tx.blockHash ?? "0x"))?.timestamp ?? 0;

      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1);

      expect(await legacyNodes.isToken(user1)).to.be.true;
      expect(await legacyNodes.isNormalToken(user1)).to.be.true;
      expect(await legacyNodes.isX(user1)).to.be.false;

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(1);
      expect(await legacyNodes.xTokenCount()).to.be.equal(0);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(levelToMint); // level NOTICE: new level
      expect(tokenMetadata[2]).to.be.false; // onUpgrade NOTICE: function cancels any ongoing upgrade process
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(txTimestamp); // updatedAt
    });

    it("should destroy the NFT when downgrading to level 0", async () => {
      // *******************************************
      // NOTE FOR THIS TEST TIME HAS ALREADY BEEN FF
      // *******************************************

      // Downgrade to level None, ie Destroy!
      levelToMint = 0;
      await legacyNodes.connect(admin).downgradeTo(expectedTokenId, levelToMint);

      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(0); // Remember balanceOf relies on isToken being true
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(ethers.ZeroAddress);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(0);

      expect(await legacyNodes.isToken(user1)).to.be.false; // because level has to be > 0
      expect(await legacyNodes.isNormalToken(user1)).to.be.false; // relies on isToken too
      expect(await legacyNodes.isX(user1)).to.be.false;

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(0);
      expect(await legacyNodes.xTokenCount()).to.be.equal(0);

      // Assertions re token metadata - defaults to zero state
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(ethers.ZeroAddress); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(0); // level
      expect(tokenMetadata[2]).to.be.false; // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(0); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(0); // createdAt
      expect(tokenMetadata[6]).to.be.equal(0); // updatedAt
    });
  });

  describe("Set up StargateNFT as operator for downgrading tokens via downgradeTo", () => {
    let legacyNodes: TokenAuction;
    let stargateNFT: StargateNFT;
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    let mintingTimestamp: number;
    let levelToMint = 1; // Mint Strength level 1 NFT
    const expectedTokenId = 1;

    before(async () => {
      const { legacyNodesContract, stargateNFTContract, deployer, otherAccounts } =
        await getOrDeployContracts({ forceDeploy: true });

      legacyNodes = legacyNodesContract;
      stargateNFT = stargateNFTContract;
      admin = deployer;
      user1 = otherAccounts[0];

      // Mint NFT
      const addTokenParamsUser1 = {
        addr: await user1.getAddress(),
        lvl: levelToMint,
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      const txUser1 = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParamsUser1.addr,
          addTokenParamsUser1.lvl,
          addTokenParamsUser1.onUpgrade,
          addTokenParamsUser1.applyUpgradeTime,
          addTokenParamsUser1.applyUpgradeBlockno
        );
      mintingTimestamp =
        (await ethers.provider.getBlock(txUser1.blockHash ?? "0x"))?.timestamp ?? 0;
    });

    it("should start testing with expected state", async () => {
      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(1);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(user1);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(expectedTokenId);

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(1);
      expect(await legacyNodes.xTokenCount()).to.be.equal(0);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(user1); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(levelToMint); // level
      expect(tokenMetadata[2]).to.be.false; // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(mintingTimestamp); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(mintingTimestamp); // createdAt
      expect(tokenMetadata[6]).to.be.equal(mintingTimestamp); // updatedAt
    });

    it("should allow to set up a contract as operator", async () => {
      await legacyNodes.connect(admin).addOperator(await stargateNFT.getAddress());
      expect(await legacyNodes.operators(stargateNFT)).to.be.true;
    });

    it("should allow admin to update lead time", async () => {
      await legacyNodes.connect(admin).setLeadTime(0);
      expect(await legacyNodes.leadTime()).to.be.equal(0);
    });

    it("should allow contract operator to destroy an NFT", async () => {
      // *******************************************
      // NOTE FOR THIS TEST TIME JUMP IS NOT NEEDED
      // *******************************************

      // Get the StargateNFT contract address
      const stargateNFTAddress = await stargateNFT.getAddress();

      // Impersonate the StargateNFT contract, add some ETH to pay for gas - needed for the downgradeTo call
      await impersonateAccount(stargateNFTAddress);
      const stargateNFTSigner = await ethers.provider.getSigner(stargateNFTAddress);
      await setBalance(stargateNFTAddress, ethers.parseEther("1"));

      // Downgrade to level None, ie Destroy!
      levelToMint = 0;
      await legacyNodes.connect(stargateNFTSigner).downgradeTo(expectedTokenId, levelToMint);

      // Stop impersonating
      await stopImpersonatingAccount(stargateNFTAddress);

      // Assertions re user and their balance
      expect(await legacyNodes.balanceOf(user1)).to.be.equal(0);
      expect(await legacyNodes.idToOwner(expectedTokenId)).to.be.equal(ethers.ZeroAddress);
      expect(await legacyNodes.ownerToId(user1)).to.be.equal(0);

      // Assertions re token supply
      expect(await legacyNodes.normalTokenCount()).to.be.equal(0);
      expect(await legacyNodes.xTokenCount()).to.be.equal(0);

      // Assertions re token metadata
      const tokenMetadata = await legacyNodes.getMetadata(expectedTokenId);
      expect(tokenMetadata[0]).to.be.equal(ethers.ZeroAddress); // idToOwner
      expect(tokenMetadata[1]).to.be.equal(0); // level
      expect(tokenMetadata[2]).to.be.false; // onUpgrade
      expect(tokenMetadata[3]).to.be.false; // isOnAuction
      expect(tokenMetadata[4]).to.be.equal(0); // lastTransferTime
      expect(tokenMetadata[5]).to.be.equal(0); // createdAt
      expect(tokenMetadata[6]).to.be.equal(0); // updatedAt
    });
  });

  describe("Token metadata", () => {
    let legacyNodes: TokenAuction;

    before(async () => {
      const { legacyNodesContract } = await getOrDeployContracts({ forceDeploy: true });
      legacyNodes = legacyNodesContract;
    });

    it("should default to zero state when token does not exist", async () => {
      // Assert that there are no tokens
      expect(await legacyNodes.totalSupply()).to.be.equal(0);

      // Assert that the token metadata is the zero state
      const nonExistentTokenId = 1;
      const tokenMetadata = await legacyNodes.getMetadata(nonExistentTokenId);
      expect(tokenMetadata[0]).to.be.equal(ethers.ZeroAddress);
      expect(tokenMetadata[1]).to.be.equal(0);
      expect(tokenMetadata[2]).to.be.false;
      expect(tokenMetadata[3]).to.be.false;
      expect(tokenMetadata[4]).to.be.equal(0);
    });
  });
});
