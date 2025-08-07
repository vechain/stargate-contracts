import { expect } from "chai";
import { Signer } from "ethers";
import { getOrDeployContracts } from "../helpers/deploy";
import { StargateNFT } from "../../typechain-types";
import { ethers } from "hardhat";
import { TransactionResponse } from "ethers";

describe("shard2: StargateNFT Pausability", () => {
  describe("Contract basic pausability features", () => {
    let stargateNFTContractV1: StargateNFT;
    let pauser: Signer;
    let user1: Signer;
    let tx: TransactionResponse;

    beforeEach(async () => {
      const { stargateNFTContract, deployer, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });
      stargateNFTContractV1 = stargateNFTContract;
      pauser = deployer;
      user1 = otherAccounts[0];
    });

    it("should be initialized as not paused", async () => {
      expect(await stargateNFTContractV1.paused()).to.be.false;
    });

    it("should revert when non-pauser tries to pause the contract", async () => {
      await expect(stargateNFTContractV1.connect(user1).pause()).to.be.reverted;
    });

    it("should be able to pause the contract", async () => {
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      expect(await stargateNFTContractV1.paused()).to.be.true;
    });

    it("should revert when non-pauser tries to unpause the contract", async () => {
      // Pause the contract
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      // Tx should revert because user1 is not the pauser
      await expect(stargateNFTContractV1.connect(user1).unpause()).to.be.reverted;
    });

    it("users should not be able to stake while the contract is paused", async () => {
      // Pause the contract
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      // Tx should revert because the contract is paused
      await expect(stargateNFTContractV1.connect(user1).stake(1, { value: ethers.parseEther("1") }))
        .to.be.reverted;
    });

    it("users should not be able to stakeAndDelegate while the contract is paused", async () => {
      // Pause the contract
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      // Tx should revert because the contract is paused
      await expect(
        stargateNFTContractV1.connect(user1).stakeAndDelegate(1, true, {
          value: ethers.parseEther("1"),
        })
      ).to.be.reverted;
    });

    it("Users should not be able to migrate while the contract is paused", async () => {
      // Pause the contract
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      // Tx should revert because the contract is paused
      await expect(
        stargateNFTContractV1.connect(user1).migrate(1, {
          value: ethers.parseEther("1"),
        })
      ).to.be.reverted;
    });

    it("Users should not be able to migrateAndDelegate while the contract is paused", async () => {
      // Pause the contract
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      // Tx should revert because the contract is paused
      await expect(
        stargateNFTContractV1.connect(user1).migrateAndDelegate(1, true, {
          value: ethers.parseEther("1"),
        })
      ).to.be.reverted;
    });

    it("Users should not be able to unstake while the contract is paused", async () => {
      // Pause the contract
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      // Tx should revert because the contract is paused
      await expect(stargateNFTContractV1.connect(user1).unstake(1)).to.be.reverted;
    });

    it("Users should not be able to claim vet generated vtho while the contract is paused", async () => {
      // Pause the contract
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      // Tx should revert because the contract is paused
      await expect(stargateNFTContractV1.connect(user1).claimVetGeneratedVtho(1)).to.be.reverted;
    });

    it("should be able to unpause the contract", async () => {
      // Pause the contract
      tx = await stargateNFTContractV1.connect(pauser).pause();
      await tx.wait();
      // Unpause the contract
      tx = await stargateNFTContractV1.connect(pauser).unpause();
      await tx.wait();
      // Tx should revert because the contract is paused
      expect(await stargateNFTContractV1.paused()).to.be.false;
    });
  });
});
