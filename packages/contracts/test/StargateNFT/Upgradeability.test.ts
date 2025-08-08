import { expect } from "chai";
import { ethers } from "hardhat";
import { deployStargateNFTLibraries } from "../../scripts/deploy/libraries";
import {
  deployUpgradeableWithoutInitialization,
  getInitializerData,
  initializeProxy,
} from "../../scripts/helpers";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import {
  Clock,
  MintingLogic,
  Settings,
  Token,
  VetGeneratedVtho,
  Levels,
  ClockV1,
  MintingLogicV1,
  SettingsV1,
  TokenV1,
  VetGeneratedVthoV1,
  LevelsV1,
  StargateNFTV1,
  StargateNFT,
  StargateDelegation,
} from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TokenLevelId } from "@repo/config/contracts/StargateNFT";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { compareAddresses } from "@repo/utils/AddressUtils";

describe("shard3: StargateNFT Upgradeability", () => {
  const config = createLocalConfig();

  let deployer: HardhatEthersSigner;
  let contractAdmin: HardhatEthersSigner;
  let deployerAddress: string, contractAdminAddress: string;

  let vechainNodesMockAddress: string,
    stargateDelegationProxyAddress: string,
    stargateNFTProxyAddress: string;

  let roleDefaultAdmin: string, roleUpgrader: string, rolePauser: string, roleLevelOperator: string;

  let libraries: {
    StargateNFTClockLib: Clock;
    StargateNFTSettingsLib: Settings;
    StargateNFTTokenLib: Token;
    StargateNFTMintingLib: MintingLogic;
    StargateNFTVetGeneratedVthoLib: VetGeneratedVtho;
    StargateNFTLevelsLib: Levels;
    StargateNFTClockLibV1: ClockV1;
    StargateNFTSettingsLibV1: SettingsV1;
    StargateNFTTokenLibV1: TokenV1;
    StargateNFTMintingLibV1: MintingLogicV1;
    StargateNFTVetGeneratedVthoLibV1: VetGeneratedVthoV1;
    StargateNFTLevelsLibV1: LevelsV1;
  };

  let stargateNFTContract: StargateNFTV1 | StargateNFT;

  before(async () => {
    // Deploy V1
    // define deployer and deployer address
    deployer = (await ethers.getSigners())[0];
    deployerAddress = await deployer.getAddress();

    // define fake admin address
    contractAdmin = (await ethers.getSigners())[3];
    contractAdminAddress = await contractAdmin.getAddress();
    config.CONTRACTS_ADMIN_ADDRESS = contractAdminAddress;

    // mock VeChain legacy nodes contract
    const TokenAuctionFactory = await ethers.getContractFactory("TokenAuction");
    const vechainNodesMock = await TokenAuctionFactory.deploy();
    await vechainNodesMock.waitForDeployment();
    vechainNodesMockAddress = await vechainNodesMock.getAddress();

    // deploy stargate nft libraries
    libraries = await deployStargateNFTLibraries({ logOutput: false });

    // deploy proxy for stargate nft
    stargateNFTProxyAddress = await deployUpgradeableWithoutInitialization(
      "StargateNFTV1",
      {
        ClockV1: await libraries.StargateNFTClockLibV1.getAddress(),
        MintingLogicV1: await libraries.StargateNFTMintingLibV1.getAddress(),
        SettingsV1: await libraries.StargateNFTSettingsLibV1.getAddress(),
        TokenV1: await libraries.StargateNFTTokenLibV1.getAddress(),
        VetGeneratedVthoV1: await libraries.StargateNFTVetGeneratedVthoLibV1.getAddress(),
        LevelsV1: await libraries.StargateNFTLevelsLibV1.getAddress(),
      },
      false
    );

    // deploy proxy for stargate delegation
    stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
      "StargateDelegation",
      {},
      false
    );

    // initialize stargate nft
    stargateNFTContract = (await initializeProxy(
      stargateNFTProxyAddress,
      "StargateNFTV1",
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
        ClockV1: await libraries.StargateNFTClockLibV1.getAddress(),
        MintingLogicV1: await libraries.StargateNFTMintingLibV1.getAddress(),
        SettingsV1: await libraries.StargateNFTSettingsLibV1.getAddress(),
        TokenV1: await libraries.StargateNFTTokenLibV1.getAddress(),
        VetGeneratedVthoV1: await libraries.StargateNFTVetGeneratedVthoLibV1.getAddress(),
        LevelsV1: await libraries.StargateNFTLevelsLibV1.getAddress(),
      }
    )) as StargateNFTV1;

    // initialize stargate delegation
    (await initializeProxy(
      stargateDelegationProxyAddress,
      "StargateDelegation",
      [
        {
          upgrader: config.CONTRACTS_ADMIN_ADDRESS,
          admin: config.CONTRACTS_ADMIN_ADDRESS,
          stargateNFT: stargateNFTProxyAddress,
          vthoToken: config.VTHO_TOKEN_ADDRESS,
          vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
          delegationPeriod: config.DELEGATION_PERIOD_DURATION,
          operator: config.CONTRACTS_ADMIN_ADDRESS,
        },
      ],
      {}
    )) as StargateDelegation;

    // stargate nft contract roles
    roleDefaultAdmin = await stargateNFTContract.DEFAULT_ADMIN_ROLE();
    roleUpgrader = await stargateNFTContract.UPGRADER_ROLE();
    rolePauser = await stargateNFTContract.PAUSER_ROLE();
    roleLevelOperator = await stargateNFTContract.LEVEL_OPERATOR_ROLE();
  });

  it("should start testing with expected state", async () => {
    // Assert v1 of the contract is deployed
    expect(await stargateNFTContract.version()).to.equal(1);

    // Assert Token name and symbol are set correctly
    expect(await stargateNFTContract.name()).to.equal("StarGate Delegator Token");
    expect(await stargateNFTContract.symbol()).to.equal("SDT");

    // Assert roles are set correctly
    // deployer should not have any roles
    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, deployerAddress)).to.be.false;
    expect(await stargateNFTContract.hasRole(roleUpgrader, deployerAddress)).to.be.false;
    expect(await stargateNFTContract.hasRole(rolePauser, deployerAddress)).to.be.false;
    expect(await stargateNFTContract.hasRole(roleLevelOperator, deployerAddress)).to.be.false;

    // contract admin should have all roles
    expect(await stargateNFTContract.hasRole(roleDefaultAdmin, contractAdminAddress)).to.be.true;
    expect(await stargateNFTContract.hasRole(roleUpgrader, contractAdminAddress)).to.be.true;
    expect(await stargateNFTContract.hasRole(rolePauser, contractAdminAddress)).to.be.true;
    expect(await stargateNFTContract.hasRole(roleLevelOperator, contractAdminAddress)).to.be.true;

    // Assert that the other contracts addresses are set correctly
    expect(compareAddresses(await stargateNFTContract.vthoToken(), config.VTHO_TOKEN_ADDRESS)).to.be
      .true;
    expect(
      compareAddresses(
        await stargateNFTContract.stargateDelegation(),
        stargateDelegationProxyAddress
      )
    ).to.be.true;
    expect(compareAddresses(await stargateNFTContract.legacyNodes(), vechainNodesMockAddress)).to.be
      .true;

    // Assert levels were seeded
    const expectedLevelCount = config.TOKEN_LEVELS.length;

    const levelIds = await stargateNFTContract.getLevelIds();
    expect(levelIds.length).to.equal(expectedLevelCount);

    // Assert level ids are set correctly
    const expectedLevelIds = config.TOKEN_LEVELS.map((level) => level.level.id);
    expect(levelIds).to.deep.equal(expectedLevelIds);

    // Assert that ids will start from the current supply of legacy nodes
    expect(await stargateNFTContract.getCurrentTokenId()).to.equal(config.LEGACY_LAST_TOKEN_ID);

    // Assert that the base uri was set correctly
    expect(await stargateNFTContract.baseURI()).to.equal(config.BASE_TOKEN_URI);

    // Assert total supply is 0
    expect(await stargateNFTContract.totalSupply()).to.equal(0);
  });

  it("should revert if signer does not have UPGRADER_ROLE", async () => {
    // Assert deployer does not have UPGRADER_ROLE
    expect(await stargateNFTContract.hasRole(roleUpgrader, deployerAddress)).to.be.false;

    // grab current implementation address
    const currentImplementationAddress = await getImplementationAddress(
      ethers.provider,
      await stargateNFTContract.getAddress()
    );
    // deploy new implementation
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
    const newImplementation = await Contract.deploy();
    await newImplementation.waitForDeployment();

    // Upgrade should revert
    await expect(
      stargateNFTContract
        .connect(deployer)
        .upgradeToAndCall(await newImplementation.getAddress(), "0x")
    ).to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount");

    // Assert that implementation address did not change
    const currentImplementationAddressAfter = await getImplementationAddress(
      ethers.provider,
      await stargateNFTContract.getAddress()
    );
    expect(compareAddresses(currentImplementationAddressAfter, currentImplementationAddress)).to.be
      .true;
  });

  it("should preserve the state of the contract", async () => {
    // Assert that supply is still 0, contract balance is 0
    expect(await stargateNFTContract.totalSupply()).to.equal(0);
    expect(await ethers.provider.getBalance(stargateNFTProxyAddress)).to.equal(0);

    // Create a user and stake
    const user = (await ethers.getSigners())[5];
    const userAddress = await user.getAddress();

    // Assert that the user has no NFTs
    expect(await stargateNFTContract.balanceOf(userAddress)).to.equal(0);

    // Stake
    const levelId = TokenLevelId.Thunder;
    const levelSpec = await stargateNFTContract.getLevel(levelId);
    const valueToSend = levelSpec.vetAmountRequiredToStake;
    await stargateNFTContract.connect(user).stake(levelId, { value: valueToSend });

    // Assert token supply and contract balance are correct
    expect(await stargateNFTContract.totalSupply()).to.equal(1);
    expect(await ethers.provider.getBalance(stargateNFTProxyAddress)).to.equal(valueToSend);

    // Assert that the user has staked
    const tokenId = config.LEGACY_LAST_TOKEN_ID + 1;
    expect(await stargateNFTContract.balanceOf(userAddress)).to.equal(1);
    expect(await stargateNFTContract.idsOwnedBy(userAddress)).to.deep.equal([tokenId]);

    // Assert token properties
    const token = await stargateNFTContract.getToken(tokenId);
    expect(token.levelId).to.equal(levelId);

    // Slot zero for stargateNFTContract
    const initialSlot = BigInt(
      "0xec49bc12bd9c2cfd865ff38825256c053d253acea1262d51e4c4821cc4d5b700"
    );

    let storageSlots = [];
    for (let i = initialSlot; i < initialSlot + BigInt(100); i++) {
      storageSlots.push(await ethers.provider.getStorage(stargateNFTProxyAddress, i));
    }

    storageSlots = storageSlots.filter(
      (slot) => slot !== "0x0000000000000000000000000000000000000000000000000000000000000000"
    ); // removing empty slots

    // START ACTUAL UPGRADE
    // Assert contract admin has the upgrader role
    expect(await stargateNFTContract.hasRole(roleUpgrader, config.CONTRACTS_ADMIN_ADDRESS)).to.be
      .true;

    // deploy new implementation
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
    const newImplementation = await Contract.deploy();
    await newImplementation.waitForDeployment();

    // prep v2 initializer data
    const whitelistedUser = (await ethers.getSigners())[8];
    const whitelistedUserAddress = await whitelistedUser.getAddress();
    const whitelistedTokenId = 777;
    const whitelistedLevelId = TokenLevelId.MjolnirX;
    const encodedInitV2Data = getInitializerData(
      Contract.interface,
      [
        [
          {
            owner: whitelistedUserAddress,
            tokenId: whitelistedTokenId,
            levelId: whitelistedLevelId,
          },
        ],
      ],
      2 // version
    );

    // contractAdmin with upgrader role can upgrade to new implementation
    const upgradeTx = await stargateNFTContract
      .connect(contractAdmin)
      .upgradeToAndCall(await newImplementation.getAddress(), encodedInitV2Data);
    await upgradeTx.wait();

    // Attach new implementation to stargateNFTContract
    stargateNFTContract = (await Contract.attach(stargateNFTProxyAddress)) as StargateNFT;
    // END UPGRADE

    // Assert v2 of the contract is deployed
    expect(await stargateNFTContract.version()).to.equal(2);

    let storageSlotsAfter = [];
    for (let i = initialSlot; i < initialSlot + BigInt(100); i++) {
      storageSlotsAfter.push(await ethers.provider.getStorage(stargateNFTProxyAddress, i));
    }

    storageSlotsAfter = storageSlotsAfter.filter(
      (slot) => slot !== "0x0000000000000000000000000000000000000000000000000000000000000000"
    ); // removing empty slots

    // Check if storage slots are the same after upgrade
    for (let i = 0; i < storageSlots.length; i++) {
      //console.log("*** storageSlots v1", storageSlots[i], "vs v2", storageSlotsAfter[i])
      expect(storageSlots[i]).to.equal(storageSlotsAfter[i]);
    }

    // Assert token supply and contract balance remain
    expect(await stargateNFTContract.totalSupply()).to.equal(1);
    expect(await ethers.provider.getBalance(stargateNFTProxyAddress)).to.equal(valueToSend);

    // Assert that the user stake remains
    expect(await stargateNFTContract.balanceOf(userAddress)).to.equal(1);
    expect(await stargateNFTContract.idsOwnedBy(userAddress)).to.deep.equal([tokenId]);

    // Assert token properties
    const tokenAfter = await stargateNFTContract.getToken(tokenId);
    expect(tokenAfter.levelId).to.equal(token.levelId);

    // Assert that whitelist was initialized
    const whitelistEntry = await (stargateNFTContract as StargateNFT).getWhitelistEntry(
      whitelistedUserAddress
    );
    expect(whitelistEntry[0]).to.equal(whitelistedTokenId);
    expect(whitelistEntry[1]).to.equal(whitelistedLevelId);

    // Assert that whitelisted user has no NFTs
    expect(await stargateNFTContract.balanceOf(whitelistedUserAddress)).to.equal(0);
    expect(await stargateNFTContract.idsOwnedBy(whitelistedUserAddress)).to.deep.equal([]);

    // Whitelisted token can be migrated
    const whitelistedLevelSpec = await stargateNFTContract.getLevel(whitelistedLevelId);
    const whitelistedValueToSend = whitelistedLevelSpec.vetAmountRequiredToStake;
    await stargateNFTContract
      .connect(whitelistedUser)
      .migrate(whitelistedTokenId, { value: whitelistedValueToSend });

    // Assert token supply and contract balance are correct
    expect(await stargateNFTContract.totalSupply()).to.equal(2);
    expect(await ethers.provider.getBalance(stargateNFTProxyAddress)).to.equal(
      valueToSend + whitelistedValueToSend
    );

    // Assert that whitelisted user has the NFT
    expect(await stargateNFTContract.balanceOf(whitelistedUserAddress)).to.equal(1);
    expect(await stargateNFTContract.idsOwnedBy(whitelistedUserAddress)).to.deep.equal([
      whitelistedTokenId,
    ]);

    // Assert token properties
    const whitelistedToken = await stargateNFTContract.getToken(whitelistedTokenId);
    expect(whitelistedToken.levelId).to.equal(whitelistedLevelId);

    // Assert that whitelist entry was removed
    const whitelistEntryAfter = await (stargateNFTContract as StargateNFT).getWhitelistEntry(
      whitelistedUserAddress
    );
    expect(whitelistEntryAfter[0]).to.equal(0);
    expect(whitelistEntryAfter[1]).to.equal(0);
  });
});
