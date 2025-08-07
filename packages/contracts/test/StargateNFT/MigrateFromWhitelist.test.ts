import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Errors, StargateNFT, TokenAuction, StargateDelegation } from "../../typechain-types";
import { getOrDeployContracts, getStargateNFTErrorsInterface, mineBlocks } from "../helpers";
import { StrengthLevel } from "@repo/config/contracts/VechainNodes";
import { TransactionResponse } from "ethers";

describe("shard10: StargateNFT Whitelisted Migration", () => {
  // tx
  let tx: TransactionResponse;
  describe("Whitelisted nodes that were downgraded can be migrated", () => {
    // Contracts
    let legacyNodes: TokenAuction; // old
    let stargateNFT: StargateNFT; // new
    let stargateDelegation: StargateDelegation;

    // Signers
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    // Whitelist entry
    const whitelistedTokenId = 1;
    const whitelistedLevelId = StrengthLevel.MjolnirX;

    beforeEach(async () => {
      const {
        stargateNFTContract,
        legacyNodesContract,
        stargateDelegationContract,
        deployer,
        otherAccounts,
      } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Contracts
      legacyNodes = legacyNodesContract;
      stargateNFT = stargateNFTContract;
      stargateDelegation = stargateDelegationContract;

      // Signers
      admin = deployer;
      user1 = otherAccounts[0];

      // Admin adds a token to the legacyNodes contract
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: StrengthLevel.Strength,
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
      // Admin grants themselves WHITELISTER_ROLE
      tx = await stargateNFT
        .connect(admin)
        .grantRole(await stargateNFT.WHITELISTER_ROLE(), await admin.getAddress());
      await tx.wait();

      // User1 has become staker in StargateNFT
      const mjolnirSpec = await stargateNFT.getLevel(StrengthLevel.Mjolnir);
      tx = await stargateNFT
        .connect(user1)
        .stake(mjolnirSpec.id, { value: mjolnirSpec.vetAmountRequiredToStake });
      await tx.wait();
    });

    it("should start testing with expected state", async () => {
      // A node exists in the legacyNodes contract, owned by user1
      expect(await legacyNodes.totalSupply()).to.equal(1);
      expect(await legacyNodes.ownerToId(await user1.getAddress())).to.equal(whitelistedTokenId);

      // Existing legacy node is Strength level
      const tokenMetadata = await legacyNodes.getMetadata(whitelistedTokenId);
      expect(tokenMetadata[1]).to.equal(StrengthLevel.Strength);

      // TokenId does not exist in StargateNFT - expect ownerOf to revert
      await expect(stargateNFT.ownerOf(whitelistedTokenId)).to.be.reverted;

      // User1 is staker in StargateNFT
      expect(await stargateNFT.balanceOf(await user1.getAddress())).to.equal(1);
      expect(await stargateNFT.idsOwnedBy(await user1.getAddress())).to.deep.equal([
        await stargateNFT.getCurrentTokenId(),
      ]);

      // Deployer holds WHITELISTER_ROLE, necessary to add whitelist entry
      expect(
        await stargateNFT.hasRole(await stargateNFT.WHITELISTER_ROLE(), await admin.getAddress())
      ).to.be.true;
    });

    it("should be able to migrate a whitelisted tokenId to the whitelisted level", async () => {
      // Admin adds whitelist entry
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(await user1.getAddress(), whitelistedTokenId, whitelistedLevelId);
      await tx.wait();
      // Assert that the user is whitelisted as expected
      const whitelistEntry = await stargateNFT.getWhitelistEntry(await user1.getAddress());
      expect(whitelistEntry.tokenId).to.equal(whitelistedTokenId);
      expect(whitelistEntry.levelId).to.equal(whitelistedLevelId);

      // Assert that user has sufficient VET to migrate
      const mjolnirXSpec = await stargateNFT.getLevel(StrengthLevel.MjolnirX);
      const user1Balance = await ethers.provider.getBalance(await user1.getAddress());
      expect(user1Balance).to.be.greaterThan(mjolnirXSpec.vetAmountRequiredToStake);

      // Get level circulating supply and cap for later assertion
      const [circulatingSupply, cap] = await stargateNFT.getLevelSupply(whitelistedLevelId);

      // User1 migrates their whitelisted tokenId to the whitelisted level
      const autorenew = true;
      tx = await stargateNFT.connect(user1).migrateAndDelegate(whitelistedTokenId, autorenew, {
        value: mjolnirXSpec.vetAmountRequiredToStake,
      });
      await tx.wait();

      // Assert that the token was migrated
      expect(await stargateNFT.balanceOf(await user1.getAddress())).to.equal(2);
      const expectedIdsOwned = [await stargateNFT.getCurrentTokenId(), whitelistedTokenId];
      expect(await stargateNFT.idsOwnedBy(await user1.getAddress())).to.deep.equal(
        expectedIdsOwned
      );

      // and that the token was migrated to the whitelisted level
      const token = await stargateNFT.getToken(whitelistedTokenId);
      expect(token.levelId).to.equal(whitelistedLevelId);

      // and is delegated
      expect(await stargateDelegation.isDelegationActive(whitelistedTokenId)).to.be.true;

      // Assert that the level circulating supply and cap have been updated
      const [newCirculatingSupply, newCap] = await stargateNFT.getLevelSupply(whitelistedLevelId);
      expect(newCirculatingSupply).to.equal(circulatingSupply + 1n);
      expect(newCap).to.equal(cap + 1n);
    });

    it("should not be under maturity period after migration", async () => {
      // add whitelist entry
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(await user1.getAddress(), whitelistedTokenId, whitelistedLevelId);
      await tx.wait();
      const mjolnirXSpec = await stargateNFT.getLevel(StrengthLevel.MjolnirX);
      const autorenew = true;
      // migrate and delegate old node
      tx = await stargateNFT.connect(user1).migrateAndDelegate(whitelistedTokenId, autorenew, {
        value: mjolnirXSpec.vetAmountRequiredToStake,
      });
      await tx.wait();
      // check if under maturity period
      expect(await stargateNFT.isUnderMaturityPeriod(whitelistedTokenId)).to.be.false;
    });

    it("should have burned the node on the legacy contract after migration", async () => {
      // add whitelist entry
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(await user1.getAddress(), whitelistedTokenId, whitelistedLevelId);
      await tx.wait();
      const mjolnirXSpec = await stargateNFT.getLevel(StrengthLevel.MjolnirX);
      const autorenew = true;
      // migrate and delegate old node
      tx = await stargateNFT.connect(user1).migrateAndDelegate(whitelistedTokenId, autorenew, {
        value: mjolnirXSpec.vetAmountRequiredToStake,
      });
      await tx.wait();
      // Assert that the legacy node was burned
      expect(await legacyNodes.totalSupply()).to.equal(0);
      expect(await legacyNodes.ownerToId(await user1.getAddress())).to.equal(0);
    });

    it("should have removed entry from whitelist after migration", async () => {
      // add user whitelist entry
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(await user1.getAddress(), whitelistedTokenId, whitelistedLevelId);
      await tx.wait();
      const mjolnirXSpec = await stargateNFT.getLevel(StrengthLevel.MjolnirX);
      const autorenew = true;
      // migrade and delegate old node
      tx = await stargateNFT.connect(user1).migrateAndDelegate(whitelistedTokenId, autorenew, {
        value: mjolnirXSpec.vetAmountRequiredToStake,
      });
      await tx.wait();
      // Assert that the whitelist entry was removed
      const whitelistEntry = await stargateNFT.getWhitelistEntry(await user1.getAddress());
      expect(whitelistEntry.tokenId).to.equal(0);
      expect(whitelistEntry.levelId).to.equal(0);
    });
  });

  describe("Whitelisted nodes that were downgraded and migrated will need to be burned first", () => {
    // Contracts
    let legacyNodes: TokenAuction; // old
    let stargateNFT: StargateNFT; // new
    let stargateDelegation: StargateDelegation;
    let errorsInterface: Errors;

    // Signers
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    // Whitelist entry
    const whitelistedTokenId = 1;
    const whitelistedLevelId = StrengthLevel.MjolnirX;

    beforeEach(async () => {
      const {
        stargateNFTContract,
        legacyNodesContract,
        stargateDelegationContract,
        deployer,
        otherAccounts,
      } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Contracts
      legacyNodes = legacyNodesContract;
      stargateNFT = stargateNFTContract;
      stargateDelegation = stargateDelegationContract;
      errorsInterface = await getStargateNFTErrorsInterface(stargateNFT);

      // Signers
      admin = deployer;
      user1 = otherAccounts[0];

      // Admin adds a token to the legacyNodes contract
      const addTokenParams = {
        addr: await user1.getAddress(),
        lvl: StrengthLevel.Strength,
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
      // Admin grants themselves WHITELISTER_ROLE
      tx = await stargateNFT
        .connect(admin)
        .grantRole(await stargateNFT.WHITELISTER_ROLE(), await admin.getAddress());
      await tx.wait();

      // User1 has become staker in StargateNFT
      const mjolnirSpec = await stargateNFT.getLevel(StrengthLevel.Mjolnir);
      tx = await stargateNFT
        .connect(user1)
        .stake(mjolnirSpec.id, { value: mjolnirSpec.vetAmountRequiredToStake });
      await tx.wait();

      // User1 migrates their legacy downgraded node for whatever reason
      const strengthSpec = await stargateNFT.getLevel(StrengthLevel.Strength);
      const autorenew = false;
      tx = await stargateNFT.connect(user1).migrateAndDelegate(whitelistedTokenId, autorenew, {
        value: strengthSpec.vetAmountRequiredToStake,
      });
      await tx.wait();
    });

    it("should start testing with expected state", async () => {
      // There are no nodes in the legacyNodes contract
      expect(await legacyNodes.totalSupply()).to.equal(0);
      expect(await legacyNodes.ownerToId(await user1.getAddress())).to.equal(0);

      // TokenId does exist in StargateNFT
      expect(await stargateNFT.ownerOf(whitelistedTokenId)).to.equal(await user1.getAddress());

      // User1 has two tokens in StargateNFT
      expect(await stargateNFT.balanceOf(await user1.getAddress())).to.equal(2);

      const expectedIdsOwned = [await stargateNFT.getCurrentTokenId(), whitelistedTokenId];
      expect(await stargateNFT.idsOwnedBy(await user1.getAddress())).to.deep.equal(
        expectedIdsOwned
      );

      // Deployer holds WHITELISTER_ROLE, necessary to add whitelist entry
      expect(
        await stargateNFT.hasRole(await stargateNFT.WHITELISTER_ROLE(), await admin.getAddress())
      ).to.be.true;
    });

    it("should prevent migration for whitelisted tokenId since it already exists on StargateNFT", async () => {
      // Admin adds whitelist entry
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(await user1.getAddress(), whitelistedTokenId, whitelistedLevelId);
      await tx.wait();

      // Assert that the user is whitelisted as expected
      const whitelistEntry = await stargateNFT.getWhitelistEntry(await user1.getAddress());
      expect(whitelistEntry.tokenId).to.equal(whitelistedTokenId);
      expect(whitelistEntry.levelId).to.equal(whitelistedLevelId);

      // Migration should revert
      const mjolnirXSpec = await stargateNFT.getLevel(StrengthLevel.MjolnirX);
      await expect(
        stargateNFT.connect(user1).migrateAndDelegate(whitelistedTokenId, true, {
          value: mjolnirXSpec.vetAmountRequiredToStake,
        })
      ).to.be.reverted;
    });

    it("should be able to migrate a whitelisted tokenId after exiting delegation and unstaking", async () => {
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(await user1.getAddress(), whitelistedTokenId, whitelistedLevelId);
      await tx.wait();
      // Fast forward to the end of the delegation period
      const delegationEndBlock = await stargateDelegation.getDelegationEndBlock(whitelistedTokenId);
      const currentBlock = await stargateDelegation.clock();
      await mineBlocks(Number(delegationEndBlock) - Number(currentBlock));

      // Delegation should be inactive and the user can unstake
      expect(await stargateDelegation.isDelegationActive(whitelistedTokenId)).to.be.false;
      tx = await stargateNFT.connect(user1).unstake(whitelistedTokenId);
      await tx.wait();
      // Assert user updated balance on StargateNFT
      expect(await stargateNFT.balanceOf(await user1.getAddress())).to.equal(1);
      expect(await stargateNFT.idsOwnedBy(await user1.getAddress())).to.deep.equal([
        await stargateNFT.getCurrentTokenId(),
      ]);

      // and tokenId does not exist in StargateNFT
      await expect(stargateNFT.ownerOf(whitelistedTokenId)).to.be.reverted;

      // Assert that user has sufficient VET to migrate
      const mjolnirXSpec = await stargateNFT.getLevel(StrengthLevel.MjolnirX);
      const user1Balance = await ethers.provider.getBalance(await user1.getAddress());
      expect(user1Balance).to.be.greaterThan(mjolnirXSpec.vetAmountRequiredToStake);

      // Get level circulating supply and cap for later assertion
      const [circulatingSupply, cap] = await stargateNFT.getLevelSupply(whitelistedLevelId);

      // User1 migrates their whitelisted tokenId to the whitelisted level
      const autorenew = true;
      tx = await stargateNFT.connect(user1).migrateAndDelegate(whitelistedTokenId, autorenew, {
        value: mjolnirXSpec.vetAmountRequiredToStake,
      });
      await tx.wait();

      // Assert that the token was migrated, so user has two tokens again
      expect(await stargateNFT.balanceOf(await user1.getAddress())).to.equal(2);
      const expectedIdsOwned = [await stargateNFT.getCurrentTokenId(), whitelistedTokenId];
      expect(await stargateNFT.idsOwnedBy(await user1.getAddress())).to.deep.equal(
        expectedIdsOwned
      );

      // and that the token was migrated to the whitelisted level
      const token = await stargateNFT.getToken(whitelistedTokenId);
      expect(token.levelId).to.equal(whitelistedLevelId);

      // and is delegated
      expect(await stargateDelegation.isDelegationActive(whitelistedTokenId)).to.be.true;

      // Assert that the level circulating supply and cap have been updated
      const [newCirculatingSupply, newCap] = await stargateNFT.getLevelSupply(whitelistedLevelId);
      expect(newCirculatingSupply).to.equal(circulatingSupply + 1n);
      expect(newCap).to.equal(cap + 1n);
      // shouldnt be under maturity period
      expect(await stargateNFT.isUnderMaturityPeriod(whitelistedTokenId)).to.be.false;
      // whitelist entry should be removed
      const whitelistEntry = await stargateNFT.getWhitelistEntry(await user1.getAddress());
      expect(whitelistEntry.tokenId).to.equal(0);
      expect(whitelistEntry.levelId).to.equal(0);
    });
  });

  describe("Whitelisted nodes that were burned can be migrated", () => {
    // Contracts
    let legacyNodes: TokenAuction; // old
    let stargateNFT: StargateNFT; // new
    let stargateDelegation: StargateDelegation;

    // Signers
    let admin: HardhatEthersSigner;
    let user1: HardhatEthersSigner;

    // Whitelist entry
    const whitelistedTokenId = 1;
    const whitelistedLevelId = StrengthLevel.MjolnirX;

    beforeEach(async () => {
      const {
        stargateNFTContract,
        legacyNodesContract,
        stargateDelegationContract,
        deployer,
        otherAccounts,
      } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Contracts
      legacyNodes = legacyNodesContract;
      stargateNFT = stargateNFTContract;
      stargateDelegation = stargateDelegationContract;

      // Signers
      admin = deployer;
      user1 = otherAccounts[0];

      // Admin sets Stargate NFT as operator of Legacy Token Auction
      tx = await legacyNodes.addOperator(await stargateNFT.getAddress());
      await tx.wait();
      // Admin updates lead time on Legacy Token Auction
      tx = await legacyNodes.setLeadTime(0);
      await tx.wait();

      // Admin grants themselves WHITELISTER_ROLE
      tx = await stargateNFT
        .connect(admin)
        .grantRole(await stargateNFT.WHITELISTER_ROLE(), await admin.getAddress());

      await tx.wait();

      // User1 has become staker in StargateNFT
      const mjolnirSpec = await stargateNFT.getLevel(StrengthLevel.Mjolnir);
      tx = await stargateNFT
        .connect(user1)
        .stake(mjolnirSpec.id, { value: mjolnirSpec.vetAmountRequiredToStake });

      await tx.wait();
    });

    it("should start testing with expected state", async () => {
      // There are no nodes in the legacyNodes contract
      expect(await legacyNodes.totalSupply()).to.equal(0);
      expect(await legacyNodes.ownerToId(await user1.getAddress())).to.equal(0);

      // TokenId does not exist in StargateNFT - expect ownerOf to revert
      await expect(stargateNFT.ownerOf(whitelistedTokenId)).to.be.reverted;

      // User1 is staker in StargateNFT
      expect(await stargateNFT.balanceOf(await user1.getAddress())).to.equal(1);
      expect(await stargateNFT.idsOwnedBy(await user1.getAddress())).to.deep.equal([
        await stargateNFT.getCurrentTokenId(),
      ]);

      // Deployer holds WHITELISTER_ROLE, necessary to add whitelist entry
      expect(
        await stargateNFT.hasRole(await stargateNFT.WHITELISTER_ROLE(), await admin.getAddress())
      ).to.be.true;
    });

    it("should be able to migrate a whitelisted tokenId to the whitelisted level", async () => {
      // Admin adds whitelist entry
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(await user1.getAddress(), whitelistedTokenId, whitelistedLevelId);
      await tx.wait();
      // Assert that the user is whitelisted as expected
      let whitelistEntry = await stargateNFT.getWhitelistEntry(await user1.getAddress());
      expect(whitelistEntry.tokenId).to.equal(whitelistedTokenId);
      expect(whitelistEntry.levelId).to.equal(whitelistedLevelId);

      // Assert that user has sufficient VET to migrate
      const mjolnirXSpec = await stargateNFT.getLevel(StrengthLevel.MjolnirX);
      const user1Balance = await ethers.provider.getBalance(await user1.getAddress());
      expect(user1Balance).to.be.greaterThan(mjolnirXSpec.vetAmountRequiredToStake);

      // Get level circulating supply and cap for later assertion
      const [circulatingSupply, cap] = await stargateNFT.getLevelSupply(whitelistedLevelId);

      // User1 migrates their whitelisted tokenId to the whitelisted level
      const autorenew = true;
      tx = await stargateNFT.connect(user1).migrateAndDelegate(whitelistedTokenId, autorenew, {
        value: mjolnirXSpec.vetAmountRequiredToStake,
      });
      await tx.wait();

      // Assert that the token was migrated
      expect(await stargateNFT.balanceOf(await user1.getAddress())).to.equal(2);
      const expectedIdsOwned = [await stargateNFT.getCurrentTokenId(), whitelistedTokenId];
      expect(await stargateNFT.idsOwnedBy(await user1.getAddress())).to.deep.equal(
        expectedIdsOwned
      );

      // and that the token was migrated to the whitelisted level
      const token = await stargateNFT.getToken(whitelistedTokenId);
      expect(token.levelId).to.equal(whitelistedLevelId);

      // and is delegated
      expect(await stargateDelegation.isDelegationActive(whitelistedTokenId)).to.be.true;

      // Assert that the level circulating supply and cap have been updated
      const [newCirculatingSupply, newCap] = await stargateNFT.getLevelSupply(whitelistedLevelId);
      expect(newCirculatingSupply).to.equal(circulatingSupply + 1n);
      expect(newCap).to.equal(cap + 1n);
      // expect no maturity period
      expect(await stargateNFT.isUnderMaturityPeriod(whitelistedTokenId)).to.be.false;
      // Expect it to be removed from the whitelist
      whitelistEntry = await stargateNFT.getWhitelistEntry(await user1.getAddress());
      expect(whitelistEntry.tokenId).to.equal(0);
      expect(whitelistEntry.levelId).to.equal(0);
    });
  });

  describe("Malicious user attempts to migrate tokenId 0", () => {
    it("should revert", async () => {
      const { stargateNFTContract, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });
      // TODO uncomment whhen we can revert with custom errors
      // const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

      const maliciousUser = otherAccounts[0];

      // Tx should revert
      await expect(
        stargateNFTContract.connect(maliciousUser).migrateAndDelegate(0, true, { value: 0 })
      ).to.be.reverted;
    });
  });

  describe("Should revert if criteria is not met", () => {
    // Contracts
    let legacyNodes: TokenAuction; // old
    let stargateNFT: StargateNFT; // new
    let stargateDelegation: StargateDelegation;
    let errorsInterface: Errors;

    // Signers
    let admin: HardhatEthersSigner;
    let userAccounts: HardhatEthersSigner[];

    beforeEach(async () => {
      const {
        stargateNFTContract,
        legacyNodesContract,
        stargateDelegationContract,
        deployer,
        otherAccounts,
      } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Contracts
      legacyNodes = legacyNodesContract;
      stargateNFT = stargateNFTContract;
      stargateDelegation = stargateDelegationContract;
      errorsInterface = await getStargateNFTErrorsInterface(stargateNFT);

      // Signers
      admin = deployer;
      userAccounts = otherAccounts;

      // Admin sets Stargate NFT as operator of Legacy Token Auction
      tx = await legacyNodes.addOperator(await stargateNFT.getAddress());
      await tx.wait();

      // Admin updates lead time on Legacy Token Auction
      tx = await legacyNodes.setLeadTime(0);
      await tx.wait();

      // Admin grants themselves WHITELISTER_ROLE
      tx = await stargateNFT
        .connect(admin)
        .grantRole(await stargateNFT.WHITELISTER_ROLE(), await admin.getAddress());
      await tx.wait();
    });

    it("should revert if tokenId does not match whitelist entry", async () => {
      // Random user attempts to migrate and delegate with whatever tokenId
      const randomUser = userAccounts[1];
      const randomTokenId = 1000;

      // Assert supply is 0 on legacyNodes contract
      expect(await legacyNodes.totalSupply()).to.equal(0);

      // Assert supply is 0 on StargateNFT
      expect(await stargateNFT.totalSupply()).to.equal(0);

      // Assert address is not whitelisted
      const whitelistEntry = await stargateNFT.getWhitelistEntry(await randomUser.getAddress());
      expect(whitelistEntry.tokenId).to.equal(0);
      expect(whitelistEntry.levelId).to.equal(0);

      // Tx should go through migration (not migrateFromWhitelist) and revert
      await expect(
        stargateNFT.connect(randomUser).migrateAndDelegate(randomTokenId, true, { value: 0 })
      ).to.be.reverted;
    });

    it("should revert if whitelisted token belongs to a different address on legacy contract", async () => {
      // Add a token on legacy contract
      const nodeHolder = userAccounts[5];
      const nodeLevel = StrengthLevel.MjolnirX;

      const addTokenParams = {
        addr: await nodeHolder.getAddress(),
        lvl: nodeLevel,
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
      // Assert supply is 1 on legacyNodes contract
      expect(await legacyNodes.totalSupply()).to.equal(1);

      // Assert that token is owned by nodeHolder
      const tokenId = 1;
      expect(await legacyNodes.ownerToId(await nodeHolder.getAddress())).to.equal(tokenId);

      // Create whitelist entry for a third user
      // only users 1-8 are funded in hayabusa testnet
      const thirdUser = userAccounts[7];
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(await thirdUser.getAddress(), tokenId, nodeLevel);
      await tx.wait();
      // Tx should revert
      await expect(stargateNFT.connect(thirdUser).migrateAndDelegate(tokenId, true, { value: 0 }))
        .to.be.reverted;
    });

    it("should revert if user does not provide the exact amount of VET required to migrate", async () => {
      // Random user attempts to migrate and delegate with whatever tokenId
      // only users 1-8 are funded in hayabusa testnet
      const whitelistedUser = userAccounts[8];
      const whitelistedLevelId = StrengthLevel.MjolnirX;
      const whitelistedTokenId = 777;

      const addTokenParams = {
        addr: await whitelistedUser.getAddress(),
        lvl: whitelistedLevelId,
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

      // Update whitelist
      tx = await stargateNFT
        .connect(admin)
        .addWhitelistEntry(
          await whitelistedUser.getAddress(),
          whitelistedTokenId,
          whitelistedLevelId
        );
      await tx.wait();
      // Tx should revert if vet amount is zero, less or greater than required
      const mjolnirXSpec = await stargateNFT.getLevel(StrengthLevel.MjolnirX);
      await expect(
        stargateNFT
          .connect(whitelistedUser)
          .migrateAndDelegate(whitelistedTokenId, true, { value: 0 })
      ).to.be.reverted;
      await expect(
        stargateNFT.connect(whitelistedUser).migrateAndDelegate(whitelistedTokenId, true, {
          value: mjolnirXSpec.vetAmountRequiredToStake - 1n,
        })
      ).to.be.reverted;
      await expect(
        stargateNFT.connect(whitelistedUser).migrateAndDelegate(whitelistedTokenId, true, {
          value: mjolnirXSpec.vetAmountRequiredToStake + 1n,
        })
      ).to.be.reverted;
    });
  });
});
