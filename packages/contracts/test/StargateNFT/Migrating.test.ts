import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { StargateNFT, TokenAuction, Errors, ClockAuction } from "../../typechain-types";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { StrengthLevel, TokenMetadataRaw } from "@repo/config/contracts/VechainNodes";
import { LevelRaw } from "@repo/config/contracts/StargateNFT";
import { getStargateNFTErrorsInterface } from "../helpers/common";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { createLegacyNodeHolder } from "../helpers";

describe("StargateNFT migrating", () => {
  describe("Scenario: Old Node Holder Receives a New NFT", () => {
    // Contracts
    let legacyNodes: TokenAuction; // old
    let stargateNFT: StargateNFT; // new
    let errorsInterface: Errors;

    // Token data
    const legacyTokenId = 1;
    const levelToMigrate = StrengthLevel.VeThorX;
    let legacyTokenMetadata: TokenMetadataRaw;
    let tokenLevelSpec: LevelRaw;

    // Signers
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    before(async () => {
      const { stargateNFTContract, legacyNodesContract, deployer, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Contracts
      legacyNodes = legacyNodesContract;
      stargateNFT = stargateNFTContract;
      errorsInterface = await getStargateNFTErrorsInterface(stargateNFT);

      // Signers
      admin = deployer;
      user1 = otherAccounts[0];

      // Admin mints legacy NFTs to user1
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: levelToMigrate,
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );

      // Admin sets Stargate NFT as operator of Legacy Token Auction
      await legacyNodes.addOperator(await stargateNFT.getAddress());

      // Admin updates lead time on Legacy Token Auction
      await legacyNodes.setLeadTime(0);

      // Get new migration requirements, ie level spec
      tokenLevelSpec = await stargateNFT.getLevel(levelToMigrate);
    });

    it("should not have migrated yet", async () => {
      await expect(stargateNFT.getToken(legacyTokenId)).to.be.revertedWithCustomError(
        stargateNFT,
        "ERC721NonexistentToken"
      );
    });

    it("should exist in legacy contract", async () => {
      expect(await legacyNodes.idToOwner(legacyTokenId)).to.be.equal(user1);
    });

    it("should be the owner of the old node", async () => {
      legacyTokenMetadata = await legacyNodes.getMetadata(legacyTokenId);
      expect(legacyTokenMetadata[0]).to.be.equal(user1); // idToOwner
    });

    it("should meet migration criteria on legacy contract", async () => {
      // Should not be upgrading
      expect(legacyTokenMetadata[2]).to.be.false;
      // Should not be on auction
      expect(legacyTokenMetadata[3]).to.be.false;
      // Should be destroyable, ie lastTransferTime + leadTime is in the past
      const lastTransferTimestamp = legacyTokenMetadata[4]; // createdAt
      const leadTime = await legacyNodes.leadTime();
      const currentBlockTimestamp = await ethers.provider.getBlock(
        await ethers.provider.getBlockNumber()
      );
      expect(currentBlockTimestamp?.timestamp).to.be.greaterThan(lastTransferTimestamp + leadTime);
    });

    it("should be the caller", async () => {
      await expect(stargateNFT.connect(admin).migrate(legacyTokenId)).to.be.revertedWithCustomError(
        errorsInterface,
        "NotOwner"
      );
    });

    it("should have enough VET to migrate", async () => {
      const user1Balance = await ethers.provider.getBalance(user1);
      const requiredVetAmount = tokenLevelSpec[5];
      expect(user1Balance).to.be.greaterThan(requiredVetAmount);
    });

    it("should migrate", async () => {
      await stargateNFT.connect(user1).migrate(legacyTokenId, { value: tokenLevelSpec[5] });

      // Assert that the NFT was migrated
      const token = await stargateNFT.getToken(legacyTokenId);

      expect(token[0]).to.be.equal(legacyTokenId);
      expect(token[1]).to.be.equal(levelToMigrate);
      expect(token[2]).to.be.greaterThan(0);
      expect(token[3]).to.be.equal(tokenLevelSpec[5]);

      // Token assertions
      expect(await stargateNFT.isXToken(token.tokenId)).to.be.true;
      expect(await stargateNFT.isNormalToken(token.tokenId)).to.be.false;
      expect(await stargateNFT.tokenExists(token.tokenId)).to.be.true;

      // Chek that token URI can be fetched correctly
      const baseURI = await stargateNFT.baseURI();
      const tokenURI = await stargateNFT.tokenURI(token.tokenId);
      expect(tokenURI).to.equal(`${baseURI}${token.levelId}.json`);
    });

    it("should not be able to migrate a token that is already migrated", async () => {
      await expect(
        stargateNFT.connect(user1).migrate(legacyTokenId, { value: tokenLevelSpec[5] })
      ).to.be.revertedWithCustomError(errorsInterface, "TokenNotEligible");
    });
  });

  describe("Scenarios: Not eligible to migrate", () => {
    // Contracts
    let legacyNodes: TokenAuction; // old
    let legacyNodesAuction: ClockAuction; // old
    let stargateNFT: StargateNFT; // new
    let errorsInterface: Errors;

    // Token data
    const legacyTokenId = 1;
    const levelToMigrate = StrengthLevel.MjolnirX;
    let legacyTokenMetadata: TokenMetadataRaw;
    let tokenLevelSpec: LevelRaw;

    // Signers
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let user3: HardhatEthersSigner;

    before(async () => {
      const {
        stargateNFTContract,
        legacyNodesContract,
        deployer,
        otherAccounts,
        legacyNodesAuctionContract,
      } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Contracts
      legacyNodes = legacyNodesContract;
      legacyNodesAuction = legacyNodesAuctionContract;
      stargateNFT = stargateNFTContract;
      errorsInterface = await getStargateNFTErrorsInterface(stargateNFT);

      // Signers
      admin = deployer;
      user1 = otherAccounts[0];
      user2 = otherAccounts[1];
      user3 = otherAccounts[2];

      // Admin mints legacy NFTs to user1
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: levelToMigrate,
        onUpgrade: false,
        applyUpgradeTime: 0,
        applyUpgradeBlockno: 0,
      };
      await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );

      // Admin sets Stargate NFT as operator of Legacy Token Auction
      await legacyNodes.addOperator(await stargateNFT.getAddress());

      // Admin updates lead time on Legacy Token Auction
      await legacyNodes.setLeadTime(0);

      // Get new migration requirements, ie level spec
      tokenLevelSpec = await stargateNFT.getLevel(levelToMigrate);
    });

    it("should not be able to migrate a token that does not exist", async () => {
      await expect(
        stargateNFT.connect(user1).migrate(100, { value: 100 })
      ).to.be.revertedWithCustomError(errorsInterface, "TokenNotEligible");
    });

    it("should not be able to migrate a token that is currently on auction", async () => {
      await legacyNodes.connect(user1).createSaleAuction(legacyTokenId, 100, 200, 10000);

      expect(await legacyNodesAuction.isOnAuction(legacyTokenId)).to.be.true;

      await expect(
        stargateNFT.connect(user1).migrate(legacyTokenId, { value: tokenLevelSpec[5] })
      ).to.be.revertedWithCustomError(errorsInterface, "TokenNotReadyForMigration");

      await legacyNodes.connect(user1).cancelAuction(legacyTokenId);
      expect(await legacyNodesAuction.isOnAuction(legacyTokenId)).to.be.false;
    });

    it("should not be able to migrate a token that is on upgrade", async () => {
      await legacyNodes.connect(user2).applyUpgrade(1);
      const tokenId = await legacyNodes.ownerToId(user2.address);

      // onUpgrade is true
      expect((await legacyNodes.getMetadata(tokenId))[2]).to.be.true;

      await expect(
        stargateNFT.connect(user2).migrate(tokenId, { value: tokenLevelSpec[5] })
      ).to.be.revertedWithCustomError(errorsInterface, "TokenNotReadyForMigration");

      await legacyNodes.connect(admin).cancelUpgrade(tokenId);
      expect((await legacyNodes.getMetadata(tokenId))[2]).to.be.false;
    });

    it("should not be able to migrate a token under the lead time", async () => {
      await legacyNodes.connect(admin).setLeadTime(0);
      await legacyNodes.connect(admin).setTransferCooldown(0);

      const tx = await legacyNodes.connect(user1).transfer(await user3.getAddress(), legacyTokenId);
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction failed");
      }

      await legacyNodes.connect(admin).setLeadTime(1000);
      await legacyNodes.connect(admin).setTransferCooldown(1000);

      expect((await legacyNodes.getMetadata(legacyTokenId))[4]).to.be.greaterThan(
        receipt.blockNumber + 1000 // 1000 blocks
      );

      await expect(
        stargateNFT.connect(user3).migrate(legacyTokenId, { value: tokenLevelSpec[5] })
      ).to.be.revertedWithCustomError(errorsInterface, "TokenNotReadyForMigration");

      await legacyNodes.connect(admin).setLeadTime(0);
      await legacyNodes.connect(admin).setTransferCooldown(0);
    });

    it("cannot migrate if vet staked is less or more than required", async () => {
      await expect(
        stargateNFT.connect(user3).migrate(legacyTokenId, { value: tokenLevelSpec[5] - 1n })
      ).to.be.revertedWithCustomError(errorsInterface, "VetAmountMismatch");

      await expect(
        stargateNFT.connect(user3).migrate(legacyTokenId, { value: tokenLevelSpec[5] + 1n })
      ).to.be.revertedWithCustomError(errorsInterface, "VetAmountMismatch");
    });

    it("can correctly migrate if token is not on auction, not in lead time, and not on upgrade", async () => {
      await expect(stargateNFT.connect(user3).migrate(legacyTokenId, { value: tokenLevelSpec[5] }))
        .to.not.be.reverted;
    });
  });

  describe("Owner change through callback edge case", () => {
    it("Migration should revert if the owner changed during the migrate process", async () => {
      const lvId = 1;
      const config = createLocalConfig();
      config.TOKEN_LEVELS[lvId - 1].level.vetAmountRequiredToStake = ethers.parseEther("1");

      const { stargateNFTContract, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      // Deploy the mock contract that will transfer the NFT to the owner
      const StakeUtilityFactory = await ethers.getContractFactory("StakeUtility");
      const StakeUtility = await StakeUtilityFactory.deploy(stargateNFTContract.target);
      await StakeUtility.waitForDeployment();

      // Create a legacy node holder
      await legacyNodesContract.addToken(StakeUtility.target, lvId, false, 0, 0);
      const legacyNodeId = await legacyNodesContract.ownerToId(StakeUtility.target);

      // Call the execute function of the mock contract to migrateAndDelegate
      // This should revert because the owner changes during the process
      await expect(
        StakeUtility.migrateAndDelegate(legacyNodeId, {
          value: ethers.parseEther("1"),
        })
      ).to.be.revertedWithCustomError(await getStargateNFTErrorsInterface(), "NotOwner");
    });
  });
});
