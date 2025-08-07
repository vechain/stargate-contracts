import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { StargateNFT } from "../../typechain-types";
import { getOrDeployContracts } from "../helpers";

describe("shard5: StargateNFT Levels", () => {
  const config = createLocalConfig();

  let otherAccounts: HardhatEthersSigner[];
  let stargateNFTContract: StargateNFT;

  beforeEach(async () => {
    const contracts = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    otherAccounts = contracts.otherAccounts;
    stargateNFTContract = contracts.stargateNFTContract;
  });

  describe("Getters (some)", () => {
    it("should not be able to get a non-existing level", async () => {
      const fakeLevelId = 100;

      const levelIds = await stargateNFTContract.getLevelIds();

      expect(levelIds).to.not.include(fakeLevelId);

      await expect(stargateNFTContract.getLevel(fakeLevelId)).to.be.reverted;
    });

    it("should not be able to get the supply of a non-existing level", async () => {
      const fakeLevelId = 100;

      const levelIds = await stargateNFTContract.getLevelIds();

      expect(levelIds).to.not.include(fakeLevelId);

      await expect(stargateNFTContract.getLevelSupply(fakeLevelId)).to.be.reverted;
    });

    it("should not be able to get the circulating supply at block of a non-existent level", async () => {
      const fakeLevelId = 100;

      const levelIds = await stargateNFTContract.getLevelIds();

      expect(levelIds).to.not.include(fakeLevelId);

      const currentBlock = await stargateNFTContract.clock();
      await expect(stargateNFTContract.getCirculatingSupplyAtBlock(fakeLevelId, currentBlock)).to.be.reverted;
    });

    it("should not be able to get the circulating supply at block in the future", async () => {
      const currentBlock = await stargateNFTContract.clock();
      await expect(stargateNFTContract.getCirculatingSupplyAtBlock(1, currentBlock + 100n)).to.be.reverted;
    });

    it("should be able to get all levels", async () => {
      const levels = await stargateNFTContract.getLevels();

      for (let i = 0; i < levels.length; i++) {
        const level = levels[i];
        const configLevel = config.TOKEN_LEVELS[i];

        expect(level.id).to.equal(configLevel.level.id);
        expect(level.name).to.equal(configLevel.level.name);
        expect(level.isX).to.equal(configLevel.level.isX);
        expect(level.vetAmountRequiredToStake).to.equal(configLevel.level.vetAmountRequiredToStake);
        expect(level.scaledRewardFactor).to.equal(configLevel.level.scaledRewardFactor);
        expect(level.maturityBlocks).to.equal(configLevel.level.maturityBlocks);
      }
    });

    it("should be able to get all levels circulating supplies", async () => {
      const circulatingSupplies = await stargateNFTContract.getLevelsCirculatingSupplies();

      // Expect all circulating supplies to be 0
      expect(circulatingSupplies).to.deep.equal(Array(config.TOKEN_LEVELS.length).fill(0));

      // Mint a token
      const stakeTx = await stargateNFTContract.connect(otherAccounts[0]).stake(1, { value: config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake });
      await stakeTx.wait();

      // Assert circulating supply is 1
      const circulatingSuppliesAfter = await stargateNFTContract.getLevelsCirculatingSupplies();
      expect(circulatingSuppliesAfter).to.deep.equal([1].concat(Array(config.TOKEN_LEVELS.length - 1).fill(0)));
    });

    it("should be able to correctly track all levels circulating supplies at all blocks", async () => {
      const t0 = await stargateNFTContract.clock();
      const circulatingSuppliesAtT0 = await stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(t0);
      // console.log("circulatingSuppliesAtT0", circulatingSuppliesAtT0);

      // Mint a token of level 1
      const stakeTx1 = await stargateNFTContract.connect(otherAccounts[0]).stake(1, { value: config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake });
      const tx1Receipt = await stakeTx1.wait();

      const t1 = tx1Receipt?.blockNumber;
      if (!t1) {
        throw new Error("Transaction 1 did not include a block number");
      }
      const circulatingSuppliesAtT1 = await stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(t1);
      // console.log("circulatingSuppliesAtT1", circulatingSuppliesAtT1);

      // Mint a token of level 8
      const stakeTx2 = await stargateNFTContract.connect(otherAccounts[0]).stake(8, { value: config.TOKEN_LEVELS[7].level.vetAmountRequiredToStake });
      const tx2Receipt = await stakeTx2.wait();

      const t2 = tx2Receipt?.blockNumber;
      if (!t2) {
        throw new Error("Transaction 2 did not include a block number");
      }
      const circulatingSuppliesAtT2 = await stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(t2);
      // console.log("circulatingSuppliesAtT2", circulatingSuppliesAtT2);

      // Assertions
      // At t0, all circulating supplies are 0
      expect(circulatingSuppliesAtT0).to.deep.equal(Array(config.TOKEN_LEVELS.length).fill(0));

      // At t1, circulating supply of level 1 is 1, and all other levels are 0
      expect(circulatingSuppliesAtT1[0]).to.equal(1);
      expect(circulatingSuppliesAtT1[1]).to.equal(0);
      expect(circulatingSuppliesAtT1[2]).to.equal(0);
      expect(circulatingSuppliesAtT1[3]).to.equal(0);
      expect(circulatingSuppliesAtT1[4]).to.equal(0);
      expect(circulatingSuppliesAtT1[5]).to.equal(0);
      expect(circulatingSuppliesAtT1[6]).to.equal(0);
      expect(circulatingSuppliesAtT1[7]).to.equal(0);
      expect(circulatingSuppliesAtT1[8]).to.equal(0);
      expect(circulatingSuppliesAtT1[9]).to.equal(0);

      // At t2, circulating supply of levels 1 and 8 is 1, and all other levels are 0
      expect(circulatingSuppliesAtT2[0]).to.equal(1);
      expect(circulatingSuppliesAtT2[1]).to.equal(0);
      expect(circulatingSuppliesAtT2[2]).to.equal(0);
      expect(circulatingSuppliesAtT2[3]).to.equal(0);
      expect(circulatingSuppliesAtT2[4]).to.equal(0);
      expect(circulatingSuppliesAtT2[5]).to.equal(0);
      expect(circulatingSuppliesAtT2[6]).to.equal(0);
      expect(circulatingSuppliesAtT2[7]).to.equal(1);
      expect(circulatingSuppliesAtT2[8]).to.equal(0);
    });
  });

  describe("Add level", () => {
    it("should not be able to add level without level operator role", async () => {
      const currentLevelIds = await stargateNFTContract.getLevelIds();
      
      const unauthorisedUser = otherAccounts[0];

      expect(
        await stargateNFTContract.hasRole(
          await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
          unauthorisedUser.address
        )
      ).to.be.false;

      await expect(
        stargateNFTContract.connect(unauthorisedUser).addLevel({
          level: {
            id: 25, // This id does not matter since it will be replaced by the real one
            name: "My New Level",
            isX: false,
            vetAmountRequiredToStake: ethers.parseEther("1000000"),
            scaledRewardFactor: 150,
            maturityBlocks: 30,
          },
          cap: 872,
          circulatingSupply: 0,
        })
      ).to.be.reverted;

      expect(await stargateNFTContract.getLevelIds()).to.deep.equal(currentLevelIds);
    });

    it("should not be able to add level with invalid parameters", async () => {
      const currentLevelIds = await stargateNFTContract.getLevelIds();

      const levelOperator = otherAccounts[1];

      const grantTx = await stargateNFTContract.grantRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        levelOperator.address
      );
      await grantTx.wait();

      const testCases = [
        {
          test: "Level name cannot be empty",
          input: {
            level: {
              id: 0,
              name: "",
              isX: false,
              vetAmountRequiredToStake: ethers.parseEther("1000"),
              scaledRewardFactor: 100,
              maturityBlocks: 20,
            },
            cap: 1000,
            circulatingSupply: 0,
          },
        },
        {
          test: "Level VET requirement cannot be zero",
          input: {
            level: {
              id: 0,
              name: "Zero Vet",
              isX: false,
              vetAmountRequiredToStake: 0n,
              scaledRewardFactor: 100,
              maturityBlocks: 20,
            },
            cap: 1000,
            circulatingSupply: 0,
          },
        },
        {
          test: "Level circulating supply cannot be greater than cap",
          input: {
            level: {
              id: 0,
              name: "Bad Supply",
              isX: false,
              vetAmountRequiredToStake: ethers.parseEther("1000"),
              scaledRewardFactor: 100,
              maturityBlocks: 20,
            },
            cap: 100,
            circulatingSupply: 101,
          },
        },
      ];

      for (const testCase of testCases) {
        await expect(
          stargateNFTContract.connect(levelOperator).addLevel(testCase.input)
        ).to.be.reverted;

        expect(await stargateNFTContract.getLevelIds()).to.deep.equal(currentLevelIds);

        console.log(`          ${testCase.test} ✅`);
      }
    });

    it("should be able to add level, and levels should be sequentially numbered", async () => {
      const levelOperator = otherAccounts[2];

      const grantTx = await stargateNFTContract.grantRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        levelOperator.address
      );
      await grantTx.wait();

      const currentLevelIds = await stargateNFTContract.getLevelIds();

      const newLevelAndSupply = {
        level: {
          id: 25, // This id does not matter since it will be replaced by the real one
          name: "My New Level",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("1000000"),
          scaledRewardFactor: 150,
          maturityBlocks: 30,
        },
        cap: 872,
        circulatingSupply: 0,
      };

      const expectedLevelId = currentLevelIds[currentLevelIds.length - 1] + 1n;

      // Add new level
      const addLevelTx = await stargateNFTContract.connect(levelOperator).addLevel(newLevelAndSupply);
      await addLevelTx.wait();

      // Assert levels are sequentially numbered
      expect(await stargateNFTContract.getLevelIds()).to.deep.equal([...currentLevelIds, expectedLevelId]);

      // Assert new level data is correct
      const newLevel = await stargateNFTContract.getLevel(expectedLevelId);
      expect(newLevel.name).to.equal(newLevelAndSupply.level.name);
      expect(newLevel.isX).to.equal(newLevelAndSupply.level.isX);
      expect(newLevel.vetAmountRequiredToStake).to.equal(newLevelAndSupply.level.vetAmountRequiredToStake);
      expect(newLevel.scaledRewardFactor).to.equal(newLevelAndSupply.level.scaledRewardFactor);
      expect(newLevel.maturityBlocks).to.equal(newLevelAndSupply.level.maturityBlocks);

      // Assert cap and circulating supply are correct
      const newLevelSupply = await stargateNFTContract.getLevelSupply(expectedLevelId);
      expect(newLevelSupply.cap).to.equal(newLevelAndSupply.cap);
      expect(newLevelSupply.circulating).to.equal(newLevelAndSupply.circulatingSupply);
    });
  });

  describe("Update level", () => {
    it("should not be able to update level without level operator role", async () => {
      const levelId = 1;
      const level = await stargateNFTContract.getLevel(levelId);
      const vetRequired = level.vetAmountRequiredToStake;
      const newVetRequired = vetRequired + 1n;

      const unauthorisedUser = otherAccounts[0];

      expect(
        await stargateNFTContract.hasRole(
          await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
          unauthorisedUser.address
        )
      ).to.be.false;

      await expect(
        stargateNFTContract
          .connect(unauthorisedUser)
          .updateLevel(
            levelId,
            level.name,
            level.isX,
            level.maturityBlocks,
            level.scaledRewardFactor,
            newVetRequired, // change
          )
        ).to.be.reverted;

      const levelAfter = await stargateNFTContract.getLevel(levelId);
      expect(levelAfter.vetAmountRequiredToStake).to.equal(vetRequired);
    });

    it("should not be able to update a non-existing level", async () => {
      const levelOperator = otherAccounts[1];

      const grantTx = await stargateNFTContract.grantRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        levelOperator.address
      );
      await grantTx.wait();

      await expect(
        stargateNFTContract
          .connect(levelOperator)
          .updateLevel(
            100, // non-existing level
            "MadeUpLevelX",
            true,
            0,
            1,
            ethers.parseEther("100"),
          )
        ).to.be.reverted;
    });

    it("should not be able to update a level with invalid parameters", async () => {
      const levelOperator = otherAccounts[2];

      const grantTx = await stargateNFTContract.grantRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        levelOperator.address
      );
      await grantTx.wait();

      const levelId = 1;
      const level = await stargateNFTContract.getLevel(levelId);

      const testCases = [
        {
          test: "Level name cannot be empty",
          levelUpdated: {
            id: levelId,
            name: "",
            isX: level.isX,
            maturityBlocks: level.maturityBlocks,
            scaledRewardFactor: level.scaledRewardFactor,
            vetAmountRequiredToStake: level.vetAmountRequiredToStake,
          },
        },
        {
          test: "Level VET requirement cannot be zero",
          levelUpdated: {
            id: levelId,
            name: level.name,
            isX: level.isX,
            maturityBlocks: level.maturityBlocks,
            scaledRewardFactor: level.scaledRewardFactor,
            vetAmountRequiredToStake: 0n,
          },
        },
      ];

      for (const testCase of testCases) {
        await expect(
          stargateNFTContract
            .connect(levelOperator)
            .updateLevel(
              testCase.levelUpdated.id,
              testCase.levelUpdated.name,
              testCase.levelUpdated.isX,
              testCase.levelUpdated.maturityBlocks,
              testCase.levelUpdated.scaledRewardFactor,
              testCase.levelUpdated.vetAmountRequiredToStake,
            )
        ).to.be.reverted;


        const levelAfter = await stargateNFTContract.getLevel(levelId);
        expect(levelAfter.name).to.equal(level.name);
        expect(levelAfter.vetAmountRequiredToStake).to.equal(level.vetAmountRequiredToStake);

        console.log(`          ${testCase.test} ✅`);
      }
    });

    it("should be able to update level with no impact on existing stakes", async () => {
      const levelOperator = otherAccounts[3];

      const grantTx = await stargateNFTContract.grantRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        levelOperator.address
      );
      await grantTx.wait();

      const levelId = 3;
      const level = await stargateNFTContract.getLevel(levelId);
      const vetRequired = level.vetAmountRequiredToStake;
      const newVetRequired = vetRequired + 1n;

      // User stakes
      const stakeTx = await stargateNFTContract.connect(otherAccounts[4]).stake(levelId, { value: vetRequired });
      await stakeTx.wait();

      // Update level
      const updateLevelTx = await stargateNFTContract.connect(levelOperator).updateLevel(levelId, level.name, level.isX, level.maturityBlocks, level.scaledRewardFactor, newVetRequired);
      await updateLevelTx.wait();

      // Assert that user stake remains the same
      const userToken = await stargateNFTContract.getToken(await stargateNFTContract.getCurrentTokenId());
      expect(userToken.vetAmountStaked).to.equal(vetRequired);

      // Assert that level data is updated
      const levelAfter = await stargateNFTContract.getLevel(levelId);
      expect(levelAfter.vetAmountRequiredToStake).to.equal(newVetRequired);
    });
  });

  describe("Update level cap", () => {
    it("should not be able to update level cap without level operator role", async () => {
      const levelId = 1;
      const levelSupply = await stargateNFTContract.getLevelSupply(levelId);
      const cap = levelSupply.cap;
      const newCap = cap + 1n;

      const unauthorisedUser = otherAccounts[0];

      expect(
        await stargateNFTContract.hasRole(
          await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
          unauthorisedUser.address
        )
      ).to.be.false;

      await expect(stargateNFTContract.connect(unauthorisedUser).updateLevelCap(levelId, newCap)).to.be.reverted;

      const levelSupplyAfter = await stargateNFTContract.getLevelSupply(levelId);
      expect(levelSupplyAfter.cap).to.equal(cap);
    });

    it("should not be able to update a non-existing level", async () => {
      const levelOperator = otherAccounts[1];

      const grantTx = await stargateNFTContract.grantRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        levelOperator.address
      );
      await grantTx.wait();

      await expect(stargateNFTContract.connect(levelOperator).updateLevelCap(100, 777)).to.be.reverted;
    });

    it("should not be able to update cap with value less than circulating supply", async () => {
      const levelOperator = otherAccounts[2];

      const grantTx = await stargateNFTContract.grantRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        levelOperator.address
      );
      await grantTx.wait();

      const levelId = 9;
      const level = await stargateNFTContract.getLevel(levelId);
      const levelSupply = await stargateNFTContract.getLevelSupply(levelId);
      expect(levelSupply.circulating).to.equal(0);

      // Increase circulating supply by staking a couple NFTs of level 9
      const stakeTx1 = await stargateNFTContract.connect(otherAccounts[3]).stake(levelId, { value: level.vetAmountRequiredToStake});
      await stakeTx1.wait();

      // Assert new circulating
      const levelSupplyAfter = await stargateNFTContract.getLevelSupply(levelId);
      expect(levelSupplyAfter.circulating).to.equal(1);

      // Attempt to update cap below circulating should revert
      await expect(stargateNFTContract.connect(levelOperator).updateLevelCap(levelId, levelSupplyAfter.circulating - 1n)).to.be.reverted;
    });

    it("should be able to update level with no impact on existing stakes", async () => {
      const levelOperator = otherAccounts[3];

      const grantTx = await stargateNFTContract.grantRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        levelOperator.address
      );
      await grantTx.wait();

      const levelId = 9;
      const levelSupply = await stargateNFTContract.getLevelSupply(levelId);

      // Update cap
      const updateLevelCapTx = await stargateNFTContract.connect(levelOperator).updateLevelCap(levelId, levelSupply.cap + 1n);
      await updateLevelCapTx.wait();

      // Assert that cap is updated
      const levelSupplyAfter = await stargateNFTContract.getLevelSupply(levelId);
      expect(levelSupplyAfter.cap).to.equal(levelSupply.cap + 1n);
    });
  });
});
