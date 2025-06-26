import { ethers } from "hardhat";
import { expect } from "chai";
import {
  catchRevert,
  createLegacyNodeHolder,
  filterEventsByName,
  getOrDeployContracts,
} from "../helpers";
import { describe, it } from "mocha";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { NodeManagementV1, NodeManagementV2 } from "../../typechain-types";
import { deployProxy, upgradeProxy } from "../../scripts/helpers";

describe("Node Management", function () {
  describe("Contract upgradeability", () => {
    it("Cannot initialize twice", async function () {
      const { nodeManagementContract, legacyNodesContract, deployer } = await getOrDeployContracts({
        forceDeploy: true,
      });
      await catchRevert(
        nodeManagementContract.initialize(
          await legacyNodesContract.getAddress(),
          deployer.address,
          deployer.address
        )
      );
    });

    it("User with UPGRADER_ROLE should be able to upgrade the contract", async function () {
      const { nodeManagementContract, deployer } = await getOrDeployContracts({
        forceDeploy: true,
      });

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

      await expect(
        nodeManagementContract
          .connect(deployer)
          .upgradeToAndCall(await implementation.getAddress(), "0x")
      ).to.not.be.reverted;

      const newImplAddress = await getImplementationAddress(
        ethers.provider,
        await nodeManagementContract.getAddress()
      );

      expect(newImplAddress.toUpperCase()).to.not.eql(currentImplAddress.toUpperCase());
      expect(newImplAddress.toUpperCase()).to.eql(
        (await implementation.getAddress()).toUpperCase()
      );
    });

    it("Only user with UPGRADER_ROLE should be able to upgrade the contract", async function () {
      const { nodeManagementContract, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });
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

      expect(newImplAddress.toUpperCase()).to.eql(currentImplAddress.toUpperCase());
      expect(newImplAddress.toUpperCase()).to.not.eql(
        (await implementation.getAddress()).toUpperCase()
      );
    });

    it("Should return correct version of the contract", async () => {
      const { nodeManagementContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      expect(await nodeManagementContract.version()).to.equal("3");
    });

    it("Should be no state conflicts after upgrade", async () => {
      const { deployer, otherAccounts, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });
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

      const tx = await legacyNodesContract.addToken(otherAccounts[3].address, 7, false, 0, 0); // Using index 3 instead of 2

      // Wait for the transaction to be mined
      const receipt = await tx.wait();
      if (!receipt) throw new Error("No receipt");

      // Retrieve the block where the transaction was included
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      if (!block) throw new Error("No block");

      // NodeManagementV1 still uses the old function signatures
      await nodeManagementV1.connect(deployer).delegateNode(otherAccount.address);
      await nodeManagementV1.connect(otherAccounts[1]).delegateNode(otherAccount.address);
      await nodeManagementV1.connect(otherAccounts[2]).delegateNode(otherAccount.address);

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
      const { deployer, nodeManagementContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      const initialAddress = await nodeManagementContract.getVechainNodesContract();

      await nodeManagementContract.connect(deployer).setVechainNodesContract(deployer.address);

      const updatedAddress = await nodeManagementContract.getVechainNodesContract();
      expect(updatedAddress).to.eql(deployer.address);
      expect(updatedAddress).to.not.eql(initialAddress);
    });

    it("Only Admin can set vechain nodes contract address", async function () {
      const { deployer, otherAccounts, nodeManagementContract } = await getOrDeployContracts({
        forceDeploy: true,
      });
      const otherAccount = otherAccounts[0];

      await expect(
        nodeManagementContract.connect(otherAccount).setVechainNodesContract(deployer.address)
      ).to.be.reverted;
    });
  });

  describe("Node Management Delegation", () => {
    it("Should allow node owner to delegate node", async function () {
      const { deployer, otherAccounts, nodeManagementContract, legacyNodesContract } =
        await getOrDeployContracts({
          forceDeploy: true,
        });
      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      const tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, nodeId);

      const delegatee = await nodeManagementContract.getNodeManager(nodeId);
      expect(delegatee).to.equal(otherAccount.address);

      // Check if event was emitted
      const txReceipt = await tx.wait();
      if (!txReceipt) throw new Error("No receipt");
      const nodeDelegated = filterEventsByName(txReceipt.logs, "NodeDelegated");
      expect(nodeDelegated).not.to.eql([]);
    });

    it("Should allow node owner to remove delegation", async function () {
      const { deployer, otherAccounts, nodeManagementContract, legacyNodesContract } =
        await getOrDeployContracts({
          forceDeploy: true,
        });
      const otherAccount = otherAccounts[0];
      // Mock node ownership and delegation
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccount.address, nodeId);

      const delegatee = await nodeManagementContract.getNodeManager(nodeId);
      expect(delegatee).to.equal(otherAccount.address);

      const tx = await nodeManagementContract.connect(deployer).removeNodeDelegation(nodeId);

      const newManager = await nodeManagementContract.getNodeManager(nodeId);

      // Node should no longer be delegated -> manager should be the owner
      expect(newManager).to.equal(deployer.address);

      // Check if event was emitted
      const txReceipt = await tx.wait();
      if (!txReceipt) throw new Error("No receipt");
      const nodeDelegated = filterEventsByName(txReceipt.logs, "NodeDelegated");
      expect(nodeDelegated).not.to.eql([]);
    });

    it("Should revert if non-node owner tries to delegate a node", async function () {
      const { otherAccounts, nodeManagementContract, legacyNodesContract, deployer } =
        await getOrDeployContracts({
          forceDeploy: true,
        });
      const otherAccount = otherAccounts[0];

      const nodeId = await createLegacyNodeHolder(2, deployer);

      await expect(
        nodeManagementContract.connect(otherAccount).delegateNode(deployer.address, nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementNotNodeOwner");
    });

    it("Should revert if node owner tries to delegate themselves", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node cannot be delegated to themselves
      await expect(
        nodeManagementContract.connect(deployer).delegateNode(deployer.address, nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementSelfDelegation");
    });

    it("Should revert if node is getting delegated to the zero address", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Mock node ownership and delegation
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node cannot be delegated to the zero address
      await expect(
        nodeManagementContract.connect(deployer).delegateNode(ethers.ZeroAddress, nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementZeroAddress");
    });

    it("A user can have multiple nodes delegated to them", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });
      const otherAccount = otherAccounts[0];
      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      await createLegacyNodeHolder(2, otherAccounts[1]); // Using index 1 instead of 0
      await createLegacyNodeHolder(2, otherAccounts[2]); // Using index 2 instead of 1

      const deployerNodeId = await legacyNodesContract.ownerToId(deployer.address);
      const account1NodeId = await legacyNodesContract.ownerToId(otherAccounts[1].address);
      const account2NodeId = await legacyNodesContract.ownerToId(otherAccounts[2].address);

      await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, deployerNodeId);
      await nodeManagementContract
        .connect(otherAccounts[1])
        .delegateNode(otherAccount.address, account1NodeId);
      await nodeManagementContract
        .connect(otherAccounts[2])
        .delegateNode(otherAccount.address, account2NodeId);

      // Check if all nodes are delegated to the same address
      expect(await nodeManagementContract.getNodeIds(otherAccount.address)).to.eql([1n, 2n, 3n]);

      // Check node owners are not delegated to themselves
      expect(await nodeManagementContract.getNodeIds(deployer.address)).to.eql([]);
      expect(await nodeManagementContract.getNodeIds(otherAccounts[1].address)).to.eql([]);
      expect(await nodeManagementContract.getNodeIds(otherAccounts[2].address)).to.eql([]);
    });

    it("A node owner should be able to re-delegate node", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });
      const otherAccount = otherAccounts[0];

      // Mock node ownership and delegation
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccount.address, nodeId);

      expect(
        await nodeManagementContract.getNodeManager(
          await legacyNodesContract.ownerToId(deployer.address)
        )
      ).to.equal(otherAccount.address);

      // Should be able to re-delegate the node
      const tx = await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccounts[1].address, nodeId);

      expect(
        await nodeManagementContract.getNodeManager(
          await legacyNodesContract.ownerToId(deployer.address)
        )
      ).to.equal(otherAccounts[1].address);

      // Check if two events were emitted
      const txReceipt = await tx.wait();
      if (!txReceipt) throw new Error("No receipt");

      const nodeDelegated = filterEventsByName(txReceipt.logs, "NodeDelegated");
      expect(nodeDelegated.length).to.eql(2);

      // Other account should not be the manager
      expect(await nodeManagementContract.getNodeIds(otherAccount.address)).to.eql([]);
    });

    it("Should revert if non node owner is trying to remove delegation", async function () {
      const { nodeManagementContract, otherAccounts } = await getOrDeployContracts({
        forceDeploy: true,
      });
      const otherAccount = otherAccounts[0];

      const nodeId = await createLegacyNodeHolder(2, otherAccount);
      await nodeManagementContract
        .connect(otherAccount)
        .delegateNode(otherAccounts[5].address, nodeId);

      await expect(
        nodeManagementContract.connect(otherAccounts[9]).removeNodeDelegation(nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementNotNodeOwnerOrManager");
    });

    it("Should revert if non node owner is trying to remove delegation if node is not delegated", async function () {
      const { nodeManagementContract, deployer, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so this should revert
      await expect(
        nodeManagementContract.connect(deployer).removeNodeDelegation(nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementNodeNotDelegated");
    });

    it("If a node is downgraded to level NONE, it cannot be delegated", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      const nodeId = await createLegacyNodeHolder(7, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      // Skip ahead 1 day
      await time.setNextBlockTimestamp((await time.latest()) + 86400);

      //Downgrade the node to level NONE
      await legacyNodesContract.connect(deployer).downgradeTo(nodeId, 0);
      await expect(
        nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId)
      ).to.be.revertedWithCustomError(nodeManagementContract, "NodeManagementNotNodeOwner");
    });

    it("If a node is transferred new owner can re-delegate to another account to manage", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      await createLegacyNodeHolder(7, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      // delegate the node
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Skip ahead 1 day
      await time.setNextBlockTimestamp((await time.latest()) + 86400);
      // Transfer the node to the other account
      await legacyNodesContract.connect(deployer).transfer(otherAccounts[0].address, 1);

      // Account 5 should still be the manager
      expect(await nodeManagementContract.getNodeManager(1)).to.equal(otherAccounts[5].address);

      // Should be able to re-delegate the node
      await nodeManagementContract
        .connect(otherAccounts[0])
        .delegateNode(otherAccounts[1].address, nodeId);

      // Account 1 should now be the manager
      expect(await nodeManagementContract.getNodeManager(1)).to.equal(otherAccounts[1].address);
    });

    it("If a node is transferred that was delegated new owner can remove delegation if they want to manage it", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      await createLegacyNodeHolder(7, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      // delegate the node
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Skip ahead 1 day
      await time.setNextBlockTimestamp((await time.latest()) + 86400);
      // Transfer the node to the other account
      await legacyNodesContract.connect(deployer).transfer(otherAccounts[0].address, 1);

      // Account 5 should still be the manager
      expect(await nodeManagementContract.getNodeManager(1)).to.equal(otherAccounts[5].address);

      // Should be able to remove the delegation
      await nodeManagementContract.connect(otherAccounts[0]).removeNodeDelegation(nodeId);

      // Account 0 should now be the manager
      expect(await nodeManagementContract.getNodeManager(1)).to.equal(otherAccounts[0].address);

      // Account 1 should not be the manager
      expect(await nodeManagementContract.getNodeIds(otherAccounts[1].address)).to.eql([]);
    });
  });

  describe("Node Manager Resolution and Status", () => {
    it("Should return the owner as the node manager if the node has not been delegated", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so the manager should be the owner
      const manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(deployer.address);
    });

    it("Should return the correct node manager if the node has been delegated", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[0].address, nodeId);

      // Node should be delegated at this point so the manager should be the delegatee
      const manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(otherAccounts[0].address);
    });

    it("Should return the correct node manager if the node has been re-delegated", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[0].address, nodeId);

      // Node should be delegated at this point so the manager should be the delegatee
      let manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(otherAccounts[0].address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[1].address, nodeId);

      // Node should be delegated at this point so the manager should be the delegatee
      manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(otherAccounts[1].address);
    });

    it("Should return the correct node manager if the node has been re-delegated multiple times", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // First delegation - deployer delegates to otherAccounts[1]
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[1].address, nodeId);

      // Node should be delegated at this point so the manager should be the delegatee
      let manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(otherAccounts[1].address);

      // Second delegation - deployer re-delegates to otherAccounts[2]
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[2].address, nodeId);

      // Node should now be delegated to the new delegatee
      manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(otherAccounts[2].address);

      // Third delegation - deployer re-delegates to otherAccounts[3]
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[3].address, nodeId);

      // Node should now be delegated to the third delegatee
      manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(otherAccounts[3].address);
    });

    it("Should return the correct node level", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so the level should be 2
      const nodeLevel = await nodeManagementContract.getNodeLevel(nodeId);
      expect(nodeLevel).to.equal(2);
    });

    it("Should return correct node level of a user owning a node", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so the level should be 2
      const nodeLevels = await nodeManagementContract.getUsersNodeLevels(deployer.address);
      expect(nodeLevels[0]).to.equal(2n);
    });

    it("Should return correct node level of a user managing multiple nodes", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      await createLegacyNodeHolder(4, otherAccounts[1]); // Using index 1 instead of 0
      await createLegacyNodeHolder(7, otherAccounts[2]); // Using index 2 instead of 1

      const deployerNodeId = await legacyNodesContract.ownerToId(deployer.address);
      const account1NodeId = await legacyNodesContract.ownerToId(otherAccounts[1].address);
      const account2NodeId = await legacyNodesContract.ownerToId(otherAccounts[2].address);

      await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, deployerNodeId);
      await nodeManagementContract
        .connect(otherAccounts[1])
        .delegateNode(otherAccount.address, account1NodeId);
      await nodeManagementContract
        .connect(otherAccounts[2])
        .delegateNode(otherAccount.address, account2NodeId);

      // Node should not be delegated at this point so the level should be 2
      const nodeLevels = await nodeManagementContract.getUsersNodeLevels(otherAccount.address);
      expect(nodeLevels).to.eql([2n, 4n, 7n]);
    });

    it("Should return true if a user owning a node is checked for being a node manager", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Node should not be delegated at this point so the level should be 2
      const isManager = await nodeManagementContract.isNodeManager(deployer.address, nodeId);
      expect(isManager).to.equal(true);
    });

    it("Should return true if a user with a node delegated is checked for being a node manager", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccount.address, nodeId);

      // Node should be delegated at this point so the other account should be the manager
      const isManager = await nodeManagementContract.isNodeManager(otherAccount.address, 1);
      expect(isManager).to.equal(true);
    });

    it("Should return false if a user owning a node who delegated it is checked for being a node manager", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccount.address, nodeId);

      // Node should be delegated at this point so the other account should be the manager and owner should not be
      const isManager = await nodeManagementContract.isNodeManager(deployer.address, 1);
      expect(isManager).to.equal(false);
    });

    it("Should return false if a user not owning a node is checked for being a node manager", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      const otherAccount = otherAccounts[0];
      const notNodeManager = otherAccounts[1];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccount.address, nodeId);

      const isManager = await nodeManagementContract.isNodeManager(notNodeManager.address, nodeId);
      expect(isManager).to.equal(false);
    });

    it("If a node is delegated to a user and the owner transfers the node, the same user should be the manager", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Transfer the node to the other account
      // Skip ahead 1 day to be able to transfer node
      await time.setNextBlockTimestamp((await time.latest()) + 86400);
      await legacyNodesContract.connect(deployer).transfer(otherAccounts[0].address, 1);

      const manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(otherAccounts[5].address);
    });

    it("If a node is delegated to a user and the owner transfers the node, the same user should be the manager", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Transfer the node to the other account
      // Skip ahead 1 day to be able to transfer node
      await time.setNextBlockTimestamp((await time.latest()) + 86400);
      await legacyNodesContract.connect(deployer).transfer(otherAccount.address, 1);

      const manager = await nodeManagementContract.getNodeManager(nodeId);
      expect(manager).to.equal(otherAccounts[5].address);
    });

    it("If a node is delegated and downgraded to level NONE false gets returned when check is user NODE manager", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      const otherAccount = otherAccounts[0];

      // Mock node ownership
      await createLegacyNodeHolder(7, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Skip ahead 1 day
      await time.setNextBlockTimestamp((await time.latest()) + 86400);

      //Downgrade the node to level NONE
      await legacyNodesContract.connect(deployer).downgradeTo(nodeId, 0);

      const manager = await nodeManagementContract.isNodeManager(otherAccounts[5].address, 1);
      expect(manager).to.equal(false);
    });
  });

  describe("isNodeHolder Function", () => {
    it("Should return true for a user who owns a node", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer); // Node strength level 2 corresponds (Thunder) to an endorsement score of 13

      // Check if the owner is a node holder
      const isHolder = await nodeManagementContract.isNodeHolder(deployer.address);
      expect(isHolder).to.equal(true);
    });

    it("Should return true for a user who only has delegated nodes", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership and delegation
      await createLegacyNodeHolder(2, deployer);
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Check if the delegatee is a node holder
      const isHolder = await nodeManagementContract.isNodeHolder(otherAccounts[5].address);
      expect(isHolder).to.equal(true);
    });

    it("Should return true for a user who both owns and has delegated nodes", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership for both owned and delegated nodes
      await createLegacyNodeHolder(2, deployer); // Own node
      await createLegacyNodeHolder(4, otherAccounts[0]); // Node to delegate

      // Delegate owner's node to otherAccount
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Check if the user with both owned and delegated nodes is a holder
      const isHolder = await nodeManagementContract.isNodeHolder(otherAccounts[5].address);
      expect(isHolder).to.equal(true);
    });

    it("Should return false for a user who neither owns nor has delegated nodes", async function () {
      const { otherAccounts, nodeManagementContract, legacyNodesContract } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Check if a user with no nodes is a holder
      const isHolder = await nodeManagementContract.isNodeHolder(otherAccounts[5].address);
      expect(isHolder).to.equal(false);
    });

    it("Should return false for zero address", async function () {
      const { nodeManagementContract, stargateNFTContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

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
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer);
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Initially node should not be delegated
      expect(await nodeManagementContract.isNodeDelegated(1)).to.equal(false);

      // Delegate the node
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Now node should be delegated
      expect(await nodeManagementContract.isNodeDelegated(1)).to.equal(true);
    });

    it("Should correctly identify if a user is a node delegator", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      // Mock node ownership
      await createLegacyNodeHolder(2, deployer);
      const nodeId = await legacyNodesContract.ownerToId(deployer.address);

      // Initially owner should not be a delegator
      expect(await nodeManagementContract.isNodeDelegator(deployer.address)).to.equal(false);

      // Delegate the node
      await nodeManagementContract.connect(deployer).delegateNode(otherAccounts[5].address, nodeId);

      // Now owner should be a delegator
      expect(await nodeManagementContract.isNodeDelegator(deployer.address)).to.equal(true);

      // Other account should not be a delegator
      expect(await nodeManagementContract.isNodeDelegator(otherAccounts[5].address)).to.equal(
        false
      );
    });

    it("Should return correct direct node ownership", async function () {
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

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
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

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
      await nodeManagementContract.connect(deployer).delegateNode(otherAccount.address, nodeId);

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
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: true,
        });

      const otherAccount = otherAccounts[0];

      // Mock multiple node ownerships with different levels
      await createLegacyNodeHolder(2, deployer); // Thunder node
      await createLegacyNodeHolder(4, otherAccounts[1]); // Using index 1 instead of 0 for Mjolnir node
      await createLegacyNodeHolder(7, otherAccounts[2]); // Using index 2 instead of 1 for VeThor X node

      const deployerNodeId = await legacyNodesContract.ownerToId(deployer.address);
      const account1NodeId = await legacyNodesContract.ownerToId(otherAccounts[1].address);
      const account2NodeId = await legacyNodesContract.ownerToId(otherAccounts[2].address);

      // Delegate all nodes to otherAccount
      await nodeManagementContract
        .connect(deployer)
        .delegateNode(otherAccount.address, deployerNodeId);
      await nodeManagementContract
        .connect(otherAccounts[1])
        .delegateNode(otherAccount.address, account1NodeId);
      await nodeManagementContract
        .connect(otherAccounts[2])
        .delegateNode(otherAccount.address, account2NodeId);

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
      const { otherAccounts, nodeManagementContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

      const otherAccount = otherAccounts[0];

      // Check nodes for user without any ownership or delegation
      const nodesInfo = await nodeManagementContract.getUserNodes(otherAccount.address);

      // Should return empty array
      expect(nodesInfo.length).to.equal(0);
      expect(nodesInfo).to.eql([]);
    });

    it("Should return empty array for zero address", async function () {
      const { nodeManagementContract, stargateNFTContract } = await getOrDeployContracts({
        forceDeploy: true,
      });

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
      const { deployer, nodeManagementContract, legacyNodesContract, otherAccounts } =
        await getOrDeployContracts({
          forceDeploy: false,
        });

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
      await nodeManagementV1.connect(deployer).delegateNode(otherAccounts[0].address);

      // Verify initial state
      expect(await nodeManagementV1.getNodeManager(nodeId)).to.equal(otherAccount.address);

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
      expect(await nodeManagement.getNodeManager(nodeId)).to.equal(otherAccount.address);
    });
  });
});
