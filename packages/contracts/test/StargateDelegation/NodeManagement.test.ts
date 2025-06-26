import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getStargateNFTErrorsInterface, mineBlocks } from "../helpers/common";
import { ethers } from "hardhat";
import { StargateDelegation, StargateNFT, NodeManagementV3 } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ContractsConfig } from "@repo/config/contracts/type";

describe("StargateDelegation NodeManagement Integration", () => {
  describe("Scenario: Stake, delegate node management, then unstake", () => {
    let config: ContractsConfig;
    let stargateDelegation: StargateDelegation;
    let stargateNFT: StargateNFT;
    let nodeManagement: NodeManagementV3;
    let deployer: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let nodeManager: HardhatEthersSigner;
    let tokenId: number;

    const levelId = 1;
    const stakeAmount = ethers.parseEther("1");

    before(async () => {
      config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = stakeAmount;

      const contracts = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateDelegation = contracts.stargateDelegationContract;
      stargateNFT = contracts.stargateNFTContract;
      nodeManagement = contracts.nodeManagementContract;
      deployer = contracts.deployer;
      otherAccounts = contracts.otherAccounts;
      nodeManager = otherAccounts[0];
      tokenId = Number(await stargateNFT.getCurrentTokenId()) + 1;
    });

    it("should allow user to stake an NFT", async () => {
      // Stake an NFT
      await stargateNFT.stake(levelId, { value: stakeAmount });

      // Verify NFT was minted and owned by deployer
      expect(await stargateNFT.balanceOf(deployer)).to.equal(1);
      expect(await stargateNFT.ownerOf(tokenId)).to.equal(deployer.address);
      expect(await stargateNFT.tokenExists(tokenId)).to.be.true;

      // Verify NFT is transferable initially
      expect(await stargateNFT.canTransfer(tokenId)).to.be.true;

      // Verify NFT is not delegated yet
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
    });

    it("should allow user to add another address as node manager", async () => {
      // Verify the deployer is the direct owner before delegation
      expect(await nodeManagement.isDirectNodeOwner(deployer.address, tokenId)).to.be.true;
      expect(await nodeManagement.getNodeOwner(tokenId)).to.equal(deployer.address);

      // Delegate node management to another address
      await expect(nodeManagement.connect(deployer).delegateNode(nodeManager.address, tokenId))
        .to.emit(nodeManagement, "NodeDelegated")
        .withArgs(tokenId, nodeManager.address, true);

      // Verify node management delegation
      expect(await nodeManagement.getNodeManager(tokenId)).to.equal(nodeManager.address);
      expect(await nodeManagement.isNodeManager(nodeManager.address, tokenId)).to.be.true;
      expect(await nodeManagement.isNodeDelegated(tokenId)).to.be.true;
      expect(await nodeManagement.isNodeDelegator(deployer.address)).to.be.true;

      // Verify original owner still owns the NFT
      expect(await stargateNFT.ownerOf(tokenId)).to.equal(deployer.address);
      expect(await nodeManagement.getNodeOwner(tokenId)).to.equal(deployer.address);

      // Verify the node manager can see the delegated node
      const delegatedNodes = await nodeManagement.getNodeIds(nodeManager.address);
      expect(delegatedNodes).to.include(BigInt(tokenId));
    });

    it("should prevent node manager to start delegation", async () => {
      await expect(
        stargateDelegation.connect(nodeManager).delegate(tokenId, true)
      ).to.revertedWithCustomError(stargateDelegation, "UnauthorizedUser");

      // Verify delegation is not active
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
      expect(await stargateNFT.canTransfer(tokenId)).to.be.true;
    });

    it("should prevent node manager from transferring", async () => {
      await expect(
        stargateNFT
          .connect(nodeManager)
          .transferFrom(deployer.address, otherAccounts[1].address, tokenId)
      ).to.be.revertedWithCustomError(stargateNFT, "ERC721InsufficientApproval");
    });

    it("should allow owner should be able to delegate", async () => {
      await stargateDelegation.connect(deployer).delegate(tokenId, true);
      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.true;
      expect(await stargateNFT.canTransfer(tokenId)).to.be.false;
    });

    it("should prevent node manager from exiting delegation", async () => {
      await expect(
        stargateDelegation.connect(nodeManager).requestDelegationExit(tokenId)
      ).to.be.revertedWithCustomError(stargateDelegation, "UnauthorizedUser");
    });

    it("should allow node manager to claim rewards", async () => {
      // Claim delegation rewards
      const claimBlock = await stargateDelegation.currentDelegationPeriodEndBlock(tokenId);
      const currentBlock = await stargateDelegation.clock();

      await mineBlocks(Number(claimBlock - currentBlock));

      expect(await stargateDelegation.claimableRewards(tokenId)).to.be.greaterThan(0);

      await expect(stargateDelegation.connect(nodeManager).claimRewards(tokenId)).to.emit(
        stargateDelegation,
        "DelegationRewardsClaimed"
      );

      // Claim vet generated vtho rewards
      const vetGeneratedVthoRewards = await stargateNFT.claimableVetGeneratedVtho(tokenId);
      expect(vetGeneratedVthoRewards).to.be.greaterThan(0);

      await expect(stargateNFT.connect(nodeManager).claimVetGeneratedVtho(tokenId)).to.emit(
        stargateNFT,
        "BaseVTHORewardsClaimed"
      );
    });

    it("should allow owner to exit delegation", async () => {
      await expect(stargateDelegation.connect(deployer).requestDelegationExit(tokenId)).to.emit(
        stargateDelegation,
        "DelegationExitRequested"
      );

      const exitBlock = await stargateDelegation.currentDelegationPeriodEndBlock(tokenId);
      const currentBlock = await stargateDelegation.clock();

      await mineBlocks(Number(exitBlock - currentBlock + 1n));

      expect(await stargateDelegation.isDelegationActive(tokenId)).to.be.false;
      expect(await stargateNFT.canTransfer(tokenId)).to.be.true;
    });

    it("should prevent node manager to unstake the NFT", async () => {
      await expect(stargateNFT.connect(nodeManager).unstake(tokenId)).to.revertedWithCustomError(
        await getStargateNFTErrorsInterface(),
        "NotOwner"
      );
    });

    it("should allow owner to unstake", async () => {
      let managerNodes = await nodeManagement.getUserNodes(nodeManager.address);
      let ownerNodes = await nodeManagement.getUserNodes(deployer.address);
      let nodesOfDelegatee = await nodeManagement.getNodesDelegatedTo(nodeManager.address);
      let stargateNftsNodeManager = await nodeManagement.getUserStargateNFTsInfo(
        nodeManager.address
      );
      let stargateNftsOwner = await nodeManagement.getUserStargateNFTsInfo(deployer.address);

      expect(managerNodes.length).to.equal(1);
      expect(managerNodes[0].nodeId).to.equal(tokenId);
      expect(ownerNodes.length).to.equal(1);
      expect(ownerNodes[0].nodeId).to.equal(tokenId);
      expect(nodesOfDelegatee.length).to.equal(1);
      expect(nodesOfDelegatee[0]).to.equal(tokenId);
      expect(stargateNftsNodeManager[0].tokenId).to.equal(tokenId);
      // differently from ownerNodes we do not consider delegated nfts in the response
      expect(stargateNftsOwner.length).to.equal(0);

      // Unstakes happens and nft is burned
      await stargateNFT.connect(deployer).unstake(tokenId);
      expect(await stargateNFT.tokenExists(tokenId)).to.be.false;

      managerNodes = await nodeManagement.getUserNodes(nodeManager.address);
      ownerNodes = await nodeManagement.getUserNodes(deployer.address);
      nodesOfDelegatee = await nodeManagement.getNodesDelegatedTo(nodeManager.address);
      stargateNftsNodeManager = await nodeManagement.getUserStargateNFTsInfo(nodeManager.address);
      stargateNftsOwner = await nodeManagement.getUserStargateNFTsInfo(deployer.address);

      expect(managerNodes.length).to.equal(0);
      expect(ownerNodes.length).to.equal(0);
      expect(nodesOfDelegatee.length).to.equal(0);
      expect(stargateNftsNodeManager.length).to.equal(0);
      expect(stargateNftsOwner.length).to.equal(0);
    });
  });
});
