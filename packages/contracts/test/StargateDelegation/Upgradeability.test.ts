import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { expect } from "chai";
import {
  deployUpgradeableWithoutInitialization,
  initializeProxy,
  upgradeProxy,
} from "../../scripts/helpers";
import {
  MyERC20,
  StargateDelegation,
  StargateDelegationV1,
  StargateDelegationV2,
  StargateNFT,
} from "../../typechain-types";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { getOrDeployContracts } from "../helpers";
import { ContractsConfig } from "@repo/config/contracts";
import { TransactionResponse } from "ethers";

describe("shard101: StargateDelegation Upgradeability", () => {
  let tx: TransactionResponse;

  describe("General upgradeability", () => {
    const config = createLocalConfig();
    let stargateNFTMockAddress: string,
      vthoTokenMockAddress: string,
      stargateDelegationProxyAddress: string,
      deployerAddress: string;
    let deployer: HardhatEthersSigner;
    let stargateDelegationContract: StargateDelegation;

    // deploy the contract without initializing
    before(async () => {
      // define fake contract addresses
      stargateNFTMockAddress = (await ethers.getSigners())[1].address;
      vthoTokenMockAddress = (await ethers.getSigners())[2].address;

      // fake admin (so it's different from deployer and does not rely on the config file)
      config.CONTRACTS_ADMIN_ADDRESS = (await ethers.getSigners())[3].address;

      // Deploy the contract
      deployer = (await ethers.getSigners())[0];
      deployerAddress = await deployer.getAddress();

      stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
        "StargateDelegation",
        {},
        false
      );

      stargateDelegationContract = (await initializeProxy(
        stargateDelegationProxyAddress,
        "StargateDelegation",
        [
          {
            upgrader: deployer.address,
            admin: config.CONTRACTS_ADMIN_ADDRESS,
            operator: config.CONTRACTS_ADMIN_ADDRESS,
            stargateNFT: stargateNFTMockAddress,
            vthoToken: vthoTokenMockAddress,
            vthoRewardPerBlock: [
              { levelId: 1, rewardPerBlock: ethers.parseEther("1") },
              { levelId: 2, rewardPerBlock: ethers.parseEther("2") },
              { levelId: 3, rewardPerBlock: ethers.parseEther("3") },
            ],
            delegationPeriod: 1000,
          },
        ],
        {}
      )) as StargateDelegation;
    });

    it("Upgrader can correctly upgrade contract", async () => {
      const UPGRADER_ROLE = await stargateDelegationContract.UPGRADER_ROLE();
      expect(await stargateDelegationContract.hasRole(UPGRADER_ROLE, deployer.address)).to.eql(
        true
      );

      const currentImplementationAddress = await getImplementationAddress(
        ethers.provider,
        await stargateDelegationContract.getAddress()
      );

      // Deploy the implementation contract
      const Contract = await ethers.getContractFactory("StargateDelegation");
      const v2Implementation = await Contract.deploy();
      await v2Implementation.waitForDeployment();

      // upgrader can upgrade the implementation address
      await expect(
        stargateDelegationContract
          .connect(deployer)
          .upgradeToAndCall(await v2Implementation.getAddress(), "0x")
      ).to.not.be.reverted;

      const newImplAddress = await getImplementationAddress(
        ethers.provider,
        await stargateDelegationContract.getAddress()
      );

      expect(newImplAddress.toUpperCase()).to.not.eql(currentImplementationAddress.toUpperCase());
      expect(newImplAddress.toUpperCase()).to.eql(
        (await v2Implementation.getAddress()).toUpperCase()
      );
    });

    it("Only upgrader can upgrade contract", async () => {
      const maliciousUser = (await ethers.getSigners())[5];

      // Deploy the implementation contract
      const Contract = await ethers.getContractFactory("StargateDelegation");
      const maliciousImplementation = await Contract.deploy();
      await maliciousImplementation.waitForDeployment();

      const UPGRADER_ROLE = await stargateDelegationContract.UPGRADER_ROLE();
      expect(await stargateDelegationContract.hasRole(UPGRADER_ROLE, maliciousUser.address)).to.eql(
        false
      );

      await expect(
        stargateDelegationContract
          .connect(maliciousUser)
          .upgradeToAndCall(await maliciousImplementation.getAddress(), "0x")
      ).to.be.reverted;

      const currentImplementationAddress = await getImplementationAddress(
        ethers.provider,
        await stargateDelegationContract.getAddress()
      );

      expect(currentImplementationAddress.toUpperCase()).to.not.eql(
        (await maliciousImplementation.getAddress()).toUpperCase()
      );
    });
  });

  describe("Upgrade states preservation", () => {
    let signers: HardhatEthersSigner[];
    let owner: HardhatEthersSigner, admin: HardhatEthersSigner, operator: HardhatEthersSigner;
    let mockStargateNFTAddress: string, mockVTHOAddress: string;
    let stargateNFT: StargateNFT;
    let vthoMockContract: MyERC20;
    let config: ContractsConfig;

    // Helper function to capture storage state
    const captureStorageState = async (contractAddress: string): Promise<string[]> => {
      const slots = [];
      const initialSlot = BigInt(
        "0x1f4ebdcee447b4955d797076b2bbe9eaa6ae7665ae386dd37cbd5682712f9100"
      );

      for (let i = initialSlot; i < initialSlot + BigInt(100); i++) {
        slots.push(await ethers.provider.getStorage(contractAddress, i));
      }

      return slots.filter(
        (slot) => slot !== "0x0000000000000000000000000000000000000000000000000000000000000000"
      );
    };

    // Helper function to compare storage states
    const compareStorageStates = (before: string[], after: string[], testName: string) => {
      expect(before.length).to.equal(after.length, `Storage slot count mismatch in ${testName}`);
      for (let i = 0; i < before.length; i++) {
        expect(before[i]).to.equal(after[i], `Storage slot ${i} mismatch in ${testName}`);
      }
    };

    before(async () => {
      config = createLocalConfig();
      signers = await ethers.getSigners();
      [owner, admin, operator] = signers;

      // Use simple mock addresses for contracts
      mockStargateNFTAddress = signers[4].address;
      mockVTHOAddress = signers[5].address;

      const { stargateNFTContract, mockedVthoToken } = await getOrDeployContracts({
        forceDeploy: true,
        config,
      });

      stargateNFT = stargateNFTContract;
      vthoMockContract = mockedVthoToken;
    });

    it("No state conflict when upgrading from V1 to V2", async () => {
      // Deploy StargateDelegationV1
      const stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
        "StargateDelegationV1",
        {},
        false
      );

      const stargateDelegationV1 = (await initializeProxy(
        stargateDelegationProxyAddress,
        "StargateDelegationV1",
        [
          {
            upgrader: owner.address,
            admin: owner.address,
            stargateNFT: await stargateNFT.getAddress(),
            vthoToken: await vthoMockContract.getAddress(),
            vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
            delegationPeriod: config.DELEGATION_PERIOD_DURATION, // 10 blocks
            operator: operator.address,
          },
        ],
        {}
      )) as StargateDelegationV1;

      // Verify V1 deployment
      expect(await stargateDelegationV1.version()).to.equal(1);

      // Check initial configuration
      expect(await stargateDelegationV1.getDelegationPeriod()).to.equal(
        config.DELEGATION_PERIOD_DURATION
      );
      expect(await stargateDelegationV1.getVthoRewardPerBlock(1)).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[0].rewardPerBlock
      );
      expect(await stargateDelegationV1.getVthoRewardPerBlock(2)).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[1].rewardPerBlock
      );
      expect(await stargateDelegationV1.getVthoRewardPerBlock(3)).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[2].rewardPerBlock
      );

      // Set some additional configuration to create more storage state
      tx = await stargateDelegationV1
        .connect(operator)
        .setVthoRewardPerBlockForLevel(
          4,
          config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[3].rewardPerBlock
        );
      await tx.wait();
      tx = await stargateDelegationV1
        .connect(operator)
        .setVthoRewardPerBlockForLevel(
          5,
          config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[4].rewardPerBlock
        );
      await tx.wait();
      const currentBlock = await ethers.provider.getBlockNumber();
      tx = await stargateDelegationV1
        .connect(operator)
        .setRewardsAccumulationEndBlock(currentBlock + 2000);
      await tx.wait();
      // Capture initial state
      const initialDelegationPeriod = await stargateDelegationV1.getDelegationPeriod();
      const initialRewardLevel1 = await stargateDelegationV1.getVthoRewardPerBlock(1);
      const initialRewardLevel2 = await stargateDelegationV1.getVthoRewardPerBlock(2);
      const initialRewardLevel3 = await stargateDelegationV1.getVthoRewardPerBlock(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[2].levelId
      );
      const initialRewardLevel4 = await stargateDelegationV1.getVthoRewardPerBlock(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[3].levelId
      );
      const initialRewardLevel5 = await stargateDelegationV1.getVthoRewardPerBlock(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[4].levelId
      );
      const initialRewardsAccumulationEndBlock =
        await stargateDelegationV1.getRewardsAccumulationEndBlock();
      const initialStargateNFTAddress = await stargateDelegationV1.getStargateNFTContract();
      const initialVthoTokenAddress = await stargateDelegationV1.getVthoToken();

      // Capture storage state before upgrade
      const storageBeforeUpgrade = await captureStorageState(
        await stargateDelegationV1.getAddress()
      );

      // Upgrade from V1 to V2
      const stargateDelegationV2 = (await upgradeProxy(
        "StargateDelegationV1",
        "StargateDelegationV2",
        await stargateDelegationV1.getAddress()
      )) as StargateDelegationV2;

      // Capture storage state after upgrade
      const storageAfterUpgrade = await captureStorageState(
        await stargateDelegationV2.getAddress()
      );

      // Verify storage integrity
      compareStorageStates(storageBeforeUpgrade, storageAfterUpgrade, "V1 to V2 upgrade");

      // Verify upgrade was successful
      expect(await stargateDelegationV2.version()).to.equal(2);

      // Verify all state is preserved after upgrade
      expect(await stargateDelegationV2.getDelegationPeriod()).to.equal(initialDelegationPeriod);
      expect(await stargateDelegationV2.getVthoRewardPerBlock(1)).to.equal(initialRewardLevel1);
      expect(await stargateDelegationV2.getVthoRewardPerBlock(2)).to.equal(initialRewardLevel2);
      expect(await stargateDelegationV2.getVthoRewardPerBlock(3)).to.equal(initialRewardLevel3);
      expect(await stargateDelegationV2.getVthoRewardPerBlock(4)).to.equal(initialRewardLevel4);
      expect(await stargateDelegationV2.getVthoRewardPerBlock(5)).to.equal(initialRewardLevel5);
      expect(await stargateDelegationV2.getRewardsAccumulationEndBlock()).to.equal(
        initialRewardsAccumulationEndBlock
      );
      expect(await stargateDelegationV2.getStargateNFTContract()).to.equal(
        initialStargateNFTAddress
      );
      expect(await stargateDelegationV2.getVthoToken()).to.equal(initialVthoTokenAddress);

      // Test that new V2 functionality is available (calculateLastCompletedPeriodEndBlock)
      // The calculateLastCompletedPeriodEndBlock function should exist and return a value (not revert)
      const latestTokenIdMinted = await stargateNFT.getCurrentTokenId();
      const result = await stargateDelegationV2.calculateLastCompletedPeriodEndBlock(
        latestTokenIdMinted
      );
      expect(result).to.be.a("bigint");

      // Test that functions that should revert still do (using currentDelegationPeriodEndBlock)
      await expect(
        stargateDelegationV2.currentDelegationPeriodEndBlock(999999)
      ).to.be.revertedWithCustomError(stargateDelegationV2, "NFTNotDelegated");

      // Test admin functions still work after upgrade
      tx = await stargateDelegationV2
        .connect(operator)
        .setVthoRewardPerBlockForLevel(
          6,
          config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[5].rewardPerBlock
        );
      await tx.wait();
      expect(await stargateDelegationV2.getVthoRewardPerBlock(6)).to.equal(
        config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL[5].rewardPerBlock
      );

      // Test setting rewards accumulation end block still works
      const newCurrentBlock = await ethers.provider.getBlockNumber();
      tx = await stargateDelegationV2
        .connect(operator)
        .setRewardsAccumulationEndBlock(newCurrentBlock + 3000);
      await tx.wait();
      expect(await stargateDelegationV2.getRewardsAccumulationEndBlock()).to.equal(
        newCurrentBlock + 3000
      );

      // Test role-based access control is preserved
      const OPERATOR_ROLE = await stargateDelegationV2.OPERATOR_ROLE();
      const UPGRADER_ROLE = await stargateDelegationV2.UPGRADER_ROLE();

      expect(await stargateDelegationV2.hasRole(OPERATOR_ROLE, operator.address)).to.be.true;
      expect(await stargateDelegationV2.hasRole(UPGRADER_ROLE, owner.address)).to.be.true;
      expect(await stargateDelegationV2.hasRole(OPERATOR_ROLE, signers[6].address)).to.be.false;
    });
  });
});
