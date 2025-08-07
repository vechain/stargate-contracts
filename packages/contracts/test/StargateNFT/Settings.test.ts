import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { expect } from "chai";
import { StargateNFT, Errors } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { getOrDeployContracts, getStargateNFTErrorsInterface } from "../helpers";
import { TokenLevelId } from "@repo/config/contracts/StargateNFT";
import { TransactionResponse } from "ethers";
import { compareAddresses } from "@repo/utils/AddressUtils";

describe("shard4: StargateNFT Settings", () => {
  const config = createLocalConfig();

  let deployer: HardhatEthersSigner,
    maliciousUser: HardhatEthersSigner,
    whitelisterUser: HardhatEthersSigner;

  let roleDefaultAdmin: string, roleManager: string, roleWhitelister: string;

  let stargateNFTContract: StargateNFT;
  let errorsInterface: Errors;
  let tx: TransactionResponse;

  beforeEach(async () => {
    deployer = (await ethers.getSigners())[0];
    config.CONTRACTS_ADMIN_ADDRESS = deployer.address;

    maliciousUser = (await ethers.getSigners())[4];

    const { stargateNFTContract: deployedStargateNFTContract } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    stargateNFTContract = deployedStargateNFTContract;

    roleDefaultAdmin = await stargateNFTContract.DEFAULT_ADMIN_ROLE();
    roleManager = await stargateNFTContract.MANAGER_ROLE();
    roleWhitelister = await stargateNFTContract.WHITELISTER_ROLE();

    // whitelister user
    whitelisterUser = (await ethers.getSigners())[5];
    tx = await stargateNFTContract
      .connect(deployer)
      .grantRole(roleWhitelister, await whitelisterUser.getAddress());
    await tx.wait();
    errorsInterface = await getStargateNFTErrorsInterface();
  });

  it("Admins with DEFAULT_ADMIN_ROLE can update contract addresses", async () => {
    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, deployer.address)).to.be.true;

    const currentStargateDelegationAddress = await stargateNFTContract.stargateDelegation();
    const currentLegacyNodesAddress = await stargateNFTContract.legacyNodes();
    const currentVthoTokenAddress = await stargateNFTContract.vthoToken();

    await expect(stargateNFTContract.connect(deployer).setStargateDelegation(deployer.address))
      .to.emit(stargateNFTContract, "ContractAddressUpdated")
      .withArgs(currentStargateDelegationAddress, deployer.address, "stargateDelegation");

    await expect(stargateNFTContract.connect(deployer).setVthoToken(deployer.address))
      .to.emit(stargateNFTContract, "ContractAddressUpdated")
      .withArgs(currentVthoTokenAddress, deployer.address, "vthoToken");

    await expect(stargateNFTContract.connect(deployer).setLegacyNodes(deployer.address))
      .to.emit(stargateNFTContract, "ContractAddressUpdated")
      .withArgs(currentLegacyNodesAddress, deployer.address, "legacyNodes");

    const updatedStargateDelegationAddress = await stargateNFTContract.stargateDelegation();
    const updatedLegacyNodesAddress = await stargateNFTContract.legacyNodes();
    const updatedVthoTokenAddress = await stargateNFTContract.vthoToken();

    expect(compareAddresses(updatedStargateDelegationAddress, deployer.address)).to.be.true;
    expect(compareAddresses(updatedLegacyNodesAddress, deployer.address)).to.be.true;
    expect(compareAddresses(updatedVthoTokenAddress, deployer.address)).to.be.true;
  });

  it("Users without DEFAULT_ADMIN_ROLE cannot update contract addresses", async () => {
    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, maliciousUser.address)).to.be.false;

    await expect(stargateNFTContract.connect(maliciousUser).setStargateDelegation(deployer.address))
      .to.be.reverted;

    await expect(stargateNFTContract.connect(maliciousUser).setVthoToken(deployer.address)).to.be
      .reverted;

    await expect(stargateNFTContract.connect(maliciousUser).setLegacyNodes(deployer.address)).to.be
      .reverted;
  });

  it("Admins cannot set contract addresses to the zero address", async () => {
    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, deployer.address)).to.be.true;

    await expect(stargateNFTContract.connect(deployer).setStargateDelegation(ethers.ZeroAddress)).to
      .be.reverted;

    await expect(stargateNFTContract.connect(deployer).setVthoToken(ethers.ZeroAddress)).to.be
      .reverted;

    await expect(stargateNFTContract.connect(deployer).setLegacyNodes(ethers.ZeroAddress)).to.be
      .reverted;
  });

  it("Admins with MANAGER_ROLE can update the base token URI", async () => {
    tx = await stargateNFTContract.connect(deployer).grantRole(roleManager, deployer.address);
    await tx.wait();

    expect(await stargateNFTContract.hasRole(roleManager, deployer.address)).to.be.true;

    const currentBaseTokenURI = await stargateNFTContract.baseURI();

    await expect(stargateNFTContract.connect(deployer).setBaseURI("new-base-uri"))
      .to.emit(stargateNFTContract, "BaseURIUpdated")
      .withArgs(currentBaseTokenURI, "new-base-uri");

    const updatedBaseTokenURI = await stargateNFTContract.baseURI();
    expect(updatedBaseTokenURI).to.equal("new-base-uri");
  });

  it("Users without MANAGER_ROLE cannot update the base token URI", async () => {
    expect(await stargateNFTContract.hasRole(roleManager, maliciousUser.address)).to.be.false;

    await expect(stargateNFTContract.connect(maliciousUser).setBaseURI("new-base-uri")).to.be
      .reverted;
  });

  it("Admins cannot update the VTHO generation end timestamp if the contract is not paused", async () => {
    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, deployer.address)).to.be.true;

    await expect(stargateNFTContract.connect(deployer).setVthoGenerationEndTimestamp(1718000000)).to
      .be.reverted;
  });

  it("Admins with DEFAULT_ADMIN_ROLE can update the VTHO generation end timestamp", async () => {
    tx = await stargateNFTContract.connect(deployer).pause();
    await tx.wait();

    const currentVthoGenerationEndTimestamp =
      await stargateNFTContract.vthoGenerationEndTimestamp();

    await expect(stargateNFTContract.connect(deployer).setVthoGenerationEndTimestamp(1718000000))
      .to.emit(stargateNFTContract, "VthoGenerationEndTimestampSet")
      .withArgs(currentVthoGenerationEndTimestamp, 1718000000);

    const updatedVthoGenerationEndTimestamp =
      await stargateNFTContract.vthoGenerationEndTimestamp();
    expect(updatedVthoGenerationEndTimestamp).to.equal(1718000000);

    tx = await stargateNFTContract.connect(deployer).unpause();
    await tx.wait();
  });

  it("Users without DEFAULT_ADMIN_ROLE cannot update the VTHO generation end timestamp", async () => {
    tx = await stargateNFTContract.connect(deployer).pause();
    await tx.wait();

    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, maliciousUser.address)).to.be.false;

    await expect(
      stargateNFTContract.connect(maliciousUser).setVthoGenerationEndTimestamp(1718000000)
    ).to.be.reverted;

    tx = await stargateNFTContract.connect(deployer).unpause();
    await tx.wait();
  });

  it("should allow admins with WHITELISTER_ROLE to add and remove whitelist entries", async () => {
    const userToBeWhitelisted = (await ethers.getSigners())[8];
    const whitelistedUserAddress = await userToBeWhitelisted.getAddress();

    // Assert admin has WHITELISTER_ROLE
    expect(await stargateNFTContract.hasRole(roleWhitelister, whitelisterUser.address)).to.be.true;

    // Assert user is not whitelisted
    const whitelistEntry = await stargateNFTContract.getWhitelistEntry(whitelistedUserAddress);
    expect(whitelistEntry.tokenId).to.equal(0);
    expect(whitelistEntry.levelId).to.equal(0);

    // Add whitelist entry
    const whitelistedTokenId = 46;
    const whitelistedLevelId = TokenLevelId.Mjolnir;
    await expect(
      stargateNFTContract
        .connect(whitelisterUser)
        .addWhitelistEntry(whitelistedUserAddress, whitelistedTokenId, whitelistedLevelId)
    )
      .to.emit(stargateNFTContract, "WhitelistEntryAdded")
      .withArgs(whitelistedUserAddress, whitelistedTokenId, whitelistedLevelId);

    // Assert user is whitelisted
    const whitelistEntryAfter = await stargateNFTContract.getWhitelistEntry(whitelistedUserAddress);
    expect(whitelistEntryAfter.tokenId).to.equal(whitelistedTokenId);
    expect(whitelistEntryAfter.levelId).to.equal(whitelistedLevelId);

    // Remove whitelist entry
    await expect(
      stargateNFTContract.connect(whitelisterUser).removeWhitelistEntry(whitelistedUserAddress)
    )
      .to.emit(stargateNFTContract, "WhitelistEntryRemoved")
      .withArgs(whitelistedUserAddress);

    // Assert user is not whitelisted
    const whitelistEntryAfterRemove = await stargateNFTContract.getWhitelistEntry(
      whitelistedUserAddress
    );
    expect(whitelistEntryAfterRemove.tokenId).to.equal(0);
    expect(whitelistEntryAfterRemove.levelId).to.equal(0);
  });

  it("should revert if non admin tries to add whitelist entry", async () => {
    // Random user with no WHITELISTER_ROLE
    const randomUser = (await ethers.getSigners())[6];
    const randomUserAddress = await randomUser.getAddress();

    // Assert that random user does not have WHITELISTER_ROLE
    expect(await stargateNFTContract.hasRole(roleWhitelister, randomUserAddress)).to.be.false;

    // Prep whitelist entry - random user will attempt to whitelist their address
    const whitelistedTokenId = 3;
    const whitelistedLevelId = TokenLevelId.VeThorX;

    // Assert user is not whitelisted
    const whitelistEntry = await stargateNFTContract.getWhitelistEntry(randomUserAddress);
    expect(whitelistEntry.tokenId).to.equal(0);
    expect(whitelistEntry.levelId).to.equal(0);

    // Assert that tx reverts when non admin tries to add whitelist entry
    await expect(
      stargateNFTContract
        .connect(randomUser)
        .addWhitelistEntry(randomUserAddress, whitelistedTokenId, whitelistedLevelId)
    ).to.be.reverted;

    // Assert that user is still not whitelisted
    const whitelistEntryAfter = await stargateNFTContract.getWhitelistEntry(randomUserAddress);
    expect(whitelistEntryAfter.tokenId).to.equal(0);
    expect(whitelistEntryAfter.levelId).to.equal(0);
  });

  it("should revert when providing invalid parameters to addWhitelistEntry", async () => {
    // Assert admin has WHITELISTER_ROLE
    expect(await stargateNFTContract.hasRole(roleWhitelister, whitelisterUser.address)).to.be.true;

    // Tx reverts when address is the zero address
    await expect(
      stargateNFTContract
        .connect(whitelisterUser)
        .addWhitelistEntry(ethers.ZeroAddress, 1, TokenLevelId.VeThorX)
    ).to.be.reverted;

    // Tx reverts when providing tokenId zero
    await expect(
      stargateNFTContract
        .connect(whitelisterUser)
        .addWhitelistEntry(deployer.address, 0, TokenLevelId.VeThorX)
    ).to.be.reverted;

    // Tx reverts when providing levelId zero
    await expect(
      stargateNFTContract.connect(whitelisterUser).addWhitelistEntry(deployer.address, 1, 0)
    ).to.be.reverted;

    // Tx reverts when providing tokenId equal to (or greater than) currentTokenId
    const currentTokenId = await stargateNFTContract.getCurrentTokenId();
    await expect(
      stargateNFTContract
        .connect(whitelisterUser)
        .addWhitelistEntry(deployer.address, currentTokenId, TokenLevelId.VeThorX)
    ).to.be.reverted;

    // Tx reverts when providing levelId greater than MAX_LEVEL_ID
    const levelIds = await stargateNFTContract.getLevelIds();
    const maxLevelId = levelIds[levelIds.length - 1];
    await expect(
      stargateNFTContract
        .connect(whitelisterUser)
        .addWhitelistEntry(deployer.address, 1, maxLevelId + 1n)
    ).to.be.reverted;
  });

  it("should be able to overwrite already whitelisted addresses and related data", async () => {
    // Assert admin has WHITELISTER_ROLE
    expect(await stargateNFTContract.hasRole(roleWhitelister, whitelisterUser.address)).to.be.true;

    // Prep whitelist entry
    const userToBeWhitelisted = (await ethers.getSigners())[13];
    const whitelistedUserAddress = await userToBeWhitelisted.getAddress();
    const whitelistedTokenId = 20;
    const whitelistedLevelId = TokenLevelId.Dawn;

    // Assert user is not whitelisted
    const whitelistEntry = await stargateNFTContract.getWhitelistEntry(whitelistedUserAddress);
    expect(whitelistEntry.tokenId).to.equal(0);
    expect(whitelistEntry.levelId).to.equal(0);

    // Add whitelist entry
    tx = await stargateNFTContract
      .connect(whitelisterUser)
      .addWhitelistEntry(whitelistedUserAddress, whitelistedTokenId, whitelistedLevelId);
    await tx.wait();

    // Assert user is whitelisted
    const whitelistEntryAfter = await stargateNFTContract.getWhitelistEntry(whitelistedUserAddress);
    expect(whitelistEntryAfter.tokenId).to.equal(whitelistedTokenId);
    expect(whitelistEntryAfter.levelId).to.equal(whitelistedLevelId);

    // Overwrite whitelist entry
    const newLevelId = TokenLevelId.Mjolnir;
    tx = await stargateNFTContract
      .connect(whitelisterUser)
      .addWhitelistEntry(whitelistedUserAddress, whitelistedTokenId, newLevelId);
    await tx.wait();

    // Assert user is whitelisted with new levelId
    const whitelistEntryAfterOverwrite = await stargateNFTContract.getWhitelistEntry(
      whitelistedUserAddress
    );
    expect(whitelistEntryAfterOverwrite.tokenId).to.equal(whitelistedTokenId);
    expect(whitelistEntryAfterOverwrite.levelId).to.equal(newLevelId);
  });

  it("should revert if non admin tries to remove whitelist entry", async () => {
    // Random user with no WHITELISTER_ROLE
    const randomUser = (await ethers.getSigners())[6];
    const randomUserAddress = await randomUser.getAddress();

    // Assert that random user does not have WHITELISTER_ROLE
    expect(await stargateNFTContract.hasRole(roleWhitelister, randomUserAddress)).to.be.false;

    // Try to remove themselves
    await expect(stargateNFTContract.connect(randomUser).removeWhitelistEntry(randomUserAddress)).to
      .be.reverted;
  });

  it("should revert when providing invalid parameters to removeWhitelistEntry", async () => {
    // Assert admin has WHITELISTER_ROLE
    expect(await stargateNFTContract.hasRole(roleWhitelister, whitelisterUser.address)).to.be.true;

    // Assert that tx reverts when address is the zero address
    await expect(
      stargateNFTContract.connect(whitelisterUser).removeWhitelistEntry(ethers.ZeroAddress)
    ).to.be.reverted;
  });

  it("should revert when removing a whitelist entry that does not exist", async () => {
    // Assert admin has WHITELISTER_ROLE
    expect(await stargateNFTContract.hasRole(roleWhitelister, whitelisterUser.address)).to.be.true;

    // Assert that tx reverts when removing a whitelist entry that does not exist
    await expect(
      stargateNFTContract.connect(whitelisterUser).removeWhitelistEntry(deployer.address)
    ).to.be.reverted;
  });
});
