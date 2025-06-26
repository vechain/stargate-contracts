import { expect } from "chai";
import { ethers } from "hardhat";
import { deployStargateNFTLibraries } from "../../scripts/deploy/libraries";
import { deployUpgradeableWithoutInitialization, initializeProxy } from "../../scripts/helpers";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import {
  Clock,
  MintingLogic,
  Settings,
  StargateNFT,
  Token,
  VetGeneratedVtho,
  Levels,
} from "../../typechain-types";
import { ZeroAddress } from "ethers";
import { getStargateNFTErrorsInterface } from "../helpers";

describe("StargateNFT: deployment", () => {
  const config = createLocalConfig();
  let vechainNodesMockAddress: string,
    stargateDelegationProxyAddress: string,
    stargateNFTProxyAddress: string,
    deployerAddress: string;
  let deployer;
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
  });

  it("should not be able to initialize v1 with wrong parameters", async () => {
    const invalidParams = [
      { param: "admin", value: ZeroAddress, error: "AddressCannotBeZero" },
      {
        param: "upgrader",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "pauser",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "levelOperator",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "legacyNodes",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "vthoToken",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "stargateDelegation",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "tokenCollectionName",
        value: "",
        error: "StringCannotBeEmpty",
      },
      {
        param: "tokenCollectionSymbol",
        value: "",
        error: "StringCannotBeEmpty",
      },
      {
        param: "baseTokenURI",
        value: "",
        error: "StringCannotBeEmpty",
      },
      {
        param: "legacyLastTokenId",
        value: 0,
        error: "ValueCannotBeZero",
      },
      {
        param: "levelsAndSupplies",
        value: [],
        error: "ArrayCannotHaveZeroLength",
      },
    ];

    for (const { param, value, error } of invalidParams) {
      const params = {
        tokenCollectionName: "StarGate Delegator Token",
        tokenCollectionSymbol: "SDT",
        baseTokenURI: config.BASE_TOKEN_URI,
        admin: config.CONTRACTS_ADMIN_ADDRESS,
        upgrader: config.CONTRACTS_ADMIN_ADDRESS,
        pauser: config.CONTRACTS_ADMIN_ADDRESS,
        levelOperator: config.CONTRACTS_ADMIN_ADDRESS,
        legacyNodes: vechainNodesMockAddress,
        legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
        levelsAndSupplies: config.TOKEN_LEVELS,
        stargateDelegation: stargateDelegationProxyAddress,
        vthoToken: config.VTHO_TOKEN_ADDRESS,
      };
      (params as any)[param] = value;

      await expect(
        initializeProxy(stargateNFTProxyAddress, "StargateNFT", [params], {
          Clock: await libraries.StargateNFTClockLib.getAddress(),
          MintingLogic: await libraries.StargateNFTMintingLib.getAddress(),
          Settings: await libraries.StargateNFTSettingsLib.getAddress(),
          Token: await libraries.StargateNFTTokenLib.getAddress(),
          VetGeneratedVtho: await libraries.StargateNFTVetGeneratedVthoLib.getAddress(),
          Levels: await libraries.StargateNFTLevelsLib.getAddress(),
        })
      ).to.be.revertedWithCustomError(await getStargateNFTErrorsInterface(), error);
    }
  });

  it("should initialize v1 contract correctly", async () => {
    stargateNFTContract = (await initializeProxy(
      stargateNFTProxyAddress,
      "StargateNFT",
      [
        {
          tokenCollectionName: "StarGate Delegator Token",
          tokenCollectionSymbol: "SDT",
          baseTokenURI: config.BASE_TOKEN_URI,
          admin: config.CONTRACTS_ADMIN_ADDRESS,
          upgrader: config.CONTRACTS_ADMIN_ADDRESS,
          pauser: config.CONTRACTS_ADMIN_ADDRESS,
          levelOperator: config.CONTRACTS_ADMIN_ADDRESS,
          legacyNodes: vechainNodesMockAddress,
          legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
          levelsAndSupplies: config.TOKEN_LEVELS,
          stargateDelegation: stargateDelegationProxyAddress,
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

    // Assert v1 of the contract is deployed
    expect(await stargateNFTContract.version()).to.equal(1);

    // Assert Token name and symbol are set correctly
    expect(await stargateNFTContract.name()).to.equal("StarGate Delegator Token");
    expect(await stargateNFTContract.symbol()).to.equal("SDT");

    // Assert roles are set correctly
    const roleDefaultAdmin = await stargateNFTContract.DEFAULT_ADMIN_ROLE();
    const roleUpgrader = await stargateNFTContract.UPGRADER_ROLE();
    const rolePauser = await stargateNFTContract.PAUSER_ROLE();
    const roleLevelOperator = await stargateNFTContract.LEVEL_OPERATOR_ROLE();

    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, deployerAddress)).to.be.false;
    expect(await stargateNFTContract.hasRole(roleUpgrader, deployerAddress)).to.be.false;
    expect(await stargateNFTContract.hasRole(rolePauser, deployerAddress)).to.be.false;
    expect(await stargateNFTContract.hasRole(roleLevelOperator, deployerAddress)).to.be.false;
    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, config.CONTRACTS_ADMIN_ADDRESS)).to
      .be.true;
    expect(await stargateNFTContract.hasRole(roleUpgrader, config.CONTRACTS_ADMIN_ADDRESS)).to.be
      .true;
    expect(await stargateNFTContract.hasRole(rolePauser, config.CONTRACTS_ADMIN_ADDRESS)).to.be
      .true;
    expect(await stargateNFTContract.hasRole(roleLevelOperator, config.CONTRACTS_ADMIN_ADDRESS)).to
      .be.true;

    // Assert that the other contracts addresses are set correctly
    expect(await stargateNFTContract.vthoToken()).to.equal(config.VTHO_TOKEN_ADDRESS);
    expect(await stargateNFTContract.stargateDelegation()).to.equal(stargateDelegationProxyAddress);
    expect(await stargateNFTContract.legacyNodes()).to.equal(vechainNodesMockAddress);

    // Assert levels were seeded
    const expectedLevelCount = config.TOKEN_LEVELS.length;

    const levelIds = await stargateNFTContract.getLevelIds();
    expect(levelIds.length).to.equal(expectedLevelCount);

    // Assert level ids are set correctly
    const expectedLevelIds = config.TOKEN_LEVELS.map((level) => level.level.id);
    expect(await stargateNFTContract.getLevelIds()).to.deep.equal(expectedLevelIds);

    // We should not have a None level
    await expect(stargateNFTContract.getLevel(0)).to.be.reverted;

    // Check that the level is same as in configuration files
    for (let i = 0; i < expectedLevelIds.length; i++) {
      const level = await stargateNFTContract.getLevel(expectedLevelIds[i]);

      expect(level.name).to.equal(config.TOKEN_LEVELS[i].level.name);
      expect(level.id).to.equal(config.TOKEN_LEVELS[i].level.id);
      expect(level.maturityBlocks).to.equal(config.TOKEN_LEVELS[i].level.maturityBlocks);
      expect(level.scaledRewardFactor).to.equal(config.TOKEN_LEVELS[i].level.scaledRewardFactor);
      expect(level.vetAmountRequiredToStake).to.equal(
        config.TOKEN_LEVELS[i].level.vetAmountRequiredToStake
      );
    }

    // Assert that ids will start from the current supply of legacy nodes
    expect(await stargateNFTContract.getCurrentTokenId()).to.equal(config.LEGACY_LAST_TOKEN_ID);

    // Assert that the base uri was set correctly
    expect(await stargateNFTContract.baseURI()).to.equal(config.BASE_TOKEN_URI);

    // Assert clock mode is returned correctly
    expect(await stargateNFTContract.CLOCK_MODE()).to.equal("mode=blocknumber&from=default");
  });

  it("cannot initialize v1 multiple times", async () => {
    await expect(
      initializeProxy(
        stargateNFTProxyAddress,
        "StargateNFT",
        [
          {
            tokenCollectionName: "StarGate Delegator Token",
            tokenCollectionSymbol: "SDT",
            baseTokenURI: config.BASE_TOKEN_URI,
            admin: config.CONTRACTS_ADMIN_ADDRESS,
            upgrader: config.CONTRACTS_ADMIN_ADDRESS,
            pauser: config.CONTRACTS_ADMIN_ADDRESS,
            levelOperator: config.CONTRACTS_ADMIN_ADDRESS,
            legacyNodes: vechainNodesMockAddress,
            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
            levelsAndSupplies: config.TOKEN_LEVELS,
            stargateDelegation: stargateDelegationProxyAddress,
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
      )
    ).to.be.reverted;
  });

  it("Should correctly support the ERC165 interface", async () => {
    expect(await stargateNFTContract.supportsInterface("0x01ffc9a7")).to.equal(true); // ERC165
  });
});
