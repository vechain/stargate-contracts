import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Interface, TransactionResponse } from "ethers";
import { Stargate, StargateDelegationV1, StargateNFT__factory } from "../../typechain-types";
import { StargateNFTV2 } from "../../typechain-types";
import { StartedTestContainer } from "testcontainers";
import { deployStargateNFTLibraries } from "../../scripts/deploy/libraries/deployStargateNftLibraries";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createThorSoloContainer, mineBlocks, upgradeStargateNFTV2ToV3 } from "../helpers";
import { TokenLevelId } from "@repo/config/contracts/type";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import {
    deployUpgradeableWithoutInitialization,
    initializeProxy,
    initializeProxyAllVersions,
} from "../../scripts/helpers";
import { getConfig } from "@repo/config";

describe("shard-i8: StargateNFT: Upgradeability", () => {
    const config = createLocalConfig();
    const appConfig = getConfig();
    let soloContainer: StartedTestContainer;

    let stargateContract: Stargate;
    let stargateNFTV2Contract: StargateNFTV2;

    let stargateNFTInterface: Interface;

    let deployer: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let user: HardhatEthersSigner;
    let tx: TransactionResponse;

    // deploy contracts
    // We only need StargateNFTV2 and Stargate to test the upgradeability
    beforeEach(async () => {
        soloContainer = await createThorSoloContainer();
        // define deployer and other accounts
        [deployer, ...otherAccounts] = await ethers.getSigners();
        config.CONTRACTS_ADMIN_ADDRESS = deployer.address;

        // mock VeChain legacy nodes contract
        const TokenAuctionFactory = await ethers.getContractFactory("TokenAuction");
        const vechainNodesMock = await TokenAuctionFactory.deploy();
        await vechainNodesMock.waitForDeployment();
        const vechainNodesMockAddress = await vechainNodesMock.getAddress();
        // deploy stargate nft libraries
        const libraries = await deployStargateNFTLibraries({ logOutput: false });

        // deploy stargate nft v2 proxy
        const stargateNFTV2ProxyAddress = await deployUpgradeableWithoutInitialization(
            "StargateNFTV2",
            {
                ClockV2: await libraries.StargateNFTClockLibV2.getAddress(),
                LevelsV2: await libraries.StargateNFTLevelsLibV2.getAddress(),
                MintingLogicV2: await libraries.StargateNFTMintingLibV2.getAddress(),
                SettingsV2: await libraries.StargateNFTSettingsLibV2.getAddress(),
                TokenV2: await libraries.StargateNFTTokenLibV2.getAddress(),
                VetGeneratedVthoV2: await libraries.StargateNFTVetGeneratedVthoLibV2.getAddress(),
            },
            false
        );

        // deploy stargate delegation proxy
        const stargateDelegationProxyAddress = await deployUpgradeableWithoutInitialization(
            "StargateDelegation",
            {},
            false
        );

        // deploy stargate proxy
        const stargateProxyAddress = await deployUpgradeableWithoutInitialization(
            "Stargate",
            {
                Clock: await libraries.StargateNFTClockLib.getAddress(),
            },
            false
        );

        // initialize stargate delegation
        (await initializeProxy(
            stargateDelegationProxyAddress,
            "StargateDelegation",
            [
                {
                    upgrader: config.CONTRACTS_ADMIN_ADDRESS,
                    admin: config.CONTRACTS_ADMIN_ADDRESS,
                    stargateNFT: stargateNFTV2ProxyAddress,
                    vthoToken: config.VTHO_TOKEN_ADDRESS,
                    vthoRewardPerBlock: config.VTHO_REWARD_PER_BLOCK_PER_NFT_LEVEL,
                    delegationPeriod: config.DELEGATION_PERIOD_DURATION,
                    operator: config.CONTRACTS_ADMIN_ADDRESS,
                },
            ],
            {}
        )) as StargateDelegationV1;

        // initialize stargate nft v2
        stargateNFTV2Contract = (await initializeProxyAllVersions(
            "StargateNFTV2",
            stargateNFTV2ProxyAddress,
            [
                {
                    args: [
                        {
                            tokenCollectionName: "StarGate Delegator Token",
                            tokenCollectionSymbol: "SDT",
                            baseTokenURI: config.BASE_TOKEN_URI,
                            admin: config.CONTRACTS_ADMIN_ADDRESS,
                            upgrader: config.CONTRACTS_ADMIN_ADDRESS,
                            pauser: config.CONTRACTS_ADMIN_ADDRESS,
                            levelOperator: config.CONTRACTS_ADMIN_ADDRESS,
                            legacyNodes:
                                vechainNodesMockAddress || config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            stargateDelegation: stargateDelegationProxyAddress,
                            legacyLastTokenId: config.LEGACY_LAST_TOKEN_ID,
                            levelsAndSupplies: config.TOKEN_LEVELS,
                            vthoToken: config.VTHO_TOKEN_ADDRESS,
                        },
                    ],
                }, // V1
                {
                    args: [config.WHITELIST_ENTRIES_V2],
                    version: 2,
                },
            ],
            false
        )) as StargateNFTV2;

        // initialize stargate
        stargateContract = (await initializeProxyAllVersions(
            "Stargate",
            stargateProxyAddress,
            [
                {
                    args: [
                        {
                            admin: config.CONTRACTS_ADMIN_ADDRESS,
                            protocolStakerContract: appConfig.protocolStakerContractAddress,
                            stargateNFTContract: stargateNFTV2ProxyAddress,
                            legacyNodesContract:
                                vechainNodesMockAddress || config.TOKEN_AUCTION_CONTRACT_ADDRESS,
                            maxClaimablePeriods: config.MAX_CLAIMABLE_PERIODS || 832,
                        },
                    ],
                },
            ],
            false
        )) as Stargate;

        // set stargate  as delegator contract
        const paramsKey = ethers.zeroPadValue(ethers.toUtf8Bytes("delegator-contract-address"), 32);
        const paramsVal = BigInt(stargateProxyAddress);

        const protocolParamsContract = await ethers.getContractAt(
            "IProtocolParams",
            appConfig.protocolParamsContractAddress
        );
        await protocolParamsContract.set(paramsKey, paramsVal);

        user = otherAccounts[0];

        stargateNFTInterface = StargateNFT__factory.createInterface();
    });

    afterEach(async () => {
        if (soloContainer) {
            await soloContainer.stop();
        }
    });
    it("Should be able to upgrade the StargateNFT contract", async () => {
        const encodedInitV3Data = stargateNFTInterface.encodeFunctionData("initializeV3", [
            await stargateContract.getAddress(),
            config.STARGATE_NFT_BOOST_LEVEL_IDS,
            config.STARGATE_NFT_BOOST_PRICES_PER_BLOCK,
        ]);

        const upgradedStargateNFTContract = await upgradeStargateNFTV2ToV3(
            deployer,
            encodedInitV3Data,
            stargateNFTV2Contract
        );
        expect(await upgradedStargateNFTContract.version()).to.equal(3);
    });
    it("Should be able to upgrade the StargateNFT contract to V3 and then fail to delegate in Stargate because funds werent transferred", async () => {
        const levelId = TokenLevelId.Thunder;
        const levelSpec = await stargateNFTV2Contract.getLevel(levelId);

        tx = await stargateNFTV2Contract
            .connect(user)
            .stake(levelId, { value: levelSpec.vetAmountRequiredToStake });
        await tx.wait();

        expect(await stargateNFTV2Contract.balanceOf(user)).to.equal(1);

        // wait for the NFT to be mature
        await mineBlocks(Number(levelSpec.maturityBlocks));

        const initializerData = await stargateNFTInterface.encodeFunctionData("initializeV3", [
            await stargateContract.getAddress(),
            config.STARGATE_NFT_BOOST_LEVEL_IDS,
            config.STARGATE_NFT_BOOST_PRICES_PER_BLOCK,
        ]);
        const upgradedStargateNFTContract = await upgradeStargateNFTV2ToV3(
            deployer,
            initializerData,
            stargateNFTV2Contract
        );

        // delegate the NFT to the validator
        await expect(
            stargateContract
                .connect(deployer)
                .delegate(
                    await upgradedStargateNFTContract.getCurrentTokenId(),
                    await stargateContract.getAddress()
                )
        ).to.be.reverted;
    });
    it("Should be able to upgrade the StargateNFT contract to V3 and then delegate in Stargate after transferring the funds", async () => {
        const levelId = TokenLevelId.Thunder;
        const levelSpec = await stargateNFTV2Contract.getLevel(levelId);

        tx = await stargateNFTV2Contract
            .connect(user)
            .stake(levelId, { value: levelSpec.vetAmountRequiredToStake });
        await tx.wait();

        const tokenId = await stargateNFTV2Contract.getCurrentTokenId();
        expect(await stargateNFTV2Contract.ownerOf(tokenId)).to.equal(user.address);
        expect(await stargateNFTV2Contract.isUnderMaturityPeriod(tokenId)).to.be.true;
        expect(await stargateNFTV2Contract.balanceOf(user)).to.equal(1);

        // wait for the NFT to be mature
        await mineBlocks(Number(levelSpec.maturityBlocks));
        expect(await stargateNFTV2Contract.isUnderMaturityPeriod(tokenId)).to.be.false;

        const initializerData = await stargateNFTInterface.encodeFunctionData("initializeV3", [
            await stargateContract.getAddress(),
            config.STARGATE_NFT_BOOST_LEVEL_IDS,
            config.STARGATE_NFT_BOOST_PRICES_PER_BLOCK,
        ]);
        const upgradedStargateNFTContract = await upgradeStargateNFTV2ToV3(
            deployer,
            initializerData,
            stargateNFTV2Contract
        );

        // balance pre transfer
        const stargateBalancePreTransfer = await ethers.provider.getBalance(
            await stargateContract.getAddress()
        );
        const nftBalancePreTransfer = await ethers.provider.getBalance(
            await upgradedStargateNFTContract.getAddress()
        );

        tx = await upgradedStargateNFTContract
            .connect(deployer)
            .transferBalance(nftBalancePreTransfer / 2n);
        await tx.wait();

        expect(
            await ethers.provider.getBalance(await upgradedStargateNFTContract.getAddress())
        ).to.equal(nftBalancePreTransfer / 2n);

        expect(
            await ethers.provider.getBalance(await upgradedStargateNFTContract.getAddress())
        ).to.equal(nftBalancePreTransfer / 2n);

        tx = await upgradedStargateNFTContract
            .connect(deployer)
            .transferBalance(nftBalancePreTransfer / 2n);
        await tx.wait();

        //balance post transfer
        const stargateBalancePostTransfer = await ethers.provider.getBalance(
            await stargateContract.getAddress()
        );
        const nftBalancePostTransfer = await ethers.provider.getBalance(
            await upgradedStargateNFTContract.getAddress()
        );

        expect(stargateBalancePostTransfer).to.equal(
            stargateBalancePreTransfer + nftBalancePreTransfer
        );
        expect(nftBalancePostTransfer).to.equal(0);

        // delegate the NFT to the validator
        tx = await stargateContract.connect(user).delegate(tokenId, deployer.address);
        await tx.wait();

        const delegationId = await stargateContract.getDelegationIdOfToken(
            await upgradedStargateNFTContract.getCurrentTokenId()
        );
        expect(delegationId).to.not.equal(0);
    });
});
