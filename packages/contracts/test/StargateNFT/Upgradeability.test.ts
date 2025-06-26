import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { expect } from "chai";
import { deployStargateNFTLibraries } from "../../scripts/deploy/libraries";
import { deployUpgradeableWithoutInitialization, initializeProxy } from "../../scripts/helpers";
import {
  Clock,
  Levels,
  MintingLogic,
  Settings,
  StargateNFT,
  VetGeneratedVtho,
  Token,
} from "../../typechain-types";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("StargateNFT: contract upgradeability", () => {
  const config = createLocalConfig();
  let vechainNodesMockAddress: string,
    stargateDelegationProxyAddress: string,
    stargateNFTProxyAddress: string,
    deployerAddress: string;
  let deployer: HardhatEthersSigner;
  let libraries: {
    StargateNFTClockLib: Clock;
    StargateNFTSettingsLib: Settings;
    StargateNFTTokenLib: Token;
    StargateNFTMintingLib: MintingLogic;
    StargateNFTVetGeneratedVthoLib: VetGeneratedVtho;
    StargateNFTLevelsLib: Levels;
  };
  let stargateNFTContract: StargateNFT;

  // deploy the contract without initializing
  before(async () => {
    // define fake contract addresses
    vechainNodesMockAddress = (await ethers.getSigners())[1].address;
    stargateDelegationProxyAddress = (await ethers.getSigners())[2].address;

    // fake admin (so it's different from deployer and does not rely on the config file)
    config.CONTRACTS_ADMIN_ADDRESS = (await ethers.getSigners())[3].address;

    // Deploy the contract
    deployer = (await ethers.getSigners())[0];
    deployerAddress = await deployer.getAddress();

    libraries = await deployStargateNFTLibraries({ logOutput: false });

    stargateNFTProxyAddress = await deployUpgradeableWithoutInitialization(
      "StargateNFT",
      {
        Clock: await libraries.StargateNFTClockLib.getAddress(),
        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
        Token: await libraries.StargateNFTTokenLib.getAddress(),
        VetGeneratedVtho: await libraries.StargateNFTVetGeneratedVthoLib.getAddress(),
        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
      },
      false
    );

    stargateNFTContract = (await initializeProxy(
      stargateNFTProxyAddress,
      "StargateNFT",
      [
        {
          tokenCollectionName: "StarGate Delegator Token",
          tokenCollectionSymbol: "SDT",
          baseTokenURI: config.BASE_TOKEN_URI,
          admin: config.CONTRACTS_ADMIN_ADDRESS,
          upgrader: deployer.address,
          pauser: config.CONTRACTS_ADMIN_ADDRESS,
          levelOperator: config.CONTRACTS_ADMIN_ADDRESS,
          legacyNodes: config.VTHO_TOKEN_ADDRESS, // we do not care
          legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
          levelsAndSupplies: config.TOKEN_LEVELS,
          stargateDelegation: config.VTHO_TOKEN_ADDRESS, // we do not care
          vthoToken: config.VTHO_TOKEN_ADDRESS,
        },
      ],
      {
        Clock: await libraries.StargateNFTClockLib.getAddress(),
        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
        Token: await libraries.StargateNFTTokenLib.getAddress(),
        VetGeneratedVtho: await libraries.StargateNFTVetGeneratedVthoLib.getAddress(),
        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
      }
    )) as StargateNFT;
  });

  it("Upgrader can corretly upgrade contract", async () => {
    const UPGRADER_ROLE = await stargateNFTContract.UPGRADER_ROLE();
    expect(await stargateNFTContract.hasRole(UPGRADER_ROLE, deployer.address)).to.eql(true);

    const currentImplementationAddress = await getImplementationAddress(
      ethers.provider,
      await stargateNFTContract.getAddress()
    );

    // Deploy the implementation contract
    const Contract = await ethers.getContractFactory("StargateNFT", {
      libraries: {
        Clock: await libraries.StargateNFTClockLib.getAddress(),
        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
        Token: await libraries.StargateNFTTokenLib.getAddress(),
        VetGeneratedVtho: await libraries.StargateNFTVetGeneratedVthoLib.getAddress(),
        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
      },
    });
    const v2Implementation = await Contract.deploy();
    await v2Implementation.waitForDeployment();

    // admin can upgrade the implementation address to whataver
    await expect(
      stargateNFTContract
        .connect(deployer)
        .upgradeToAndCall(await v2Implementation.getAddress(), "0x")
    ).to.not.be.reverted;

    const newImplAddress = await getImplementationAddress(
      ethers.provider,
      await stargateNFTContract.getAddress()
    );

    expect(newImplAddress.toUpperCase()).to.not.eql(currentImplementationAddress.toUpperCase());
    expect(newImplAddress.toUpperCase()).to.eql(
      (await v2Implementation.getAddress()).toUpperCase()
    );
  });

  it("Only upgrader can upgrade contract", async () => {
    const maliciousUser = (await ethers.getSigners())[5];

    // Deploy the implementation contract
    const Contract = await ethers.getContractFactory("StargateNFT", {
      libraries: {
        Clock: await libraries.StargateNFTClockLib.getAddress(),
        MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
        Settings: await libraries.StargateNFTSettingsLib.getAddress(),
        Token: await libraries.StargateNFTTokenLib.getAddress(),
        VetGeneratedVtho: await libraries.StargateNFTVetGeneratedVthoLib.getAddress(),
        Levels: await libraries.StargateNFTLevelsLib.getAddress(),
      },
    });
    const maliciouseImplementation = await Contract.deploy();
    await maliciouseImplementation.waitForDeployment();

    const UPGRADER_ROLE = await stargateNFTContract.UPGRADER_ROLE();
    expect(await stargateNFTContract.hasRole(UPGRADER_ROLE, maliciousUser.address)).to.eql(false);

    await expect(
      stargateNFTContract
        .connect(maliciousUser)
        .upgradeToAndCall(await maliciouseImplementation.getAddress(), "0x")
    ).to.be.reverted;

    const currentImplementationAddress = await getImplementationAddress(
      ethers.provider,
      await stargateNFTContract.getAddress()
    );

    expect(currentImplementationAddress.toUpperCase()).to.not.eql(
      (await maliciouseImplementation.getAddress()).toUpperCase()
    );
  });
});
