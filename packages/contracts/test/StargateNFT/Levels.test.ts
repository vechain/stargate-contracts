import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { expect } from "chai";
import { StargateNFT } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
  createLegacyNodeHolder,
  getOrDeployContracts,
  getStargateNFTErrorsInterface,
} from "../helpers";

describe("StargateNFT: levels management", () => {
  const config = createLocalConfig();

  let deployer: HardhatEthersSigner, maliciousUser: HardhatEthersSigner;

  let stargateNFTContract: StargateNFT;

  before(async () => {
    deployer = (await ethers.getSigners())[0];

    maliciousUser = (await ethers.getSigners())[4];

    const { stargateNFTContract: deployedStargateNFTContract } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    stargateNFTContract = deployedStargateNFTContract;
  });

  it("User without level operator role cannot add levels", async () => {
    const currentLevels = await stargateNFTContract.getLevels();

    expect(
      await stargateNFTContract.hasRole(
        await stargateNFTContract.LEVEL_OPERATOR_ROLE(),
        maliciousUser.address
      )
    ).to.be.false;

    await expect(
      stargateNFTContract.connect(maliciousUser).addLevel({
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
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");

    expect((await stargateNFTContract.getLevels()).length).to.equal(currentLevels.length);
  });

  it("Users without level oprator role cannot update levels", async () => {
    const currentLevels = await stargateNFTContract.getLevels();
    const existingLevelId = currentLevels[0].id;

    await expect(
      stargateNFTContract
        .connect(maliciousUser)
        .updateLevel(
          existingLevelId,
          "My New Level",
          false,
          30,
          150,
          ethers.parseEther("10")
        )
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");

    const updatedLevel = await stargateNFTContract.getLevel(existingLevelId);
    expect(updatedLevel.name).to.equal(currentLevels[0].name);
    expect(updatedLevel.isX).to.equal(currentLevels[0].isX);
    expect(updatedLevel.vetAmountRequiredToStake).to.equal(
      currentLevels[0].vetAmountRequiredToStake
    );
    expect(updatedLevel.scaledRewardFactor).to.equal(currentLevels[0].scaledRewardFactor);
    expect(updatedLevel.maturityBlocks).to.equal(currentLevels[0].maturityBlocks);
  });

  it("Admins with level operator role can add new levels", async () => {
    const currentLevels = await stargateNFTContract.getLevels();

    await expect(
      stargateNFTContract.connect(deployer).addLevel({
        level: {
          id: 25, // This id does not matter since it will be replaced by the real one
          name: "My New Level",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("10"),
          scaledRewardFactor: 150,
          maturityBlocks: 30,
        },
        cap: 872,
        circulatingSupply: 0,
      })
    )
      .to.emit(stargateNFTContract, "LevelUpdated")
      .withArgs(
        currentLevels.length + 1,
        "My New Level",
        false,
        30,
        150,
        ethers.parseEther("10")
      );

    expect((await stargateNFTContract.getLevels()).length).to.equal(currentLevels.length + 1);

    const newLevel = await stargateNFTContract.getLevel(currentLevels.length + 1);
    expect(newLevel.id).to.equal(currentLevels.length + 1);
    expect(newLevel.name).to.equal("My New Level");
    expect(newLevel.isX).to.equal(false);
    expect(newLevel.vetAmountRequiredToStake).to.equal(ethers.parseEther("10"));
    expect(newLevel.scaledRewardFactor).to.equal(150);
  });

  it("All level ids should be sequential", async () => {
    const levels = await stargateNFTContract.getLevelIds();
    for (let i = 0; i < levels.length; i++) {
      expect(levels[i]).to.equal(i + 1);
    }
  });

  it("Users can stake for a level that is active", async () => {
    const currentLevels = await stargateNFTContract.getLevels();
    const myNewLevelId = currentLevels.length;

    const latestTokenId = await stargateNFTContract.getCurrentTokenId();
    const expectedTokenId = latestTokenId + 1n;

    await expect(
      stargateNFTContract.connect(deployer).stake(myNewLevelId, {
        value: ethers.parseEther("10"),
      })
    )
      .to.emit(stargateNFTContract, "TokenMinted")
      .withArgs(deployer.address, myNewLevelId, false, expectedTokenId, ethers.parseEther("10"));

    const token = await stargateNFTContract.getToken(expectedTokenId);
    expect(token.levelId).to.equal(myNewLevelId);
    expect(token.mintedAtBlock).to.equal(await stargateNFTContract.clock());
    expect(token.vetAmountStaked).to.equal(ethers.parseEther("10"));
    expect(token.lastVthoClaimTimestamp).to.equal(await stargateNFTContract.timestamp());
  });

  it("Admins with level operator role can update levels", async () => {
    const currentLevels = await stargateNFTContract.getLevels();
    const myNewLevelId = currentLevels.length;

    await stargateNFTContract
      .connect(deployer)
      .updateLevel(
        myNewLevelId,
        "My New Level Updated",
        false,
        30,
        150,
        ethers.parseEther("11")
      );

    const updatedLevel = await stargateNFTContract.getLevel(myNewLevelId);
    expect(updatedLevel.name).to.equal("My New Level Updated");
    expect(updatedLevel.isX).to.equal(false);
    expect(updatedLevel.vetAmountRequiredToStake).to.equal(ethers.parseEther("11"));
    expect(updatedLevel.scaledRewardFactor).to.equal(150);
  });

  it("Changing the vet required amount for a level does not affect existing stakes", async () => {
    // We changed the price in the last test, so we can check here if the existing stakes are not affected
    const latestTokenId = await stargateNFTContract.getCurrentTokenId();
    const token = await stargateNFTContract.getToken(latestTokenId);
    expect(token.vetAmountStaked).to.equal(ethers.parseEther("10"));

    const level = await stargateNFTContract.getLevel(token.levelId);
    expect(level.vetAmountRequiredToStake).to.equal(ethers.parseEther("11"));
  });

  it("Users without level operator role cannot update the cap of a level", async () => {
    const currentLevels = await stargateNFTContract.getLevels();
    const myNewLevelId = currentLevels.length;

    const cap = await stargateNFTContract.getCap(myNewLevelId);
    expect(cap).to.equal(872);

    await expect(
      stargateNFTContract.connect(maliciousUser).updateLevelCap(myNewLevelId, 1000)
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");

    const updatedCap = await stargateNFTContract.getCap(myNewLevelId);
    expect(updatedCap).to.equal(cap);
  });

  it("Admins with level operator role can update the cap of a level", async () => {
    const currentLevels = await stargateNFTContract.getLevels();
    const myNewLevelId = currentLevels.length;

    const cap = await stargateNFTContract.getCap(myNewLevelId);
    expect(cap).to.equal(872);

    await stargateNFTContract.connect(deployer).updateLevelCap(myNewLevelId, 1000);

    const updatedCap = await stargateNFTContract.getCap(myNewLevelId);
    expect(updatedCap).to.equal(1000);
  });

  it("Cannot add a new level with a circulating supply higher than the cap", async () => {
    const currentLevels = await stargateNFTContract.getLevels();
    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    await expect(
      stargateNFTContract.connect(deployer).addLevel({
        level: {
          id: currentLevels.length + 1,
          name: "My New Level",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("10"),
          scaledRewardFactor: 150,
          maturityBlocks: 30,
        },
        cap: 1000,
        circulatingSupply: 1001,
      })
    ).to.be.revertedWithCustomError(errorsInterface, "CirculatingSupplyGreaterThanCap");
  });

  it("Cannot set the cap lower than the circulating supply", async () => {
    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    const currentLevels = await stargateNFTContract.getLevels();
    const myNewLevelId = currentLevels.length;

    const level = await stargateNFTContract.getLevel(myNewLevelId);

    await stargateNFTContract.connect(deployer).stake(level.id, {
      value: level.vetAmountRequiredToStake,
    });
    await stargateNFTContract.connect(deployer).stake(level.id, {
      value: level.vetAmountRequiredToStake,
    });

    const supply = await stargateNFTContract.getLevelSupply(myNewLevelId);
    expect(supply.circulating).to.be.greaterThan(1);

    await expect(
      stargateNFTContract.connect(deployer).updateLevelCap(myNewLevelId, 1)
    ).to.be.revertedWithCustomError(errorsInterface, "CirculatingSupplyGreaterThanCap");
  });

  it("Cannot add or update a level with an empty name", async () => {
    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    await expect(
      stargateNFTContract.connect(deployer).addLevel({
        level: {
          id: 100,
          name: "",
          isX: false,
          vetAmountRequiredToStake: ethers.parseEther("10"),
          scaledRewardFactor: 150,
          maturityBlocks: 30,
        },
        cap: 1000,
        circulatingSupply: 0,
      })
    ).to.be.revertedWithCustomError(errorsInterface, "StringCannotBeEmpty");

    await expect(
      stargateNFTContract
        .connect(deployer)
        .updateLevel(1, "", false, 30, 150, ethers.parseEther("10"))
    ).to.be.revertedWithCustomError(errorsInterface, "StringCannotBeEmpty");
  });

  it("Cannot add or update a level with 0 VET amount required to stake", async () => {
    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    await expect(
      stargateNFTContract.connect(deployer).addLevel({
        level: {
          id: 100,
          name: "My New Level",
          isX: false,
          vetAmountRequiredToStake: 0,
          scaledRewardFactor: 150,
          maturityBlocks: 30,
        },
        cap: 1000,
        circulatingSupply: 0,
      })
    ).to.be.revertedWithCustomError(errorsInterface, "ValueCannotBeZero");

    await expect(
      stargateNFTContract.connect(deployer).updateLevel(1, "My New Level", false, 30, 150, 0)
    ).to.be.revertedWithCustomError(errorsInterface, "ValueCannotBeZero");
  });

  it("Cannot update a non-existent level", async () => {
    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    await expect(
      stargateNFTContract
        .connect(deployer)
        .updateLevel(100, "My New Level", false, 30, 150, ethers.parseEther("10"))
    ).to.be.revertedWithCustomError(errorsInterface, "LevelNotFound");
  });

  it("Cannot update the cap of a non-existent level", async () => {
    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    await expect(
      stargateNFTContract.connect(deployer).updateLevelCap(100, 1000)
    ).to.be.revertedWithCustomError(errorsInterface, "LevelNotFound");
  });
});

describe("StargateNFT: supply getters", async () => {
  it("Can correctly fetch the circulating supply for a level", async () => {
    const { stargateNFTContract, deployer } = await getOrDeployContracts({
      forceDeploy: true,
    });
    const currentLevels = await stargateNFTContract.getLevels();
    const myNewLevelId = currentLevels.length + 1;

    const newLevel = {
      id: myNewLevelId,
      name: "My New Level",
      isX: false,
      vetAmountRequiredToStake: ethers.parseEther("10"),
      scaledRewardFactor: 150,
      maturityBlocks: 30,
    };

    await stargateNFTContract.connect(deployer).addLevel({
      level: newLevel,
      cap: 1000,
      circulatingSupply: 0,
    });

    let supply = await stargateNFTContract.getLevelSupply(myNewLevelId);
    expect(supply.circulating).to.equal(0);
    expect(supply.cap).to.equal(1000);

    await stargateNFTContract.connect(deployer).stake(myNewLevelId, {
      value: ethers.parseEther("10"),
    });

    supply = await stargateNFTContract.getLevelSupply(myNewLevelId);
    expect(supply.circulating).to.equal(1);
    expect(supply.cap).to.equal(1000);

    await stargateNFTContract.connect(deployer).updateLevelCap(myNewLevelId, 1001);

    supply = await stargateNFTContract.getLevelSupply(myNewLevelId);
    expect(supply.circulating).to.equal(1);
    expect(supply.cap).to.equal(1001);
  });

  it("Cannot get the supply for a non-existent level", async () => {
    const { stargateNFTContract } = await getOrDeployContracts({
      forceDeploy: false,
    });
    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    await expect(stargateNFTContract.getLevelSupply(100)).to.be.revertedWithCustomError(
      errorsInterface,
      "LevelNotFound"
    );
  });

  it("Can correctly fetch the circulating supply for all levels", async () => {
    const config = createLocalConfig();
    config.TOKEN_LEVELS = config.TOKEN_LEVELS.map((level) => ({
      ...level,
      level: {
        ...level.level,
        vetAmountRequiredToStake: ethers.parseEther("10"),
      },
    }));

    const { stargateNFTContract: cleanStargateNFTContract, deployer } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    const currentLevels = await cleanStargateNFTContract.getLevels();

    const circulatingSupplies = await cleanStargateNFTContract.getLevelsCirculatingSupplies();

    // by default they all should be 0
    for (const level of currentLevels) {
      expect(circulatingSupplies[Number(level.id) - 1]).to.equal(0);
    }

    // let's mint a token for each level
    for (const level of currentLevels) {
      // ensure the level has the correct vet amount required to stake
      expect(level.vetAmountRequiredToStake).to.equal(
        config.TOKEN_LEVELS[Number(level.id) - 1].level.vetAmountRequiredToStake
      );

      if (level.isX) {
        // Migrate
        const legacyNodeId = await createLegacyNodeHolder(Number(level.id), deployer);

        // Mint an NFT to the deployer
        await cleanStargateNFTContract.migrate(legacyNodeId, {
          value: config.TOKEN_LEVELS[Number(level.id) - 1].level.vetAmountRequiredToStake,
        });
      } else {
        // Stake
        await cleanStargateNFTContract.connect(deployer).stake(level.id, {
          value: config.TOKEN_LEVELS[Number(level.id) - 1].level.vetAmountRequiredToStake,
        });
      }
    }

    const newCirculatingSupplies = await cleanStargateNFTContract.getLevelsCirculatingSupplies();

    // now we should have the correct circulating supplies
    for (const level of currentLevels) {
      expect(newCirculatingSupplies[Number(level.id) - 1]).to.equal(1);
    }

    // If an nft is burned, the circulating supply should be decremented
    const latestTokenId = await cleanStargateNFTContract.getCurrentTokenId();
    const token = await cleanStargateNFTContract.getToken(latestTokenId);
    await cleanStargateNFTContract.connect(deployer).unstake(latestTokenId);

    const circulatingSupplyAfterBurn =
      await cleanStargateNFTContract.getLevelsCirculatingSupplies();
    expect(circulatingSupplyAfterBurn[Number(token.levelId) - 1]).to.equal(0);
  });

  it("Can correctly track the circulating supply at all blocks", async () => {
    const { stargateNFTContract, deployer } = await getOrDeployContracts({
      forceDeploy: true,
    });
    const currentLevels = await stargateNFTContract.getLevels();
    const myNewLevelId = currentLevels.length + 1;

    const newLevel = {
      id: myNewLevelId,
      name: "My New Level",
      isX: false,
      vetAmountRequiredToStake: ethers.parseEther("10"),
      scaledRewardFactor: 150,
      maturityBlocks: 30,
    };

    await stargateNFTContract.connect(deployer).addLevel({
      level: newLevel,
      cap: 1000,
      circulatingSupply: 0,
    });

    const initialBlock = await stargateNFTContract.clock();
    const circulatingSuppliesAtBlock = await stargateNFTContract.getCirculatingSupplyAtBlock(
      myNewLevelId,
      initialBlock
    );
    expect(circulatingSuppliesAtBlock).to.equal(0);
    const allLevelsCirculatingSupplyAtBlock =
      await stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(initialBlock);
    for (const level of currentLevels) {
      expect(allLevelsCirculatingSupplyAtBlock[Number(level.id) - 1]).to.equal(0);
    }

    await stargateNFTContract.connect(deployer).stake(myNewLevelId, {
      value: ethers.parseEther("10"),
    });
    const blockAfterFirstMint = await stargateNFTContract.clock();

    const circulatingSuppliesAtBlock2 = await stargateNFTContract.getCirculatingSupplyAtBlock(
      myNewLevelId,
      blockAfterFirstMint
    );
    expect(circulatingSuppliesAtBlock2).to.equal(1);
    const allLevelsCirculatingSupplyAtBlock2 =
      await stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(blockAfterFirstMint);
    for (const level of currentLevels) {
      if (Number(level.id) === myNewLevelId) {
        expect(allLevelsCirculatingSupplyAtBlock2[Number(level.id) - 1]).to.equal(1);
      } else {
        expect(allLevelsCirculatingSupplyAtBlock2[Number(level.id) - 1]).to.equal(0);
      }
    }

    // check that the previous value is still 0
    expect(
      await stargateNFTContract.getCirculatingSupplyAtBlock(myNewLevelId, initialBlock)
    ).to.equal(0);
  });

  it("Cannot get the supply in a block in the future", async () => {
    const { stargateNFTContract } = await getOrDeployContracts({
      forceDeploy: false,
    });

    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    const currentBlock = await stargateNFTContract.clock();
    await expect(
      stargateNFTContract.getCirculatingSupplyAtBlock(1, currentBlock + 20n)
    ).to.be.revertedWithCustomError(errorsInterface, "BlockInFuture");

    await expect(
      stargateNFTContract.getLevelsCirculatingSuppliesAtBlock(currentBlock + 20n)
    ).to.be.revertedWithCustomError(errorsInterface, "BlockInFuture");
  });

  it("Cannot get the supply in a for a non-existent level", async () => {
    const { stargateNFTContract } = await getOrDeployContracts({
      forceDeploy: false,
    });

    await expect(
      stargateNFTContract.getCirculatingSupplyAtBlock(100, await stargateNFTContract.clock())
    ).to.be.reverted;
  });

  it("Cannot fetch a non-existent level", async () => {
    const { stargateNFTContract } = await getOrDeployContracts({
      forceDeploy: false,
    });

    const errorsInterface = await getStargateNFTErrorsInterface(stargateNFTContract);

    await expect(stargateNFTContract.getLevel(100)).to.be.revertedWithCustomError(
      errorsInterface,
      "LevelNotFound"
    );
  });
});
