import { expect } from "chai";
import { ethers } from "hardhat";
import { getOrDeployContracts } from "../helpers/deploy";
import { StargateNFT } from "../../typechain-types";
import { TokenLevelId, Level } from "@repo/config/contracts/StargateNFT";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ContractsConfig } from "@repo/config/contracts/type";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";

describe("shard6: StargateNFT Compatibility", () => {
  describe("TokenAuction", () => {
    const levelId = TokenLevelId.Strength;

    let config: ContractsConfig;
    let stargateNFT: StargateNFT;
    let stargateNFTAddress: string;

    let user1: HardhatEthersSigner;
    let token1Id: number;
    let token1LevelSpec: Level;

    let tx: TransactionResponse;

    beforeEach(async () => {
      config = createLocalConfig();
      const { stargateNFTContract, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateNFT = stargateNFTContract;
      stargateNFTAddress = await stargateNFTContract.getAddress();

      user1 = otherAccounts[0];
      token1Id = config.LEGACY_LAST_TOKEN_ID + 1;

      // Fetch token level spec
      token1LevelSpec = (await stargateNFT.getLevel(levelId)) as unknown as Level;

      // Stake and mint
      tx = await stargateNFT.connect(user1).stake(levelId, {
        value: token1LevelSpec.vetAmountRequiredToStake,
      });
      await tx.wait();
    });

    it("should start testing with expected state", async () => {
      expect(await ethers.provider.getBalance(stargateNFTAddress)).to.equal(
        token1LevelSpec.vetAmountRequiredToStake
      );
    });

    it("should be able to get token collection name", async () => {
      expect(await stargateNFT.name()).to.equal("StarGate Delegator Token");
    });

    it("should be able to get token collection symbol", async () => {
      expect(await stargateNFT.symbol()).to.equal("SDT");
    });

    it("should be able to check target address owns normal token", async () => {
      expect(await stargateNFT.ownsNormalToken(user1)).to.be.true;
    });

    it("should be able to check target address owns X token", async () => {
      expect(await stargateNFT.ownsXToken(user1)).to.be.false;
    });

    it("should be able to get totalSupply", async () => {
      expect(await stargateNFT.totalSupply()).to.equal(1);
    });

    it("should be able to check canTransfer", async () => {
      expect(await stargateNFT.canTransfer(token1Id)).to.be.true;
    });

    it("should be able to check ownerOf", async () => {
      expect(await stargateNFT.ownerOf(token1Id)).to.equal(user1);
    });

    it("should be able to check balanceOf", async () => {
      expect(await stargateNFT.balanceOf(user1)).to.equal(1);
    });

    it("should be able to check idToOwner", async () => {
      expect(await stargateNFT.ownerOf(token1Id)).to.equal(user1);
    });

    // Cannot maintain compatibility with this function, since it returns an array of token IDs
    it("should be able to check idsOwnedBy", async () => {
      expect(await stargateNFT.idsOwnedBy(user1)).to.deep.equal([token1Id]);
    });

    it("should be able to get xTokenCount", async () => {
      expect(await stargateNFT.xTokensCount()).to.equal(0);
    });

    it("should be able to get normalTokenCount", async () => {
      expect(await stargateNFT.normalTokensCount()).to.equal(1);
    });
  });
});
