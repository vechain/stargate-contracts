import { ethers } from "hardhat";
import { expect } from "chai";
import { createLegacyNodeHolder, getOrDeployContracts } from "../helpers";
import { describe, it } from "mocha";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import {
  NodeManagementV1,
  NodeManagementV2,
  NodeManagementV3,
  StargateNFT,
  TokenAuction,
} from "../../typechain-types";
import { deployProxy, upgradeProxy } from "../../scripts/helpers";
import { TransactionResponse } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { compareAddresses } from "@repo/utils/AddressUtils";

describe("shard1000: NodeManagement", function () {
  let tx: TransactionResponse;
  let deployer: HardhatEthersSigner;
  let otherAccounts: HardhatEthersSigner[];
  let nodeManagementContract: NodeManagementV3;
  let legacyNodesContract: TokenAuction;
  let stargateNFTContract: StargateNFT;

  beforeEach(async function () {
    const contracts = await getOrDeployContracts({
      forceDeploy: true,
    });
    deployer = contracts.deployer;
    otherAccounts = contracts.otherAccounts;

    nodeManagementContract = contracts.nodeManagementContract;
    legacyNodesContract = contracts.legacyNodesContract;
    stargateNFTContract = contracts.stargateNFTContract;
  });

  describe("Contract upgradeability", () => {
    it("Cannot initialize twice", async function () {
      await expect(
        nodeManagementContract.initialize(
          await legacyNodesContract.getAddress(),
          deployer.address,
          deployer.address
        )
      ).to.be.revertedWithCustomError(nodeManagementContract, "InvalidInitialization");
    });

    it("User with UPGRADER_ROLE should be able to upgrade the contract", async function () {
      // Deploy the implementation contract
      const Contract = await ethers.getContractFactory("NodeManagementV2");
      const implementation = await Contract.deploy();
      await implementation.waitForDeployment();

      const currentImplAddress = await getImplementationAddress(
        ethers.provider,
        await nodeManagementContract.getAddress()
      );

      const UPGRADER_ROLE = await nodeManagementContract.UPGRADER_ROLE();
      expect(await nodeManagementContract.hasRole(UPGRADER_ROLE, deployer.address)).to.eql(true);

      tx = await nodeManagementContract.upgradeToAndCall(await implementation.getAddress(), "0x");
      await tx.wait();

      const newImplAddress = await getImplementationAddress(
        ethers.provider,
        await nodeManagementContract.getAddress()
      );

      expect(compareAddresses(newImplAddress, currentImplAddress)).to.not.eql(true);
      expect(compareAddresses(newImplAddress, await implementation.getAddress())).to.eql(true);
    });

    it("Only user with UPGRADER_ROLE should be able to upgrade the contract", async function () {
      const otherAccount = otherAccounts[0];

      // Deploy the implementation contract
      const Contract = await ethers.getContractFactory("NodeManagementV2");
      const implementation = await Contract.deploy();
      await implementation.waitForDeployment();

      const currentImplAddress = await getImplementationAddress(
        ethers.provider,
        await nodeManagementContract.getAddress()
      );

      const UPGRADER_ROLE = await nodeManagementContract.UPGRADER_ROLE();
      expect(await nodeManagementContract.hasRole(UPGRADER_ROLE, otherAccount.address)).to.eql(
        false
      );

      await expect(
        nodeManagementContract
          .connect(otherAccount)
          .upgradeToAndCall(await implementation.getAddress(), "0x")
      ).to.be.reverted;

      const newImplAddress = await getImplementationAddress(
        ethers.provider,
        await nodeManagementContract.getAddress()
      );

      expect(compareAddresses(newImplAddress, currentImplAddress)).to.eql(true);
      expect(compareAddresses(newImplAddress, await implementation.getAddress())).to.not.eql(true);
    });

    it("Should return correct version of the contract", async () => {
      expect(await nodeManagementContract.version()).to.equal("3");
    });

    it("Should be no state conflicts after upgrade", async () => {
      const otherAccount = otherAccounts[0];

      const nodeManagementV1 = (await deployProxy("NodeManagementV1", [
        await legacyNodesContract.getAddress(),
        deployer.address,
        deployer.address,
      ])) as NodeManagementV1;

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      await createLegacyNodeHolder(4, otherAccounts[1]); // Using index 1 instead of 0
      await createLegacyNodeHolder(7, otherAccounts[2]); // Using index 2 instead of 1

      tx = await legacyNodesContract.addToken(otherAccounts[3].address, 7, false, 0, 0); // Using index 3 instead of 2

      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");

      // Retrieve the block where the transaction was included
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");

      // NodeManagementV1 still uses the old function signatures
      tx = await nodeManagementV1.connect(deployer).delegateNode(otherAccount.address);
      await tx.wait();

      tx = await nodeManagementV1.connect(otherAccounts[1]).delegateNode(otherAccount.address);
      await tx.wait();

      tx = await nodeManagementV1.connect(otherAccounts[2]).delegateNode(otherAccount.address);
      await tx.wait();

      let storageSlots = [];

      const initialSlot = BigInt(
        "0x895b04a03424f581b1c6717e3715bbb5ceb9c40a4e5b61a13e84096251cf8f00"
      ); // Slot 0 of VoterRewards

      for (let i = initialSlot; i < initialSlot + BigInt(100); i++) {
        storageSlots.push(await ethers.provider.getStorage(await nodeManagementV1.getAddress(), i));
      }

      storageSlots = storageSlots.filter(
        (slot) => slot !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      ); // removing empty slots

      const nodeManagement = (await upgradeProxy(
        "NodeManagementV1",
        "NodeManagementV2",
        await nodeManagementV1.getAddress(),
        [],
        {
          version: 2,
        }
      )) as NodeManagementV2;

      const storageSlotsAfter = [];

      for (let i = initialSlot; i < initialSlot + BigInt(100); i++) {
        storageSlotsAfter.push(
          await ethers.provider.getStorage(await nodeManagement.getAddress(), i)
        );
      }

      // Check if storage slots are the same after upgrade
      for (let i = 0; i < storageSlots.length; i++) {
        expect(storageSlots[i]).to.equal(storageSlotsAfter[i]);
      }

      // Check if all nodes are delegated to the same address
      expect(await nodeManagement.getNodeIds(otherAccount.address)).to.eql([1n, 2n, 3n]);

      // Check node owners are not delegated to themselves
      expect(await nodeManagement.getNodeIds(deployer.address)).to.eql([]);
      expect(await nodeManagement.getNodeIds(otherAccounts[1].address)).to.eql([]);
      expect(await nodeManagement.getNodeIds(otherAccounts[2].address)).to.eql([]);
    });
  });

  describe("Admin", () => {
    it("Admin can set vechain nodes contract address", async function () {
      const initialAddress = await nodeManagementContract.getVechainNodesContract();

      tx = await nodeManagementContract.connect(deployer).setVechainNodesContract(deployer.address);
      await tx.wait();

      const updatedAddress = await nodeManagementContract.getVechainNodesContract();
      expect(compareAddresses(updatedAddress, deployer.address)).to.eql(true);
      expect(compareAddresses(updatedAddress, initialAddress)).to.not.eql(true);
    });

    it("Only Admin can set vechain nodes contract address", async function () {
      const otherAccount = otherAccounts[0];

      await expect(
        nodeManagementContract.connect(otherAccount).setVechainNodesContract(deployer.address)
      ).to.be.reverted;
    });
  });

  describe("Node Management Delegation", () => {
    it("Should allow node owner to delegate node", async function () {
      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, nodeId);

      await expect(tx)
        .to.emit(nodeManagementContract, "NodeDelegated")
        .withArgs(nodeId, otherAccount.address, true);

      const delegatee = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(delegatee, otherAccount.address)).to.equal(true);
    });

    it("Should allow node owner to remove delegation", async function () {
      const otherAccount = otherAccounts[0];
      // Mock node ownership and delegation
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, nodeId);
      await expect(tx)
        .to.emit(nodeManagementContract, "NodeDelegated")
        .withArgs(nodeId, otherAccount.address, true);

      const delegatee = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(delegatee, otherAccount.address)).to.equal(true);

      tx = await nodeManagementContract.connect(deployer).removeNodeDelegation(nodeId);
      await expect(tx)
        .to.emit(nodeManagementContract, "NodeDelegated")
        .withArgs(nodeId, otherAccount.address, false);

      const newManager = await nodeManagementContract.getNodeManager(nodeId);

      // Node should no longer be delegated -> manager should be the owner
      expect(compareAddresses(newManager, deployer.address)).to.equal(true);
    });

    it("Should revert if non-node owner tries to delegate a node", async function () {
      const otherAccount = otherAccounts[0];

      const nodeId = await createLegacyNodeHolder(2, deployer);

      await expect(
        nodeManagementContract.connect(otherAccount).delegateNode(deployer.address, nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementNotNodeOwner");
    });

    it("Should revert if node owner tries to delegate themselves", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node cannot be delegated to themselves
      await expect(
        nodeManagementContract.connect(deployer).delegateNode(deployer.address, nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementSelfDelegation");
    });

    it("Should revert if node is getting delegated to the zero address", async function () {
      // Mock node ownership and delegation
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node cannot be delegated to the zero address
      await expect(
        nodeManagementContract.connect(deployer).delegateNode(ethers.ZeroAddress, nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementZeroAddress");
    });

    it("A user can have multiple nodes delegated to them", async function () {
      const otherAccount = otherAccounts[0];
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      await createLegacyNodeHolder(2, otherAccounts[1]); // Using index 1 instead of 0
      await createLegacyNodeHolder(2, otherAccounts[2]); // Using index 2 instead of 1

      const deployerNodeId = await legacyNodesContract.ownerToId(deployer.address);
      const account1NodeId = await legacyNodesContract.ownerToId(otherAccounts[1].address);
      const account2NodeId = await legacyNodesContract.ownerToId(otherAccounts[2].address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, deployerNodeId);
      await tx.wait();

      tx = await nodeManagementContract
        .connect(otherAccounts[1])
        .delegateNode(otherAccount.address, account1NodeId);
      await tx.wait();

      tx = await nodeManagementContract
        .connect(otherAccounts[2])
        .delegateNode(otherAccount.address, account2NodeId);
      await tx.wait();

      // Check if all nodes are delegated to the same address
      expect(await nodeManagementContract.getNodeIds(otherAccount.address)).to.eql([1n, 2n, 3n]);

      // Check node owners are not delegated to themselves
      expect(await nodeManagementContract.getNodeIds(deployer.address)).to.eql([]);
      expect(await nodeManagementContract.getNodeIds(otherAccounts[1].address)).to.eql([]);
      expect(await nodeManagementContract.getNodeIds(otherAccounts[2].address)).to.eql([]);
    });

    it("A node owner should be able to re-delegate node", async function () {
      const otherAccount = otherAccounts[0];

      // Mock node ownership and delegation
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, nodeId);
      await tx.wait();

      const manager = await nodeManagementContract.getNodeManager(nodeId);

      expect(compareAddresses(manager, otherAccount.address)).to.be.true;

      // Should be able to re-delegate the node
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[1].address, nodeId);

      await expect(tx)
        .to.emit(nodeManagementContract, "NodeDelegated")
        .withArgs(nodeId, otherAccounts[1].address, true);

      const newManager = await nodeManagementContract.getNodeManager(nodeId);

      expect(compareAddresses(newManager, otherAccounts[1].address)).to.be.true;

      // Other account should not be the manager
      expect(await nodeManagementContract.getNodeIds(otherAccount.address)).to.eql([]);
    });

    it("Should revert if non node owner is trying to remove delegation", async function () {
      const otherAccount = otherAccounts[0];

      const nodeId = await createLegacyNodeHolder(2, otherAccount);
      tx = await nodeManagementContract
        .connect(otherAccount)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      await expect(
        nodeManagementContract.connect(otherAccounts[8]).removeNodeDelegation(nodeId)
      ).to.be.revertedWithCustomError(
        nodeManagementContract,
        "NodeManagementNotNodeOwnerOrManager"
      );
    });

    it("Should revert if non node owner is trying to remove delegation if node is not delegated", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so this should revert
      await expect(
        nodeManagementContract.connect(deployer).removeNodeDelegation(nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementNodeNotDelegated");
    });

    it("If a node is downgraded to level NONE, it cannot be delegated", async function () {
      // Mock node ownership
      const nodeId = await createLegacyNodeHolder(7, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      //Downgrade the node to level NONE
      tx = await legacyNodesContract.connect(deployer).downgradeTo(nodeId, 0, {
        gasLimit: 10_000_000,
      });
      await tx.wait();

      const metadata = await legacyNodesContract.getMetadata(nodeId);
      expect(metadata[1]).to.eql(0n);

      await expect(
        nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementNotNodeOwner");
    });

    it("If a node is transferred new owner can re-delegate to another account to manage", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(7, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      // delegate the node
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      // Transfer the node to the other account
      tx = await legacyNodesContract.connect(deployer).transfer(otherAccounts[0].address, 1);
      await tx.wait();
      // Account 5 should still be the manager
      expect(await nodeManagementContract.getNodeManager(1)).to.equal(otherAccounts[5].address);

      // Should be able to re-delegate the node
      tx = await nodeManagementContract
        .connect(otherAccounts[0])
        .delegateNode(otherAccounts[1].address, nodeId);

      // Account 1 should now be the manager
      expect(
        compareAddresses(await nodeManagementContract.getNodeManager(1), otherAccounts[1].address)
      ).to.be.true;
    });

    it("If a node is transferred that was delegated new owner can remove delegation if they want to manage it", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(7, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      // delegate the node
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      // Transfer the node to the other account
      tx = await legacyNodesContract.connect(deployer).transfer(otherAccounts[0].address, 1);
      await tx.wait();

      // Account 5 should still be the manager
      expect(
        compareAddresses(await nodeManagementContract.getNodeManager(1), otherAccounts[5].address)
      ).to.be.true;

      // Should be able to remove the delegation
      tx = await nodeManagementContract.connect(otherAccounts[0]).removeNodeDelegation(nodeId);
      await tx.wait();

      // Account 0 should now be the manager
      expect(
        compareAddresses(await nodeManagementContract.getNodeManager(1), otherAccounts[0].address)
      ).to.be.true;

      // Account 1 should not be the manager
      expect(await nodeManagementContract.getNodeIds(otherAccounts[1].address)).to.eql([]);
    });
  });

  describe("Node Manager Resolution and Status", () => {
    it("Should return the owner as the node manager if the node has not been delegated", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so the manager should be the owner
      const manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, deployer.address)).to.be.true;
    });

    it("Should return the correct node manager if the node has been delegated", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[0].address, nodeId);
      await tx.wait();
      // Node should be delegated at this point so the manager should be the delegatee
      const manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, otherAccounts[0].address)).to.be.true;
    });

    it("Should return the correct node manager if the node has been re-delegated", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[0].address, nodeId);
      await tx.wait();
      // Node should be delegated at this point so the manager should be the delegatee
      let manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, otherAccounts[0].address)).to.be.true;

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[1].address, nodeId);
      await tx.wait();
      // Node should be delegated at this point so the manager should be the delegatee
      manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, otherAccounts[1].address)).to.be.true;
    });

    it("Should return the correct node manager if the node has been re-delegated multiple times", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // First delegation - deployer delegates to otherAccounts[1]
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[1].address, nodeId);
      await tx.wait();

      // Node should be delegated at this point so the manager should be the delegatee
      let manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, otherAccounts[1].address)).to.be.true;

      // Second delegation - deployer re-delegates to otherAccounts[2]
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[2].address, nodeId);
      await tx.wait();

      // Node should now be delegated to the new delegatee
      manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, otherAccounts[2].address)).to.be.true;

      // Third delegation - deployer re-delegates to otherAccounts[3]
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[3].address, nodeId);
      await tx.wait();

      // Node should now be delegated to the third delegatee
      manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, otherAccounts[3].address)).to.be.true;
    });

    it("Should return the correct node level", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so the level should be 2
      const nodeLevel = await nodeManagementContract.getNodeLevel(nodeId);
      expect(nodeLevel).to.equal(2);
    });

    it("Should return correct node level of a user owning a node", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      // Node should not be delegated at this point so the level should be 2
      const nodeLevels = await nodeManagementContract.getUsersNodeLevels(deployer.address);
      expect(nodeLevels[0]).to.equal(2n);
    });

    it("Should return correct node level of a user managing multiple nodes", async function () {
      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      await createLegacyNodeHolder(4, otherAccounts[1]); // Using index 1 instead of 0
      await createLegacyNodeHolder(7, otherAccounts[2]); // Using index 2 instead of 1

      const deployerNodeId = await legacyNodesContract.ownerToId(deployer.address);
      const account1NodeId = await legacyNodesContract.ownerToId(otherAccounts[1].address);
      const account2NodeId = await legacyNodesContract.ownerToId(otherAccounts[2].address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, deployerNodeId);
      await tx.wait();
      tx = await nodeManagementContract
        .connect(otherAccounts[1])
        .delegateNode(otherAccount.address, account1NodeId);
      await tx.wait();
      tx = await nodeManagementContract
        .connect(otherAccounts[2])
        .delegateNode(otherAccount.address, account2NodeId);

      // Node should not be delegated at this point so the level should be 2
      const nodeLevels = await nodeManagementContract.getUsersNodeLevels(otherAccount.address);
      expect(nodeLevels).to.eql([2n, 4n, 7n]);
    });

    it("Should return true if a user owning a node is checked for being a node manager", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so the level should be 2
      const isManager = await nodeManagementContract.isNodeManager(deployer.address, nodeId);
      expect(isManager).to.equal(true);
    });

    it("Should return true if a user with a node delegated is checked for being a node manager", async function () {
      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, nodeId);
      await tx.wait();
      // Node should be delegated at this point so the other account should be the manager
      const isManager = await nodeManagementContract.isNodeManager(otherAccount.address, 1);
      expect(isManager).to.equal(true);
    });

    it("Should return false if a user owning a node who delegated it is checked for being a node manager", async function () {
      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, nodeId);
      await tx.wait();

      // Node should be delegated at this point so the other account should be the manager and owner should not be
      const isManager = await nodeManagementContract.isNodeManager(deployer.address, 1);
      expect(isManager).to.equal(false);
    });

    it("Should return false if a user not owning a node is checked for being a node manager", async function () {
      const otherAccount = otherAccounts[0];
      const notNodeManager = otherAccounts[1];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, nodeId);
      await tx.wait();

      const isManager = await nodeManagementContract.isNodeManager(notNodeManager.address, nodeId);
      expect(isManager).to.equal(false);
    });

    it("If a node is delegated to a user and the owner transfers the node, the same user should be the manager", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      // Transfer the node to the other account
      tx = await legacyNodesContract.connect(deployer).transfer(otherAccounts[0].address, 1);
      await tx.wait();

      const manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, otherAccounts[5].address)).to.be.true;
    });

    it("If a node is delegated to a user and the owner transfers the node, the same user should be the manager", async function () {
      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      // Transfer the node to the other account
      tx = await legacyNodesContract.connect(deployer).transfer(otherAccount.address, 1);
      await tx.wait();

      const manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(compareAddresses(manager, otherAccounts[5].address)).to.be.true;
    });

    it("If a node is delegated and downgraded to level NONE false gets returned when check is user NODE manager", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(7, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      //Downgrade the node to level NONE
      tx = await legacyNodesContract.connect(deployer).downgradeTo(nodeId, 0);
      await tx.wait();

      const manager = await nodeManagementContract.isNodeManager(otherAccounts[5].address, 1);
      expect(manager).to.equal(false);
    });
  });

  describe("isNodeHolder Function", () => {
    it("Should return true for a user who owns a node", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      // Check if the owner is a node holder
      const isHolder = await nodeManagementContract.isNodeHolder(deployer.address);
      expect(isHolder).to.equal(true);
    });

    it("Should return true for a user who only has delegated nodes", async function () {
      // Mock node ownership and delegation
      await createLegacyNodeHolder(2, deployer);
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();
      // Check if the delegatee is a node holder
      const isHolder = await nodeManagementContract.isNodeHolder(otherAccounts[5].address);
      expect(isHolder).to.equal(true);
    });

    it("Should return true for a user who both owns and has delegated nodes", async function () {
      // Mock node ownership for both owned and delegated nodes
      await createLegacyNodeHolder(2, deployer); // Own node
      await createLegacyNodeHolder(4, otherAccounts[0]); // Node to delegate

      // Delegate owner's node to otherAccount
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      // Check if the user with both owned and delegated nodes is a holder
      const isHolder = await nodeManagementContract.isNodeHolder(otherAccounts[5].address);
      expect(isHolder).to.equal(true);
    });

    it("Should return false for a user who neither owns nor has delegated nodes", async function () {
      // Check if a user with no nodes is a holder
      const isHolder = await nodeManagementContract.isNodeHolder(otherAccounts[5].address);
      expect(isHolder).to.equal(false);
    });

    it("Should return false for zero address", async function () {
      // Check if zero address is a holder
      await expect(
        nodeManagementContract.isNodeHolder(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721InvalidOwner");

      const isHolder = await nodeManagementContract.isNodeHolder(
        ethers.Wallet.createRandom().address
      );
      expect(isHolder).to.equal(false);
    });
  });

  describe("Additional Node Management Functions", () => {
    it("Should correctly identify if a node is delegated", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer);
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Initially node should not be delegated
      expect(await nodeManagementContract.isNodeDelegated(1)).to.equal(false);

      // Delegate the node
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      // Now node should be delegated
      expect(await nodeManagementContract.isNodeDelegated(1)).to.equal(true);
    });

    it("Should correctly identify if a user is a node delegator", async function () {
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer);
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Initially owner should not be a delegator
      expect(await nodeManagementContract.isNodeDelegator(deployer.address)).to.equal(false);

      // Delegate the node
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[5].address, nodeId);
      await tx.wait();

      // Now owner should be a delegator
      expect(await nodeManagementContract.isNodeDelegator(deployer.address)).to.equal(true);

      // Other account should not be a delegator
      expect(await nodeManagementContract.isNodeDelegator(otherAccounts[5].address)).to.equal(
        false
      );
    });

    it("Should return correct direct node ownership", async function () {
      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer);

      // Owner should have node ID 1
      expect(await nodeManagementContract.getDirectNodeOwnership(deployer.address)).to.equal(1n);

      // Other account should have no node
      expect(await nodeManagementContract.getDirectNodeOwnership(otherAccount.address)).to.equal(
        0n
      );
    });

    it("Should return correct user node details for a single node", async function () {
      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Level 2 = Thunder node
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Check owner's node details before delegation
      const nodesInfo = await nodeManagementContract.getUserNodes(deployer.address);
      expect(nodesInfo.length).to.equal(1);

      const nodeInfo = nodesInfo[0];
      expect(nodeInfo.nodeId).to.equal(1n);
      expect(nodeInfo.nodeLevel).to.equal(2); // Thunder node
      expect(nodeInfo.xNodeOwner).to.equal(deployer.address);
      expect(nodeInfo.isXNodeHolder).to.equal(true);
      expect(nodeInfo.isXNodeDelegated).to.equal(false);
      expect(nodeInfo.isXNodeDelegator).to.equal(false);
      expect(nodeInfo.isXNodeDelegatee).to.equal(false);
      expect(nodeInfo.delegatee).to.equal(ethers.ZeroAddress);

      // Delegate the node
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, nodeId);
      await tx.wait();

      // Check owner's node details after delegation (should be empty array as node is delegated)
      const ownerNodesAfterDelegation = await nodeManagementContract.getUserNodes(deployer.address);
      expect(ownerNodesAfterDelegation.length).to.equal(1);
      const ownerNodesAfterDelegationInfo = ownerNodesAfterDelegation[0];
      expect(ownerNodesAfterDelegationInfo.nodeId).to.equal(1n);
      expect(ownerNodesAfterDelegationInfo.nodeLevel).to.equal(2); // Thunder node
      expect(ownerNodesAfterDelegationInfo.xNodeOwner).to.equal(deployer.address);
      expect(ownerNodesAfterDelegationInfo.isXNodeHolder).to.equal(true);
      expect(ownerNodesAfterDelegationInfo.isXNodeDelegated).to.equal(true);
      expect(ownerNodesAfterDelegationInfo.isXNodeDelegator).to.equal(true);
      expect(ownerNodesAfterDelegationInfo.isXNodeDelegatee).to.equal(false);
      expect(ownerNodesAfterDelegationInfo.delegatee).to.equal(otherAccount.address);

      // Check delegatee's node details
      const delegateeNodes = await nodeManagementContract.getUserNodes(otherAccount.address);
      expect(delegateeNodes.length).to.equal(1);

      const delegatedNodeInfo = delegateeNodes[0];
      expect(delegatedNodeInfo.nodeId).to.equal(1n);
      expect(delegatedNodeInfo.nodeLevel).to.equal(2); // Thunder node
      expect(delegatedNodeInfo.xNodeOwner).to.equal(deployer.address);
      expect(delegatedNodeInfo.isXNodeHolder).to.equal(true);
      expect(delegatedNodeInfo.isXNodeDelegated).to.equal(true);
      expect(delegatedNodeInfo.isXNodeDelegator).to.equal(false);
      expect(delegatedNodeInfo.isXNodeDelegatee).to.equal(true);
      expect(delegatedNodeInfo.delegatee).to.equal(otherAccount.address);
    });

    it("Should return correct user node details for multiple nodes", async function () {
      const otherAccount = otherAccounts[0];

      // Mock multiple node ownerships with different levels
      await createLegacyNodeHolder(2, deployer); // Thunder node
      await createLegacyNodeHolder(4, otherAccounts[1]); // Using index 1 instead of 0 for Mjolnir node
      await createLegacyNodeHolder(7, otherAccounts[2]); // Using index 2 instead of 1 for VeThor X node

      const deployerNodeId = await legacyNodesContract.ownerToId(deployer.address);
      const account1NodeId = await legacyNodesContract.ownerToId(otherAccounts[1].address);
      const account2NodeId = await legacyNodesContract.ownerToId(otherAccounts[2].address);

      // Delegate all nodes to otherAccount
      tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, deployerNodeId);
      await tx.wait();

      tx = await nodeManagementContract
        .connect(otherAccounts[1])
        .delegateNode(otherAccount.address, account1NodeId);
      await tx.wait();

      tx = await nodeManagementContract
        .connect(otherAccounts[2])
        .delegateNode(otherAccount.address, account2NodeId);
      await tx.wait();

      // Check delegatee's node details
      const delegateeNodes = await nodeManagementContract.getUserNodes(otherAccount.address);
      expect(delegateeNodes.length).to.equal(3);

      // Check first node (Thunder)
      const nodeInfo1 = delegateeNodes[0];
      expect(nodeInfo1.nodeId).to.equal(1n);
      expect(nodeInfo1.nodeLevel).to.equal(2); // Thunder node
      expect(nodeInfo1.xNodeOwner).to.equal(deployer.address);
      expect(nodeInfo1.isXNodeHolder).to.equal(true);
      expect(nodeInfo1.isXNodeDelegated).to.equal(true);
      expect(nodeInfo1.isXNodeDelegator).to.equal(false);
      expect(nodeInfo1.isXNodeDelegatee).to.equal(true);
      expect(nodeInfo1.delegatee).to.equal(otherAccount.address);

      // Check second node (Mjolnir)
      const nodeInfo2 = delegateeNodes[1];
      expect(nodeInfo2.nodeId).to.equal(2n);
      expect(nodeInfo2.nodeLevel).to.equal(4); // Mjolnir node
      expect(nodeInfo2.xNodeOwner).to.equal(otherAccounts[1].address); // Using index 1 instead of 0
      expect(nodeInfo2.isXNodeHolder).to.equal(true);
      expect(nodeInfo2.isXNodeDelegated).to.equal(true);
      expect(nodeInfo2.isXNodeDelegator).to.equal(false);
      expect(nodeInfo2.isXNodeDelegatee).to.equal(true);
      expect(nodeInfo2.delegatee).to.equal(otherAccount.address);

      // Check third node (VeThor X)
      const nodeInfo3 = delegateeNodes[2];
      expect(nodeInfo3.nodeId).to.equal(3n);
      expect(nodeInfo3.nodeLevel).to.equal(7); // VeThor X node
      expect(nodeInfo3.xNodeOwner).to.equal(otherAccounts[2].address); // Using index 2 instead of 1
      expect(nodeInfo3.isXNodeHolder).to.equal(true);
      expect(nodeInfo3.isXNodeDelegated).to.equal(true);
      expect(nodeInfo3.isXNodeDelegator).to.equal(false);
      expect(nodeInfo3.isXNodeDelegatee).to.equal(true);
      expect(nodeInfo3.delegatee).to.equal(otherAccount.address);
    });

    it("Should return empty array for user without any nodes", async function () {
      const otherAccount = otherAccounts[0];

      // Check nodes for user without any ownership or delegation
      const nodesInfo = await nodeManagementContract.getUserNodes(otherAccount.address);

      // Should return empty array
      expect(nodesInfo.length).to.equal(0);
      expect(nodesInfo).to.eql([]);
    });

    it("Should return empty array for zero address", async function () {
      // Check nodes for zero address
      await expect(
        nodeManagementContract.getUserNodes(ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(stargateNFTContract, "ERC721InvalidOwner");

      // Should return empty array
      const nodesInfo = await nodeManagementContract.getUserNodes(
        ethers.Wallet.createRandom().address
      );
      expect(nodesInfo.length).to.equal(0);
      expect(nodesInfo).to.eql([]);
    });
  });

  describe("Storage Preservation During Upgrades", () => {
    it("Should not break storage when upgrading from v1 to current version", async function () {
      const otherAccount = otherAccounts[0];

      // Deploy current version first to set up initial state
      const nodeManagementV1 = (await deployProxy("NodeManagementV1", [
        await legacyNodesContract.getAddress(),
        deployer.address,
        deployer.address,
      ])) as NodeManagementV1;

      // Set up initial state with current version
      await createLegacyNodeHolder(2, deployer);
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      // NodeManagementV1 still uses the old function signature
      tx = await nodeManagementV1.connect(deployer).delegateNode(otherAccounts[0].address);
      await tx.wait();
      // Verify initial state
      expect(compareAddresses(await nodeManagementV1.getNodeManager(nodeId), otherAccount.address))
        .to.be.true;

      // Get storage slots before upgrade
      const initialSlot = BigInt(0);
      const storageSlots = [];

      for (let i = initialSlot; i < initialSlot + BigInt(100); i++) {
        storageSlots.push(await ethers.provider.getStorage(await nodeManagementV1.getAddress(), i));
      }

      // Filter out empty slots
      const filteredSlots = storageSlots.filter(
        (slot) => slot !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

      // Deploy V1 implementation and upgrade to it
      const nodeManagement = (await upgradeProxy(
        "NodeManagementV1",
        "NodeManagementV2",
        await nodeManagementV1.getAddress(),
        [],
        {
          version: 2,
        }
      )) as NodeManagementV2;

      // Get storage slots after downgrade
      const storageSlotsAfter = [];
      for (let i = initialSlot; i < initialSlot + BigInt(100); i++) {
        storageSlotsAfter.push(
          await ethers.provider.getStorage(await nodeManagement.getAddress(), i)
        );
      }

      // Filter empty slots
      const filteredSlotsAfter = storageSlotsAfter.filter(
        (slot) => slot !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      );

      // Verify storage slots remain unchanged
      for (let i = 0; i < filteredSlots.length; i++) {
        expect(filteredSlots[i]).to.equal(filteredSlotsAfter[i]);
      }

      // Verify functionality still works
      expect(compareAddresses(await nodeManagement.getNodeManager(nodeId), otherAccount.address)).to
        .be.true;
    });
  });
});
