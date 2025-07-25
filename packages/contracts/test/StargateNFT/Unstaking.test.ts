import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getStargateNFTErrorsInterface, mineBlocks } from "../helpers/common";
import { ethers } from "hardhat";
import { TokenLevelId, LevelRaw } from "@repo/config/contracts/StargateNFT";
import { StargateNFT, Errors, StargateDelegation, MyERC20 } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ContractsConfig } from "@repo/config/contracts/type";
import { createLegacyNodeHolder } from "../helpers";

describe("StargateNFT unstaking", () => {
  describe("Scenario: Unstaking a Node", () => {
    let config: ContractsConfig;
    let stargateNFT: StargateNFT;
    let stargateDelegation: StargateDelegation;
    let errorsInterface: Errors;

    let user1: HardhatEthersSigner;

    const levelId = TokenLevelId.Flash;
    let levelSpec: LevelRaw;
    let expectedTokenId: number;

    before(async () => {
      config = createLocalConfig();

      // change the maturity period to 5 blocks
      config.TOKEN_LEVELS = config.TOKEN_LEVELS.map((level) => {
        level.level.maturityBlocks = 5;
        return level;
      });

      const { stargateNFTContract, stargateDelegationContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
          config,
        });

      stargateNFT = stargateNFTContract;
      stargateDelegation = stargateDelegationContract;
      errorsInterface = await getStargateNFTErrorsInterface(stargateNFT);

      user1 = otherAccounts[0];
      expectedTokenId = config.LEGACY_LAST_TOKEN_ID + 1;
      levelSpec = await stargateNFT.getLevel(levelId);

      await stargateNFT.connect(user1).stake(levelId, { value: levelSpec[5] });
    });

    it("should start testing with expected state", async () => {
      // Assert that user has the expected NFT
      expect(await stargateNFT.balanceOf(user1)).to.equal(1);
      expect(await stargateNFT.idsOwnedBy(user1.address)).to.deep.equal([expectedTokenId]);

      // Assert that NFT is of the expected level
      const token = await stargateNFT.getToken(expectedTokenId);
      expect(token.levelId).to.equal(levelId);
      expect(token.mintedAtBlock).to.not.equal(0);
      expect(token.vetAmountStaked).to.equal(levelSpec[5]);
    });

    it("should be able to unstake", async () => {
      const stargateNFTAddress = await stargateNFT.getAddress();
      const user1Address = await user1.getAddress();

      const stargateNFTBalance = await ethers.provider.getBalance(stargateNFTAddress);

      // Unstake
      const tx = await stargateNFT.connect(user1).unstake(expectedTokenId);

      // Assert that NFT was burned
      expect(await stargateNFT.balanceOf(user1)).to.equal(0);

      // Assert tx from and to addresses
      expect(tx.from).to.equal(user1Address);
      expect(tx.to).to.equal(stargateNFTAddress);

      // Assert that stargateNFT balance decreased by the unstaked amount
      expect(await ethers.provider.getBalance(stargateNFTAddress)).to.equal(
        stargateNFTBalance - levelSpec[5]
      );
    });

    it("burn callback is not callable externally", async () => {
      const deployer = (await ethers.getSigners())[0];

      await expect(stargateNFT.connect(deployer)._burnCallback(100000))
        .to.be.revertedWithCustomError(errorsInterface, "UnauthorizedCaller")
        .withArgs(deployer.address);

      await expect(stargateNFT.connect(user1)._burnCallback(100000))
        .to.be.revertedWithCustomError(errorsInterface, "UnauthorizedCaller")
        .withArgs(user1.address);
    });

    it("should not be able to unstake when delegating", async () => {
      const latestTokenId = await stargateNFT.getCurrentTokenId();

      const levels = await stargateNFT.getLevels();
      const level = levels[0];

      await stargateNFT
        .connect(user1)
        .stakeAndDelegate(level.id, false, { value: level.vetAmountRequiredToStake });

      await expect(
        stargateNFT.connect(user1).unstake(latestTokenId + 1n)
      ).to.be.revertedWithCustomError(errorsInterface, "TokenNotEligible");
    });

    it("Cannot unstake on behalf of another user", async () => {
      const latestTokenId = await stargateNFT.getCurrentTokenId();

      const delegetaionExitBlock = await stargateDelegation.getDelegationEndBlock(latestTokenId);

      const currentBlock = await stargateDelegation.clock();
      const blocksToWait = delegetaionExitBlock - currentBlock;
      await mineBlocks(Number(blocksToWait));

      const otherUser = (await ethers.getSigners())[8];

      await expect(
        stargateNFT.connect(otherUser).unstake(latestTokenId)
      ).to.be.revertedWithCustomError(errorsInterface, "NotOwner");
    });
  });

  describe("Scenario: Unstaking a legacy X Node", () => {
    let config: ContractsConfig;
    let stargateNFT: StargateNFT;
    let stargateDelegation: StargateDelegation;
    let errorsInterface: Errors;
    let mockedVthoToken: MyERC20;

    let user1: HardhatEthersSigner;
    const levelId = TokenLevelId.ThunderX;
    let expectedTokenId: number;

    before(async () => {
      config = createLocalConfig();

      const {
        stargateNFTContract,
        stargateDelegationContract,
        otherAccounts,
        mockedVthoToken: mockedVthoTokenContract,
      } = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateNFT = stargateNFTContract;
      stargateDelegation = stargateDelegationContract;
      mockedVthoToken = mockedVthoTokenContract;
      errorsInterface = await getStargateNFTErrorsInterface(stargateNFT);

      user1 = otherAccounts[0];

      const legacyNodeId = await createLegacyNodeHolder(levelId, user1);

      expectedTokenId = Number(legacyNodeId);

      // Mint an NFT to the deployer
      await stargateNFT.connect(user1).migrate(legacyNodeId, {
        value: config.TOKEN_LEVELS[levelId - 1].level.vetAmountRequiredToStake,
      });
    });

    it("should start testing with expected state", async () => {
      // Assert that user has the expected NFT
      expect(await stargateNFT.balanceOf(user1)).to.equal(1);
      expect(await stargateNFT.idsOwnedBy(user1.address)).to.deep.equal([expectedTokenId]);

      // Assert that NFT is of the expected level
      const token = await stargateNFT.getToken(expectedTokenId);
      expect(token.levelId).to.equal(levelId);
      expect(token.mintedAtBlock).to.not.equal(0);
      expect(token.vetAmountStaked).to.equal(
        config.TOKEN_LEVELS[levelId - 1].level.vetAmountRequiredToStake
      );

      expect(await stargateNFT.isXToken(expectedTokenId)).to.be.true;
      expect(await stargateNFT.isNormalToken(expectedTokenId)).to.be.false;
      expect(await stargateNFT.tokenExists(expectedTokenId)).to.be.true;
    });

    it("should be able to unstake, receive the amount back and decrease the cap of the level", async () => {
      const capBeforeUnstake = await stargateNFT.getCap(levelId);

      await expect(stargateNFT.connect(user1).unstake(expectedTokenId)).to.changeEtherBalances(
        [user1, stargateNFT.target],
        [
          config.TOKEN_LEVELS[levelId - 1].level.vetAmountRequiredToStake,
          -config.TOKEN_LEVELS[levelId - 1].level.vetAmountRequiredToStake,
        ]
      );

      const capAfterUnstake = await stargateNFT.getCap(levelId);
      expect(capAfterUnstake).to.equal(capBeforeUnstake - 1n);

      expect(await stargateNFT.balanceOf(user1)).to.equal(0);
      expect(await stargateNFT.idsOwnedBy(user1.address)).to.deep.equal([]);

      await expect(stargateNFT.isXToken(expectedTokenId)).to.be.revertedWithCustomError(
        stargateNFT,
        "ERC721NonexistentToken"
      );
      await expect(stargateNFT.isNormalToken(expectedTokenId)).to.be.revertedWithCustomError(
        stargateNFT,
        "ERC721NonexistentToken"
      );
      expect(await stargateNFT.tokenExists(expectedTokenId)).to.be.false;
    });
  });
});
