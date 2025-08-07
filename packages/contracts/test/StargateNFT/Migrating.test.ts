import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { StargateNFT, TokenAuction, Errors, ClockAuction } from "../../typechain-types";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { StrengthLevel, TokenMetadataRaw } from "@repo/config/contracts/VechainNodes";
import { LevelRaw } from "@repo/config/contracts/StargateNFT";
import { getStargateNFTErrorsInterface, mineBlocks } from "../helpers/common";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { TransactionResponse } from "ethers";

describe("shard9: StargateNFT Migration", () => {
  let tx: TransactionResponse;

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

    beforeEach(async () => {
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
      tx = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );
      await tx.wait();
      // Admin sets Stargate NFT as operator of Legacy Token Auction
      tx = await legacyNodes.addOperator(await stargateNFT.getAddress());
      await tx.wait();

      // Admin updates lead time on Legacy Token Auction
      tx = await legacyNodes.setLeadTime(0);
      await tx.wait();

      // Get new migration requirements, ie level spec
      tokenLevelSpec = await stargateNFT.getLevel(levelToMigrate);
      await mineBlocks(1); // wait 1 block
    });

    it("should not have migrated yet", async () => {
      await expect(stargateNFT.getToken(legacyTokenId)).to.be.reverted;
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
      await expect(stargateNFT.connect(admin).migrate(legacyTokenId)).to.be.reverted;
    });

    it("should have enough VET to migrate", async () => {
      const user1Balance = await ethers.provider.getBalance(user1);
      const requiredVetAmount = tokenLevelSpec[5];
      expect(user1Balance).to.be.greaterThan(requiredVetAmount);
    });

    it("should migrate", async () => {
      tx = await stargateNFT.connect(user1).migrate(legacyTokenId, { value: tokenLevelSpec[5] });
      await tx.wait();

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
      tx = await stargateNFT.connect(user1).migrate(legacyTokenId, { value: tokenLevelSpec[5] });
      await tx.wait();

      await expect(stargateNFT.connect(user1).migrate(legacyTokenId, { value: tokenLevelSpec[5] }))
        .to.be.reverted;
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

    beforeEach(async () => {
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
      tx = await legacyNodes
        .connect(admin)
        .addToken(
          addTokenParams.addr,
          addTokenParams.lvl,
          addTokenParams.onUpgrade,
          addTokenParams.applyUpgradeTime,
          addTokenParams.applyUpgradeBlockno
        );
      await tx.wait();
      // Admin sets Stargate NFT as operator of Legacy Token Auction
      tx = await legacyNodes.addOperator(await stargateNFT.getAddress());
      await tx.wait();

      // Admin updates lead time on Legacy Token Auction
      tx = await legacyNodes.setLeadTime(0);
      await tx.wait();

      // Get new migration requirements, ie level spec
      tokenLevelSpec = await stargateNFT.getLevel(levelToMigrate);
      await mineBlocks(1); // wait 10 blocks
    });

    it("should not be able to migrate a token that does not exist", async () => {
      await expect(stargateNFT.connect(user1).migrate(100, { value: 100 })).to.be.reverted;
    });

    it("should not be able to migrate a token that is currently on auction", async () => {
      tx = await legacyNodes.connect(user1).createSaleAuction(legacyTokenId, 100, 200, 10000);
      await tx.wait();

      expect(await legacyNodesAuction.isOnAuction(legacyTokenId)).to.be.true;

      await expect(stargateNFT.connect(user1).migrate(legacyTokenId, { value: tokenLevelSpec[5] }))
        .to.be.reverted;

      tx = await legacyNodes.connect(user1).cancelAuction(legacyTokenId);
      await tx.wait();
      expect(await legacyNodesAuction.isOnAuction(legacyTokenId)).to.be.false;
    });

    it("should not be able to migrate a token that is on upgrade", async () => {
      tx = await legacyNodes.connect(user2).applyUpgrade(1);
      await tx.wait();
      const tokenId = await legacyNodes.ownerToId(user2.address);

      // onUpgrade is true
      expect((await legacyNodes.getMetadata(tokenId))[2]).to.be.true;

      await expect(stargateNFT.connect(user2).migrate(tokenId, { value: tokenLevelSpec[5] })).to.be
        .reverted;

      tx = await legacyNodes.connect(admin).cancelUpgrade(tokenId);
      await tx.wait();
      expect((await legacyNodes.getMetadata(tokenId))[2]).to.be.false;
    });

    // TODO: fix this test works on hh but not on solo
    it.skip("should not be able to migrate a token under the lead time", async () => {
      tx = await legacyNodes.connect(admin).setLeadTime(0);
      await tx.wait();
      tx = await legacyNodes.connect(admin).setTransferCooldown(0);
      await tx.wait();

      tx = await legacyNodes.connect(user1).transfer(await user3.getAddress(), legacyTokenId);
      const receipt = await tx.wait();
      if (!receipt) {
        throw new Error("Transaction failed");
      }

      tx = await legacyNodes.connect(admin).setLeadTime(1000);
      await tx.wait();
      tx = await legacyNodes.connect(admin).setTransferCooldown(1000);
      await tx.wait();

      expect((await legacyNodes.getMetadata(legacyTokenId))[4]).to.be.greaterThan(
        receipt.blockNumber + 1000 // 1000 blocks
      );

      await expect(
        stargateNFT
          .connect(user3)
          .migrate(legacyTokenId, { value: tokenLevelSpec[5], gasLimit: 10_000_000 })
      ).to.be.reverted;
    });

    it("cannot migrate if vet staked is less or more than required", async () => {
      await expect(
        stargateNFT.connect(user3).migrate(legacyTokenId, { value: tokenLevelSpec[5] - 1n })
      ).to.be.reverted;

      await expect(
        stargateNFT.connect(user3).migrate(legacyTokenId, { value: tokenLevelSpec[5] + 1n })
      ).to.be.reverted;
    });

    it("can correctly migrate if token is not on auction, not in lead time, and not on upgrade", async () => {
      tx = await legacyNodes.connect(user1).transfer(await user3.getAddress(), legacyTokenId);
      await tx.wait();
      await expect(
        stargateNFT
          .connect(user3)
          .migrate(legacyTokenId, { value: tokenLevelSpec[5], gasLimit: 10_000_000 })
      ).to.not.be.reverted;
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
      tx = await legacyNodesContract.addToken(StakeUtility.target, lvId, false, 0, 0);
      await tx.wait();
      const legacyNodeId = await legacyNodesContract.ownerToId(StakeUtility.target);

      // Call the execute function of the mock contract to migrateAndDelegate
      // This should revert because the owner changes during the process
      await expect(
        StakeUtility.migrateAndDelegate(legacyNodeId, {
          value: ethers.parseEther("1"),
        })
      ).to.be.reverted;
    });
  });

  describe("Maturity period validation", () => {
    // Test data mapping level IDs to their expected maturity periods from local.ts
    const expectedMaturityPeriods = [
      { levelId: 1, name: "Strength", maturityBlocks: 10, isX: false },
      { levelId: 2, name: "Thunder", maturityBlocks: 20, isX: false },
      { levelId: 3, name: "Mjolnir", maturityBlocks: 30, isX: false },
      { levelId: 4, name: "VeThorX", maturityBlocks: 0, isX: true },
      { levelId: 5, name: "StrengthX", maturityBlocks: 0, isX: true },
      { levelId: 6, name: "ThunderX", maturityBlocks: 0, isX: true },
      { levelId: 7, name: "MjolnirX", maturityBlocks: 0, isX: true },
      { levelId: 8, name: "Dawn", maturityBlocks: 5, isX: false },
      { levelId: 9, name: "Lightning", maturityBlocks: 10, isX: false },
      { levelId: 10, name: "Flash", maturityBlocks: 15, isX: false },
    ];

    let stargateNFTContract: StargateNFT;
    let legacyNodesContract: TokenAuction;
    let deployer: HardhatEthersSigner;
    let config: ReturnType<typeof createLocalConfig>;

    beforeEach(async () => {
      // Create fresh config for each test to avoid pollution
      config = createLocalConfig();
      // Update the config with the expected maturity periods
      for (const level of expectedMaturityPeriods) {
        config.TOKEN_LEVELS[level.levelId - 1].level.maturityBlocks = level.maturityBlocks;
      }

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateNFTContract = contracts.stargateNFTContract;
      legacyNodesContract = contracts.legacyNodesContract;
      deployer = contracts.deployer;
    });

    it("should not apply maturity periods to migrated nodes", async () => {
      // Test migration for each legacy level (1-7)
      const legacyLevels = expectedMaturityPeriods.slice(0, 7); // Only legacy levels can be migrated

      for (let i = 0; i < legacyLevels.length; i++) {
        const level = legacyLevels[i];
        const user = deployer;

        // Create legacy node for this level
        tx = await legacyNodesContract.addToken(user.address, level.levelId, false, 0, 0);
        await tx.wait();
        const legacyNodeId = await legacyNodesContract.ownerToId(user.address);

        const tokenLevelSpec = await stargateNFTContract.getLevel(level.levelId);
        const requiredVetAmount = tokenLevelSpec.vetAmountRequiredToStake;

        // expect that maturity period is not applied even if the level has a maturity period
        if (!level.isX) {
          expect(level.maturityBlocks).to.be.greaterThan(0);
        }

        // Migrate the token
        tx = await stargateNFTContract.connect(user).migrate(legacyNodeId, {
          value: requiredVetAmount,
          gasLimit: 10_000_000,
        });
        await tx.wait();

        const token = await stargateNFTContract.getToken(legacyNodeId);
        const migrationBlockNumber = token[2];
        const migrationBlockClock = await stargateNFTContract.clock();
        expect(migrationBlockClock).to.be.equal(migrationBlockNumber);

        // Verify migrated token has no maturity period regardless of level config
        const isTokenUnderMaturityPeriod = await stargateNFTContract.isUnderMaturityPeriod(
          token.tokenId
        );
        expect(isTokenUnderMaturityPeriod).to.be.false;

        const maturityPeriodEndBlock = await stargateNFTContract.maturityPeriodEndBlock(
          token.tokenId
        );
        expect(maturityPeriodEndBlock).to.be.equal(migrationBlockNumber);
      }
    });

    it("should apply correct maturity periods to newly minted tokens (non-X levels)", async () => {
      // Test only non-X levels that can be minted
      const mintableLevels = expectedMaturityPeriods.filter((level) => !level.isX);

      for (const level of mintableLevels) {
        const tokenLevelSpec = await stargateNFTContract.getLevel(level.levelId);
        expect(tokenLevelSpec.maturityBlocks).to.be.greaterThan(0);
        const requiredVetAmount = tokenLevelSpec.vetAmountRequiredToStake;

        // Stake VET to mint a new token
        tx = await stargateNFTContract
          .connect(deployer)
          .stake(level.levelId, { value: requiredVetAmount, gasLimit: 10_000_000 });
        const receipt = await tx.wait();
        if (!receipt) {
          throw new Error("Mint transaction failed");
        }

        const mintBlockNumber = receipt.blockNumber;

        // Get the minted token ID (assuming it's the next available ID)
        const tokenId = await stargateNFTContract.getCurrentTokenId();

        const token = await stargateNFTContract.getToken(tokenId);
        expect(mintBlockNumber).to.equal(token.mintedAtBlock);

        // Token should be under maturity period initially
        const isTokenUnderMaturityPeriod = await stargateNFTContract.isUnderMaturityPeriod(tokenId);
        expect(isTokenUnderMaturityPeriod).to.be.true;

        // Maturity period end block should be mint block + maturity blocks
        const maturityPeriodEndBlock = await stargateNFTContract.maturityPeriodEndBlock(tokenId);
        const expectedEndBlock = mintBlockNumber + level.maturityBlocks;
        expect(mintBlockNumber).to.be.lessThan(expectedEndBlock);
        expect(maturityPeriodEndBlock).to.be.equal(expectedEndBlock);
      }
    });

    it("should not be able to mint X tokens", async () => {
      for (const level of expectedMaturityPeriods) {
        if (level.isX) {
          const tokenLevelSpec = await stargateNFTContract.getLevel(level.levelId);
          const requiredVetAmount = tokenLevelSpec[5];

          await expect(
            stargateNFTContract.connect(deployer).stake(level.levelId, { value: requiredVetAmount })
          ).to.be.reverted;
        }
      }
    });
  });
});
