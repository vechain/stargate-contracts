import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { expect } from "chai";
import { deployUpgradeableWithoutInitialization, initializeProxy } from "../../scripts/helpers";
import { StargateDelegation, StargateNFT, Token } from "../../typechain-types";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("StargateDelegation: contract upgradeability", () => {
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
    expect(await stargateDelegationContract.hasRole(UPGRADER_ROLE, deployer.address)).to.eql(true);

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
