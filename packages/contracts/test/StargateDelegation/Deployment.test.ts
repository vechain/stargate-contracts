import { expect } from "chai";
import { getOrDeployContracts } from "../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ZeroAddress } from "ethers";
import { deployUpgradeableWithoutInitialization, initializeProxy } from "../../scripts/helpers";
import { ethers } from "hardhat";
import { compareAddresses } from "@repo/utils/AddressUtils";

describe("shard100: StargateDelegation Deployment", () => {
  it("should deploy the contract correctly", async () => {
    const config = createLocalConfig();
    config.DELEGATION_PERIOD_DURATION = 1;
    config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL = [
      {
        levelId: 1,
        rewardPerBlock: 1n,
      },
      {
        levelId: 2,
        rewardPerBlock: 2n,
      },
      {
        levelId: 3,
        rewardPerBlock: 3n,
      },
      {
        levelId: 4,
        rewardPerBlock: 4n,
      },
    ];
    const { stargateDelegationContract, stargateNFTContract, deployer, mockedVthoToken } =
      await getOrDeployContracts({ config, forceDeploy: true });

    // Roles are set correctly
    expect(
      await stargateDelegationContract.hasRole(
        await stargateDelegationContract.DEFAULT_ADMIN_ROLE(),
        await deployer.getAddress()
      )
    ).to.equal(true);
    expect(
      await stargateDelegationContract.hasRole(
        await stargateDelegationContract.UPGRADER_ROLE(),
        await deployer.getAddress()
      )
    ).to.equal(true);

    // StargateNFT is set correctly
    expect(
      compareAddresses(
        await stargateDelegationContract.getStargateNFTContract(),
        await stargateNFTContract.getAddress()
      )
    ).to.be.true;

    // Reward per block per NFT level is set correctly
    expect(await stargateDelegationContract.getVthoRewardPerBlock(0)).to.equal(0);
    expect(await stargateDelegationContract.getVthoRewardPerBlock(1)).to.equal(1);
    expect(await stargateDelegationContract.getVthoRewardPerBlock(2)).to.equal(2);
    expect(await stargateDelegationContract.getVthoRewardPerBlock(3)).to.equal(3);
    expect(await stargateDelegationContract.getVthoRewardPerBlock(4)).to.equal(4);
    expect(await stargateDelegationContract.getVthoRewardPerBlock(5)).to.equal(0);

    // Delegation period is set correctly
    expect(await stargateDelegationContract.getDelegationPeriod()).to.equal(1);

    expect(await stargateDelegationContract.CLOCK_MODE()).to.equal("mode=blocknumber&from=default");
    expect(
      compareAddresses(await stargateDelegationContract.getVthoToken(), mockedVthoToken.target)
    ).to.be.true;

    const vthoRewardsPerBlock = await stargateDelegationContract.getVthoRewardsPerBlock();

    expect(vthoRewardsPerBlock[0]).to.deep.equal([1n, 1n]);
    expect(vthoRewardsPerBlock[1]).to.deep.equal([2n, 2n]);
    expect(vthoRewardsPerBlock[2]).to.deep.equal([3n, 3n]);
    expect(vthoRewardsPerBlock[3]).to.deep.equal([4n, 4n]);
  });

  it("should not be able to initialize twice", async () => {
    const config = createLocalConfig();
    const { stargateDelegationContract, stargateNFTContract, deployer } =
      await getOrDeployContracts({ forceDeploy: true });

    await expect(
      stargateDelegationContract.initialize({
        upgrader: config.CONTRACTS_ADMIN_ADDRESS,
        admin: config.CONTRACTS_ADMIN_ADDRESS,
        stargateNFT: deployer.address,
        vthoToken: deployer.address,
        vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
        delegationPeriod: config.DELEGATION_PERIOD_DURATION, // 10 blocks
        operator: config.STARGATE_DELEGATION_OPERATOR_ADDRESS,
      })
    ).to.be.reverted;
  });

  // TODO: this test is skipped because the sdk does not propoerly
  // revert a transaction when we call sendTransaction with a wrong 
  // parameters.
  it.skip("should not be able to initialize v1 with wrong parameters", async () => {
    const config = createLocalConfig();
    const deployer = (await ethers.getSigners())[0];

    const stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
      "StargateDelegation",
      {},
      false
    );

    const invalidParams = [
      { param: "admin", value: ZeroAddress, error: "AddressCannotBeZero" },
      {
        param: "upgrader",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "operator",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "stargateNFT",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "vthoToken",
        value: ZeroAddress,
        error: "AddressCannotBeZero",
      },
      {
        param: "vthoRewardPerBlock",
        value: [],
        error: "ArrayCannotBeEmpty",
      },
      {
        param: "vthoRewardPerBlock",
        value: [
          {
            levelId: 1,
            rewardPerBlock: 1n,
          },
          {
            levelId: 2,
            rewardPerBlock: 0n,
          },
        ],
        error: "ArrayCannotBeEmpty",
      },
      {
        param: "delegationPeriod",
        value: 0,
        error: "InvalidDelegationPeriod",
      },
    ];

    for (const { param, value, error } of invalidParams) {
      let params = {
        upgrader: config.CONTRACTS_ADMIN_ADDRESS,
        admin: config.CONTRACTS_ADMIN_ADDRESS,
        stargateNFT: deployer.address,
        vthoToken: deployer.address,
        vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
        delegationPeriod: config.DELEGATION_PERIOD_DURATION, // 10 blocks
        operator: config.STARGATE_DELEGATION_OPERATOR_ADDRESS,
      };
      (params as any)[param] = value;

      await expect(
        initializeProxy(stargateDelegationProxyAddress, "StargateDelegation", [params], {})
      ).to.be.reverted;
    }
  });
});
