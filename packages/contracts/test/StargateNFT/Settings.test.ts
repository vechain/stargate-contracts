import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { expect } from "chai";
import { StargateNFT } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { getOrDeployContracts, getStargateNFTErrorsInterface } from "../helpers";

describe("StargateNFT: settings", () => {
  const config = createLocalConfig();

  let deployer: HardhatEthersSigner, maliciousUser: HardhatEthersSigner;

  let stargateNFTContract: StargateNFT;

  before(async () => {
    deployer = (await ethers.getSigners())[0];
    config.CONTRACTS_ADMIN_ADDRESS = deployer.address;

    maliciousUser = (await ethers.getSigners())[4];

    const { stargateNFTContract: deployedStargateNFTContract } = await getOrDeployContracts({
      forceDeploy: true,
      config,
    });

    stargateNFTContract = deployedStargateNFTContract;
  });

  it("Admins with DEFAULT_ADMIN_ROLE can update contract addresses", async () => {
    expect(
      await stargateNFTContract.hasRole(
        await stargateNFTContract.DEFAULT_ADMIN_ROLE(),
        deployer.address
      )
    ).to.be.true;

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

    expect(updatedStargateDelegationAddress).to.equal(deployer.address);
    expect(updatedLegacyNodesAddress).to.equal(deployer.address);
    expect(updatedVthoTokenAddress).to.equal(deployer.address);
  });

  it("Users without DEFAULT_ADMIN_ROLE cannot update contract addresses", async () => {
    await expect(
      stargateNFTContract.connect(maliciousUser).setStargateDelegation(deployer.address)
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");

    await expect(
      stargateNFTContract.connect(maliciousUser).setVthoToken(deployer.address)
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");

    await expect(
      stargateNFTContract.connect(maliciousUser).setLegacyNodes(deployer.address)
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");
  });

  it("Contract addresses cannot be set to the zero address", async () => {
    const errorsInterface = await getStargateNFTErrorsInterface();
    await expect(
      stargateNFTContract.connect(deployer).setStargateDelegation(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(errorsInterface, "AddressCannotBeZero");

    await expect(
      stargateNFTContract.connect(deployer).setVthoToken(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(errorsInterface, "AddressCannotBeZero");

    await expect(
      stargateNFTContract.connect(deployer).setLegacyNodes(ethers.ZeroAddress)
    ).to.be.revertedWithCustomError(errorsInterface, "AddressCannotBeZero");
  });

  it("Admins with MANAGER_ROLE can update the base token URI", async () => {
    await stargateNFTContract
      .connect(deployer)
      .grantRole(await stargateNFTContract.MANAGER_ROLE(), deployer.address);

    expect(
      await stargateNFTContract.hasRole(await stargateNFTContract.MANAGER_ROLE(), deployer.address)
    ).to.be.true;

    const currentBaseTokenURI = await stargateNFTContract.baseURI();

    await expect(stargateNFTContract.connect(deployer).setBaseURI("new-base-uri"))
      .to.emit(stargateNFTContract, "BaseURIUpdated")
      .withArgs(currentBaseTokenURI, "new-base-uri");

    const updatedBaseTokenURI = await stargateNFTContract.baseURI();
    expect(updatedBaseTokenURI).to.equal("new-base-uri");
  });

  it("Users without MANAGER_ROLE cannot update the base token URI", async () => {
    expect(
      await stargateNFTContract.hasRole(
        await stargateNFTContract.MANAGER_ROLE(),
        maliciousUser.address
      )
    ).to.be.false;

    await expect(
      stargateNFTContract.connect(maliciousUser).setBaseURI("new-base-uri")
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");
  });

  it("Cannot update the VTHO generation end timestamp if the contract is not paused", async () => {
    await expect(
      stargateNFTContract.connect(deployer).setVthoGenerationEndTimestamp(1718000000)
    ).to.be.revertedWithCustomError(stargateNFTContract, "ExpectedPause");
  });

  it("Admins with DEFAULT_ADMIN_ROLE can update the VTHO generation end timestamp", async () => {
    await stargateNFTContract.connect(deployer).pause();

    const currentVthoGenerationEndTimestamp =
      await stargateNFTContract.vthoGenerationEndTimestamp();
    await expect(stargateNFTContract.connect(deployer).setVthoGenerationEndTimestamp(1718000000))
      .to.emit(stargateNFTContract, "VthoGenerationEndTimestampSet")
      .withArgs(currentVthoGenerationEndTimestamp, 1718000000);

    const updatedVthoGenerationEndTimestamp =
      await stargateNFTContract.vthoGenerationEndTimestamp();
    expect(updatedVthoGenerationEndTimestamp).to.equal(1718000000);

    await stargateNFTContract.connect(deployer).unpause();
  });

  it("Users without DEFAULT_ADMIN_ROLE cannot update the VTHO generation end timestamp", async () => {
    await stargateNFTContract.connect(deployer).pause();

    await expect(
      stargateNFTContract.connect(maliciousUser).setVthoGenerationEndTimestamp(1718000000)
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");

    await stargateNFTContract.connect(deployer).unpause();
  });
});
