import { ethers } from "hardhat";
import { expect } from "chai";
import {
  createLegacyNodeHolder,
  getLevelWithLowestVetRequirement,
  getOrDeployContracts,
  mineBlocks,
} from "../helpers";
import { describe, it } from "mocha";
import { deployUpgradeableWithoutInitialization, initializeProxy } from "../../scripts/helpers";
import { ZeroAddress, TransactionResponse, getAddress } from "ethers";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { compareAddresses } from "@repo/utils/AddressUtils";
import { MyERC721, NodeManagementV3, StargateNFT } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("shard1001: NodeManagementV3", function () {
  let tx: TransactionResponse;
  let deployer: HardhatEthersSigner;
  let otherAccounts: HardhatEthersSigner[];
  let nodeManagementContract: NodeManagementV3;
  let stargateNFTContract: StargateNFT;
  let mockedErc721Contract: MyERC721;

  beforeEach(async function () {
    const contracts = await getOrDeployContracts({
      forceDeploy: true,
    });
    deployer = contracts.deployer;
    otherAccounts = contracts.otherAccounts;

    nodeManagementContract = contracts.nodeManagementContract;
    stargateNFTContract = contracts.stargateNFTContract;
    mockedErc721Contract = contracts.mockedErc721Contract;
  });

  describe("Contract initialization", () => {
    it("If deploying directly V3 can initialize V1, V2 and V3 (but only once)", async function () {
      const deployer = (await ethers.getSigners())[0];
      const nodeManagementProxyAddress = await deployUpgradeableWithoutInitialization(
        "NodeManagementV3",
        {},
        false,
      );

      const nodeManagement = (await initializeProxy(
        nodeManagementProxyAddress,
        "NodeManagementV3",

        [deployer.address, deployer.address, deployer.address],
        {},
      )) as NodeManagementV3;

      expect(await nodeManagement.getVechainNodesContract()).to.equal(deployer.address);
      expect(
        await nodeManagement.hasRole(await nodeManagement.DEFAULT_ADMIN_ROLE(), deployer.address),
      ).to.be.true;
      expect(await nodeManagement.hasRole(await nodeManagement.UPGRADER_ROLE(), deployer.address))
        .to.be.true;

      await expect(nodeManagement.initializeV2())
        .to.emit(nodeManagement, "Initialized")
        .withArgs(2);

      await expect(nodeManagement.initializeV3(deployer.address))
        .to.emit(nodeManagement, "Initialized")
        .withArgs(3);

      // cannot initilize twice
      await expect(nodeManagement.initialize(deployer.address, deployer.address, deployer.address))
        .to.be.reverted;

      await expect(nodeManagement.initializeV2()).to.be.reverted;

      await expect(nodeManagement.initializeV3(deployer.address)).to.be.reverted;
    });

    // TODO: this test is skipped because the sdk does not propoerly
    // revert a transaction when we call sendTransaction with a wrong
    // parameters.
    it.skip("Cannot initialize V1 with a zero address for admin", async function () {
      const deployer = (await ethers.getSigners())[0];
      const nodeManagementProxyAddress = await deployUpgradeableWithoutInitialization(
        "NodeManagementV3",
        {},
        false,
      );

      await expect(
        initializeProxy(
          nodeManagementProxyAddress,
          "NodeManagementV3",

          [deployer.address, ZeroAddress, deployer.address],
          {},
        ),
      ).to.be.reverted;
    });

    it("Cannot initialize V3 with a zero address for stargateNft", async function () {
      const deployer = (await ethers.getSigners())[0];
      const nodeManagementProxyAddress = await deployUpgradeableWithoutInitialization(
        "NodeManagementV3",
        {},
        false,
      );

      const nodeManagement = (await initializeProxy(
        nodeManagementProxyAddress,
        "NodeManagementV3",

        [deployer.address, deployer.address, deployer.address],
        {},
      )) as NodeManagementV3;

      await expect(nodeManagement.initializeV2())
        .to.emit(nodeManagement, "Initialized")
        .withArgs(2);

      await expect(nodeManagement.initializeV3(ethers.ZeroAddress)).to.be.reverted;
    });

    it("Only upgrader can initialize V2 and V3", async function () {
      const maliciousUser = otherAccounts[0];

      const nodeManagementProxyAddress = await deployUpgradeableWithoutInitialization(
        "NodeManagementV3",
        {},
        false,
      );

      const nodeManagement = (await initializeProxy(
        nodeManagementProxyAddress,
        "NodeManagementV3",

        [deployer.address, deployer.address, deployer.address],
        {},
      )) as NodeManagementV3;

      expect(await nodeManagement.version()).to.equal("3");

      await expect(nodeManagement.connect(maliciousUser).initializeV2()).to.be.reverted;

      await expect(nodeManagement.connect(maliciousUser).initializeV3(ethers.ZeroAddress)).to.be
        .reverted;
    });
  });

  describe("Contract settings", () => {
    it("Admin can set VechainNodes contract address", async function () {
      const vechainNodesAddress = await nodeManagementContract.getVechainNodesContract();

      expect(
        await nodeManagementContract.hasRole(
          await nodeManagementContract.DEFAULT_ADMIN_ROLE(),
          deployer.address,
        ),
      ).to.be.true;

      await expect(nodeManagementContract.setVechainNodesContract(deployer.address))
        .to.emit(nodeManagementContract, "VechainNodeContractSet")
        .withArgs(vechainNodesAddress, deployer.address);

      const updatedVechainNodesAddress = await nodeManagementContract.getVechainNodesContract();
      expect(compareAddresses(updatedVechainNodesAddress, deployer.address)).to.be.true;
    });

    it("Non admins cannot set VechainNodes contract address", async function () {
      const otherAccount = otherAccounts[0];

      await expect(
        nodeManagementContract.connect(otherAccount).setVechainNodesContract(ethers.ZeroAddress)
      ).to.be.reverted;
    });

    it("VechainNodes contract address cannot be set to zero address", async function () {
      await expect(
        nodeManagementContract.connect(deployer).setVechainNodesContract(ethers.ZeroAddress)
      ).to.be.reverted;
    });
  });

  describe("Basic StargateNFT Integration", () => {
    it("Should show correct StargateNft address after initialization", async function () {
      const stargateNftAddress = await nodeManagementContract.getStargateNft();
      expect(compareAddresses(stargateNftAddress, await stargateNFTContract.getAddress())).to.be
        .true;
    });

    it("Admin can set StargateNFT contract address", async function () {
      const initialAddress = await nodeManagementContract.getStargateNft();
      // ensure checksum
      const mockAddress = getAddress(await mockedErc721Contract.getAddress());

      const tx = await nodeManagementContract.connect(deployer).setStargateNft(mockAddress);
      await expect(tx)
        .to.emit(nodeManagementContract, "StargateNftSet")
        .withArgs(initialAddress, mockAddress);

      const updatedAddress = await nodeManagementContract.getStargateNft();
      expect(compareAddresses(updatedAddress, mockAddress)).to.be.true;
      expect(compareAddresses(updatedAddress, initialAddress)).to.be.false;
    });

    it("Only Admin can set StargateNFT contract address", async function () {
      const otherAccount = otherAccounts[0];
      const mockAddress = await mockedErc721Contract.getAddress();

      // Non-admin shouldn't be able to set the address
      await expect(nodeManagementContract.connect(otherAccount).setStargateNft(mockAddress)).to.be
        .reverted;
    });

    it("Should revert when setting StargateNFT to zero address", async function () {
      await expect(nodeManagementContract.connect(deployer).setStargateNft(ethers.ZeroAddress)).to
        .be.reverted;
    });
  });

  describe("StargateNFT Node Ownership", () => {
    it("Should recognize node ownership from StargateNFT", async function () {
      const account = otherAccounts[0];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      // Mint a token in StargateNFT contract
      tx = await stargateNFTContract.connect(account).stake(levelId, { value: vetAmount });
      await tx.wait();
      // Get the token ID owned by the account
      const ownedIds = await stargateNFTContract.idsOwnedBy(account.address);
      expect(ownedIds.length).to.be.greaterThan(0);

      const ownedNodeId = ownedIds[0];

      // Check if NodeManagement recognizes ownership
      const directOwnership = await nodeManagementContract.isDirectNodeOwner(
        account.address,
        ownedNodeId,
      );
      expect(directOwnership).to.equal(true);

      // Get nodes owned directly
      const directOwnedNodes = await nodeManagementContract.getDirectNodesOwnership(
        account.address,
      );
      expect(directOwnedNodes.length).to.be.greaterThan(0);
      expect(directOwnedNodes).to.include(ownedNodeId);
    });

    it("Should return false for non-existent node ID", async function () {
      const account = otherAccounts[0];
      const nonExistentNodeId = 9999;

      const isOwner = await nodeManagementContract.isDirectNodeOwner(
        account.address,
        nonExistentNodeId,
      );
      expect(isOwner).to.equal(false);
    });
  });

  describe("Node Delegation with StargateNFT", () => {
    it("Should allow StargateNFT node owner to delegate node", async function () {
      const nodeOwner = otherAccounts[0];
      const delegatee = otherAccounts[1];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      // Mint a token in StargateNFT contract
      tx = await stargateNFTContract.connect(nodeOwner).stake(levelId, { value: vetAmount });
      await tx.wait();

      // Get the token ID owned by the account
      const ownedIds = await stargateNFTContract.idsOwnedBy(nodeOwner.address);
      const nodeId = ownedIds[0];

      // Delegate the node
      tx = await nodeManagementContract.connect(nodeOwner).delegateNode(delegatee.address, nodeId);

      await expect(tx)
        .to.emit(nodeManagementContract, "NodeDelegated")
        .withArgs(nodeId, delegatee.address, true);
      // Check if delegation was successful
      const nodeManager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(nodeManager, delegatee.address)).to.be.true;
    });

    it("Should return 0 address as node manager if token id does not exist", async function () {
      const nodeManager = await nodeManagementContract.getNodeManager(1);
      expect(nodeManager).to.equal(ethers.ZeroAddress);
    });

    it("Should be able to get the node level of a StargateNFT node", async function () {
      const config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10;
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

      const levelId = config.TOKEN_LEVELS[0].level.id;

      const { stargateNFTContract, nodeManagementContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

      // Mint NFT and delegate
      const tx = await stargateNFTContract.stakeAndDelegate(levelId, true, {
        value: ethers.parseEther("1"),
      });
      await tx.wait();
      const nodeLevel = await nodeManagementContract.getNodeLevel(tokenId);
      expect(nodeLevel).to.equal(levelId);
    });

    it("Should return false when checking legacy node for a non existent token id", async function () {
      const isLegacyNode = await nodeManagementContract.isLegacyNode(10000);
      expect(isLegacyNode).to.equal(false);
    });

    it("Should be able to get direct ownership of a StargateNFT node", async function () {
      const config = createLocalConfig();
      config.DELEGATION_PERIOD_DURATION = 10;
      config.TOKEN_LEVELS[0].level.maturityBlocks = 0;
      config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");

      const levelId = config.TOKEN_LEVELS[0].level.id;

      const { stargateNFTContract, nodeManagementContract, deployer } = await getOrDeployContracts({
        forceDeploy: true,
      });

      const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

      // Mint NFT and delegate
      const tx = await stargateNFTContract.stakeAndDelegate(levelId, true, {
        value: ethers.parseEther("1"),
      });
      await tx.wait();

      const directOwnership = await nodeManagementContract.getDirectNodeOwnership(deployer.address);
      expect(directOwnership).to.equal(tokenId);
    });

    it("Should allow StargateNFT node owner to remove delegation", async function () {
      const nodeOwner = otherAccounts[0];
      const delegatee = otherAccounts[1];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      // Mint a token in StargateNFT contract
      tx = await stargateNFTContract.connect(nodeOwner).stake(levelId, { value: vetAmount });
      await tx.wait();
      // Get the token ID owned by the account
      const ownedIds = await stargateNFTContract.idsOwnedBy(nodeOwner.address);
      const nodeId = ownedIds[0];

      // Delegate the node
      await nodeManagementContract.connect(nodeOwner).delegateNode(delegatee.address, nodeId);

      // Remove delegation
      tx = await nodeManagementContract.connect(nodeOwner).removeNodeDelegation(nodeId);
      await expect(tx)
        .to.emit(nodeManagementContract, "NodeDelegated")
        .withArgs(nodeId, delegatee.address, false);
      // Check if delegation was removed
      const nodeManager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(nodeManager, nodeOwner.address)).to.be.true;
    });

    it("Should handle nodes from both legacy and StargateNFT contracts", async function () {
      const legacyNodeOwner = deployer;
      const stargateNodeOwner = otherAccounts[0];
      const delegatee = otherAccounts[1];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      // Create a legacy node
      const legacyNodeId = await createLegacyNodeHolder(2, legacyNodeOwner);

      // Mint a token in StargateNFT contract
      tx = await stargateNFTContract
        .connect(stargateNodeOwner)
        .stake(levelId, { value: vetAmount });
      await tx.wait();
      const ownedIds = await stargateNFTContract.idsOwnedBy(stargateNodeOwner.address);
      const stargateNodeId = ownedIds[0];

      // Delegate both nodes to the same delegatee
      tx = await nodeManagementContract
        .connect(legacyNodeOwner)
        .delegateNode(delegatee.address, legacyNodeId);
      await tx.wait();
      tx = await nodeManagementContract
        .connect(stargateNodeOwner)
        .delegateNode(delegatee.address, stargateNodeId);
      await tx.wait();

      // Check if delegation was successful for both nodes
      const legacyNodeManager = await nodeManagementContract.getNodeManager(legacyNodeId);
      const stargateNodeManager = await nodeManagementContract.getNodeManager(stargateNodeId);

      expect(compareAddresses(legacyNodeManager, delegatee.address)).to.be.true;
      expect(compareAddresses(stargateNodeManager, delegatee.address)).to.be.true;

      // Check delegatee's managed nodes
      const delegatedNodes = await nodeManagementContract.getNodeIds(delegatee.address);
      expect(delegatedNodes).to.include(legacyNodeId);
      expect(delegatedNodes).to.include(stargateNodeId);
    });

    it("Should prevent non-owner from delegating a node", async function () {
      const nodeOwner = otherAccounts[0];
      const nonOwner = otherAccounts[1];
      const delegatee = otherAccounts[2];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      // Mint a token in StargateNFT contract
      tx = await stargateNFTContract.connect(nodeOwner).stake(levelId, { value: vetAmount });
      await tx.wait();
      // Get the token ID owned by the account
      const ownedIds = await stargateNFTContract.idsOwnedBy(nodeOwner.address);
      const nodeId = ownedIds[0];

      // Try to delegate as non-owner
      await expect(nodeManagementContract.connect(nonOwner).delegateNode(delegatee.address, nodeId))
        .to.be.reverted;
    });
  });

  describe("Node Information and Status", () => {
    it("Should correctly identify if a node is from legacy or StargateNFT", async function () {
      // Create a legacy node
      const legacyNodeId = await createLegacyNodeHolder(2, deployer);

      // Create a Stargate node
      const stargateNodeOwner = otherAccounts[0];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      tx = await stargateNFTContract
        .connect(stargateNodeOwner)
        .stake(levelId, { value: vetAmount });
      await tx.wait();
      const ownedIds = await stargateNFTContract.idsOwnedBy(stargateNodeOwner.address);
      const stargateNodeId = ownedIds[0];

      // Check if nodes are correctly identified
      const isLegacyNode = await nodeManagementContract.isLegacyNode(legacyNodeId);
      expect(isLegacyNode).to.be.true;

      const isStargateNodeLegacy = await nodeManagementContract.isLegacyNode(stargateNodeId);
      expect(isStargateNodeLegacy).to.be.false;
    });

    it("Should correctly return node levels for both types of nodes", async function () {
      // Create a legacy node with level 2 (Thunder)
      const legacyNodeId = await createLegacyNodeHolder(2, deployer);

      // Create a Stargate node with level 1
      const stargateNodeOwner = otherAccounts[0];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      const tx = await stargateNFTContract
        .connect(stargateNodeOwner)
        .stake(levelId, { value: vetAmount });
      await tx.wait();
      const ownedIds = await stargateNFTContract.idsOwnedBy(stargateNodeOwner.address);
      const stargateNodeId = ownedIds[0];

      // Check node levels
      const legacyNodeLevel = await nodeManagementContract.getNodeLevel(legacyNodeId);
      expect(legacyNodeLevel).to.equal(2); // Thunder node

      const stargateNodeLevel = await nodeManagementContract.getNodeLevel(stargateNodeId);
      expect(stargateNodeLevel).to.equal(levelId); // Level from stargateNFT
    });

    it("Should return comprehensive node details for both types of nodes", async function () {
      const delegatee = otherAccounts[1];

      // Create a legacy node with level 2 (Thunder)
      const legacyNodeId = await createLegacyNodeHolder(2, deployer);

      // Create a Stargate node
      const stargateNodeOwner = otherAccounts[0];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      tx = await stargateNFTContract
        .connect(stargateNodeOwner)
        .stake(levelId, { value: vetAmount });
      await tx.wait();
      const ownedIds = await stargateNFTContract.idsOwnedBy(stargateNodeOwner.address);
      const stargateNodeId = ownedIds[0];

      // Delegate both nodes
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(delegatee.address, legacyNodeId);
      await tx.wait();

      tx = await nodeManagementContract
        .connect(stargateNodeOwner)
        .delegateNode(delegatee.address, stargateNodeId);
      await tx.wait();

      // Get detailed node info
      const delegateeNodes = await nodeManagementContract.getUserNodes(delegatee.address);
      expect(delegateeNodes.length).to.equal(2);

      // Check legacy node details
      const legacyNodeInfo = delegateeNodes.find(
        (node) => node.nodeId.toString() === legacyNodeId.toString(),
      );
      expect(legacyNodeInfo).to.not.be.undefined;
      if (legacyNodeInfo) {
        expect(legacyNodeInfo.nodeLevel).to.equal(2); // Thunder node
        expect(legacyNodeInfo.xNodeOwner).to.equal(deployer.address);
        expect(legacyNodeInfo.isXNodeDelegated).to.equal(true);
        expect(legacyNodeInfo.isXNodeDelegatee).to.equal(true);
        expect(legacyNodeInfo.delegatee).to.equal(delegatee.address);
      }

      // Check Stargate node details
      const stargateNodeInfo = delegateeNodes.find(
        (node) => node.nodeId.toString() === stargateNodeId.toString(),
      );
      expect(stargateNodeInfo).to.not.be.undefined;
      if (stargateNodeInfo) {
        expect(stargateNodeInfo.nodeLevel).to.equal(levelId); // Level from StargateNFT
        expect(stargateNodeInfo.xNodeOwner).to.equal(stargateNodeOwner.address);
        expect(stargateNodeInfo.isXNodeDelegated).to.equal(true);
        expect(stargateNodeInfo.isXNodeDelegatee).to.equal(true);
        expect(stargateNodeInfo.delegatee).to.equal(delegatee.address);
      }
    });

    it("Should return node manager of a stargateNFT node", async function () {
      const level1 = await stargateNFTContract.getLevel(1);
      const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

      const tx = await stargateNFTContract.stake(1, { value: level1.vetAmountRequiredToStake });
      await tx.wait();

      const nodeManager = await nodeManagementContract.getNodeManager(tokenId);
      expect(compareAddresses(nodeManager, deployer.address)).to.be.true;
    });

    it("Should return node owner of a stargateNFT node", async function () {
      const level1 = await stargateNFTContract.getLevel(1);
      const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

      const tx = await stargateNFTContract.stake(1, { value: level1.vetAmountRequiredToStake });
      await tx.wait();

      const nodeOwner = await nodeManagementContract.getNodeOwner(tokenId);
      expect(compareAddresses(nodeOwner, deployer.address)).to.be.true;
    });

    it("If node does not exist, should return address 0 as node owner", async function () {
      expect(compareAddresses(await nodeManagementContract.getNodeOwner(1), ethers.ZeroAddress)).to
        .be.true;
    });

    it("Should correctly return node owner of a legacy node", async function () {
      const legacyNodeId = await createLegacyNodeHolder(2, deployer);

      const nodeOwner = await nodeManagementContract.getNodeOwner(legacyNodeId);
      expect(compareAddresses(nodeOwner, deployer.address)).to.be.true;
    });

    it("Should not be possible to see if address zero is a node manager", async function () {
      await expect(nodeManagementContract.isNodeManager(ethers.ZeroAddress, 1)).to.be.reverted;
    });

    it("Should return false if a non existing node is checked if it is a delegate", async function () {
      expect(await nodeManagementContract.isNodeDelegated(100000)).to.equal(false);
    });

    it("Should return 0 when checking the level of a non existing node", async function () {
      expect(await nodeManagementContract.getNodeLevel(100000)).to.equal(0);
    });

    it("Can correctly get the node level of a stargateNFT node", async function () {
      const level1 = await stargateNFTContract.getLevel(1);
      const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

      const tx = await stargateNFTContract.stake(1, { value: level1.vetAmountRequiredToStake });
      await tx.wait();

      const nodeLevel = await nodeManagementContract.getNodeLevel(tokenId);
      expect(nodeLevel).to.equal(1);
    });

    it("Can check if a user is the direct node owner of a stargateNFT node", async function () {
      const level1 = await stargateNFTContract.getLevel(1);
      const tokenId = (await stargateNFTContract.getCurrentTokenId()) + 1n;

      const tx = await stargateNFTContract.stake(1, { value: level1.vetAmountRequiredToStake });
      await tx.wait();

      const isNodeOwner = await nodeManagementContract.isDirectNodeOwner(deployer.address, tokenId);
      expect(isNodeOwner).to.equal(true);
    });
  });

  describe("Multi-Node Management", () => {
    it("Should handle ownership of multiple nodes from both contracts", async function () {
      const multiNodeOwner = otherAccounts[0];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      // Create a legacy node for the user
      await createLegacyNodeHolder(2, multiNodeOwner);
      
      await mineBlocks(1);

      // Mint multiple StargateNFT tokens for the same user
      tx = await stargateNFTContract
        .connect(multiNodeOwner)
        .stake(levelId, { value: vetAmount, gasLimit: 10_000_000 });
      await tx.wait();

      tx = await stargateNFTContract
        .connect(multiNodeOwner)
        .stake(levelId, { value: vetAmount, gasLimit: 10_000_000 });
      await tx.wait();

      // Get all nodes owned by the user
      const directOwnedNodes = await nodeManagementContract.getDirectNodesOwnership(
        multiNodeOwner.address,
      );

      // Should have 3 nodes (1 legacy + 2 StargateNFT)
      expect(directOwnedNodes.length).to.equal(3);

      // Get node levels
      const nodeLevels = await nodeManagementContract.getUsersNodeLevels(multiNodeOwner.address);
      expect(nodeLevels.length).to.equal(3);
      expect(nodeLevels).to.include(2n); // Legacy Thunder node
      expect(nodeLevels.filter((level) => level === BigInt(levelId)).length).to.equal(2); // Two StargateNFT nodes of the same level
    });

    it("Should handle delegation of multiple nodes from both contracts", async function () {
      // Set up owners and delegatee
      const legacyOwner1 = otherAccounts[0];
      const legacyOwner2 = otherAccounts[1];
      const stargateOwner = otherAccounts[2];
      const delegatee = otherAccounts[3];

      // Get the lowest level with its VET requirement
      const { id: levelId, vetAmount } = await getLevelWithLowestVetRequirement(
        stargateNFTContract
      );

      // Create legacy nodes
      const legacyNode1 = await createLegacyNodeHolder(2, legacyOwner1);
      const legacyNode2 = await createLegacyNodeHolder(4, legacyOwner2);

      // Create StargateNFT node
      tx = await stargateNFTContract.connect(stargateOwner).stake(levelId, { value: vetAmount });
      await tx.wait();

      const stargateNodeIds = await stargateNFTContract.idsOwnedBy(stargateOwner.address);
      const stargateNode = stargateNodeIds[0];

      // Delegate all nodes to the same delegatee
      tx = await nodeManagementContract
        .connect(legacyOwner1)
        .delegateNode(delegatee.address, legacyNode1);
      await tx.wait();

      tx = await nodeManagementContract
        .connect(legacyOwner2)
        .delegateNode(delegatee.address, legacyNode2);
      await tx.wait();

      tx = await nodeManagementContract
        .connect(stargateOwner)
        .delegateNode(delegatee.address, stargateNode);
      await tx.wait();

      // Check delegatee's managed nodes
      const delegatedNodes = await nodeManagementContract.getNodeIds(delegatee.address);
      expect(delegatedNodes.length).to.equal(3);
      expect(delegatedNodes).to.include(legacyNode1);
      expect(delegatedNodes).to.include(legacyNode2);
      expect(delegatedNodes).to.include(stargateNode);

      // Check if delegatee is recognized as node holder
      const isNodeHolder = await nodeManagementContract.isNodeHolder(delegatee.address);
      expect(isNodeHolder).to.equal(true);
    });
  });

  describe("StargateNFT specific getters", () => {
    it("Should correctly return users's stargate NFTs info", async function () {
      const currentTokenId = await stargateNFTContract.getCurrentTokenId();

      const level1 = await stargateNFTContract.getLevel(1);
      const level2 = await stargateNFTContract.getLevel(2);
      tx = await stargateNFTContract
        .connect(otherAccounts[0])
        .stake(1, { value: level1.vetAmountRequiredToStake });
      await tx.wait();

      tx = await stargateNFTContract
        .connect(otherAccounts[0])
        .stake(2, { value: level2.vetAmountRequiredToStake });
      await tx.wait();

      let nftsInfo = await nodeManagementContract.getUserStargateNFTsInfo(otherAccounts[0].address);
      expect(nftsInfo.length).to.equal(2);
      expect(nftsInfo[0].tokenId).to.equal(currentTokenId + 1n);
      expect(nftsInfo[0].levelId).to.equal(1);
      expect(nftsInfo[0].vetAmountStaked).to.equal(level1.vetAmountRequiredToStake);

      expect(nftsInfo[1].tokenId).to.equal(currentTokenId + 2n);
      expect(nftsInfo[1].levelId).to.equal(2);
      expect(nftsInfo[1].vetAmountStaked).to.equal(level2.vetAmountRequiredToStake);

      // let a user delegate a node to otherAccounts[0]
      const user2 = otherAccounts[1];
      const user2ExpectedTokenId = currentTokenId + 3n;
      tx = await stargateNFTContract
        .connect(user2)
        .stake(1, { value: level1.vetAmountRequiredToStake });
      await tx.wait();

      tx = await nodeManagementContract
        .connect(user2)
        .delegateNode(otherAccounts[0].address, user2ExpectedTokenId);
      await tx.wait();

      nftsInfo = await nodeManagementContract.getUserStargateNFTsInfo(otherAccounts[0].address);
      expect(nftsInfo.length).to.equal(3);
      expect(nftsInfo[0].tokenId).to.equal(currentTokenId + 1n);
      expect(nftsInfo[0].levelId).to.equal(1);
      expect(nftsInfo[0].vetAmountStaked).to.equal(level1.vetAmountRequiredToStake);

      expect(nftsInfo[1].tokenId).to.equal(currentTokenId + 2n);
      expect(nftsInfo[1].levelId).to.equal(2);
      expect(nftsInfo[1].vetAmountStaked).to.equal(level2.vetAmountRequiredToStake);

      expect(nftsInfo[2].tokenId).to.equal(user2ExpectedTokenId);
      expect(nftsInfo[2].levelId).to.equal(1);
      expect(nftsInfo[2].vetAmountStaked).to.equal(level1.vetAmountRequiredToStake);
    });
  });
});
