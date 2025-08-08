import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getStargateNFTErrorsInterface, mineBlocks } from "../helpers/common";
import { ethers } from "hardhat";
import { createLegacyNodeHolder } from "../helpers";
import { StargateDelegation, StargateNFT } from "../../typechain-types";
import { TransactionResponse } from "ethers";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("shard8: StargateNFT Stake and Delegate", () => {
  let tx: TransactionResponse;
  let stargateDelegationContract: StargateDelegation;
  let stargateNFTContract: StargateNFT;
  let deployer: HardhatEthersSigner;
  let otherAccounts: HardhatEthersSigner[];

  beforeEach(async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 10; // 10 blocks
    config.TOKEN_LEVELS[0].level.maturityBlocks = 0; // No maturity period for simplicity
    config.TOKEN_LEVELS[0].level.vetAmountRequiredToStake = ethers.parseEther("1");
    const contracts = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });
    stargateDelegationContract = contracts.stargateDelegationContract;
    stargateNFTContract = contracts.stargateNFTContract;
    deployer = contracts.deployer;
    otherAccounts = contracts.otherAccounts;
  });

  it("user can delegate directly from the StargateNFT contract", async () => {
    // Mint an NFT to the deployer and delegate it with auto renew
    tx = await stargateNFTContract.stakeAndDelegate(1, true, {
      value: ethers.parseEther("1"),
    });
    await tx.wait();
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // Check that the NFT is delegated
    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.true;

    // Check that the NFT is accumulating rewards
    await mineBlocks(3);
    expect(await stargateDelegationContract.accumulatedRewards(tokenId)).to.not.equal(0);

    // Check that the NFT is not transferable
    expect(await stargateNFTContract.canTransfer(tokenId)).to.be.false;

    // Try to transfer the NFT, expect to be reverted
    await expect(
      stargateNFTContract
        .connect(deployer)
        .transferFrom(await deployer.getAddress(), otherAccounts[0].address, tokenId)
    ).to.be.revertedWithCustomError(stargateNFTContract, "TokenLocked");

    // check that auto renew is on
    expect(await stargateDelegationContract.getDelegationEndBlock(tokenId)).to.equal(
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") // infinity
    );
  });

  it("user can migrate and delegate directly from the StargateNFT contract", async () => {
    const lvId = 1;

    const user = deployer;

    const legacyNodeId = await createLegacyNodeHolder(lvId, user);
    await mineBlocks(1); // wait 1 block to ensure the legacy node is created

    // Mint an NFT to the deployer
    tx = await stargateNFTContract.migrateAndDelegate(legacyNodeId, true, {
      value: ethers.parseEther("1"),
      gasLimit: 10_000_000,
    });
    await tx.wait();

    // Check that the NFT is delegated
    expect(await stargateDelegationContract.isDelegationActive(legacyNodeId)).to.be.true;

    // Check that the NFT is accumulating rewards
    await mineBlocks(3);
    expect(await stargateDelegationContract.accumulatedRewards(legacyNodeId)).to.not.equal(0);

    // Check that the NFT is not transferable
    expect(await stargateNFTContract.canTransfer(legacyNodeId)).to.be.false;

    // Try to transfer the NFT, expect to be reverted
    await expect(
      stargateNFTContract
        .connect(deployer)
        .transferFrom(await deployer.getAddress(), otherAccounts[0].address, legacyNodeId)
    ).to.be.revertedWithCustomError(stargateNFTContract, "TokenLocked");

    // check that auto renew is on
    expect(await stargateDelegationContract.getDelegationEndBlock(legacyNodeId)).to.equal(
      BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff") // infinity
    );
  });

  it("only user and stargateNFT contract can delegate", async () => {
    const user = otherAccounts[0];
    const randomAddress = otherAccounts[1];

    await stargateNFTContract.connect(user).stake(1, {
      value: ethers.parseEther("1"),
    });

    const tokenId = Number(await stargateNFTContract.getCurrentTokenId());

    // let's check that the user is the owner of the NFT
    expect(await stargateNFTContract.ownerOf(tokenId)).to.equal(user.address);

    // This nft should be delegatable only by the user now that it's minted
    await expect(stargateDelegationContract.connect(randomAddress).delegate(tokenId, true)).to.be
      .revertedWithCustomError(stargateDelegationContract, "UnauthorizedUser");
  });

  it("User can stake and delegate, then exit delegation then delegate again", async () => {
    const tokenId = Number(await stargateNFTContract.getCurrentTokenId()) + 1;
    const levelId = 1;

    await stargateNFTContract.stakeAndDelegate(levelId, true, {
      value: ethers.parseEther("1"),
    });

    await mineBlocks(10);

    await stargateDelegationContract.requestDelegationExit(tokenId);

    const delegationEndBlock = await stargateDelegationContract.getDelegationEndBlock(tokenId);
    const currentBlock = await stargateDelegationContract.clock();

    await mineBlocks(Number(delegationEndBlock) - Number(currentBlock));

    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.false;

    // Not only delegation should work, but pending rewards should be claimed as well
    await expect(stargateDelegationContract.delegate(tokenId, true)).to.emit(
      stargateDelegationContract,
      "DelegationRewardsClaimed"
    );

    expect(await stargateDelegationContract.isDelegationActive(tokenId)).to.be.true;
  });

  it("Staking should revert if the owner changed during the stake process", async () => {
    // Deploy the mock contract that will transfer the NFT to the owner
    const StakeUtilityFactory = await ethers.getContractFactory("StakeUtility");
    const StakeUtility = await StakeUtilityFactory.deploy(stargateNFTContract.target);
    await StakeUtility.waitForDeployment();

    // Call the execute function of the mock contract to stakeAndDelegate
    // This should revert because the owner changes during the process
    await expect(
      StakeUtility.stakeAndDelegate(1, {
        value: ethers.parseEther("1"),
      })
    ).to.be.revertedWithCustomError(await getStargateNFTErrorsInterface(), "NotOwner");
  });
});
