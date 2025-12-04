import { expect } from "chai";
import { StargateNFT, TokenAuctionMock, TokenAuctionMock__factory } from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("shard-u109: StargateNFT: Getters", () => {
    const config = createLocalConfig();

    let stargateNFTContract: StargateNFT;
    let deployer: HardhatEthersSigner;
    let legacyNodesMock: TokenAuctionMock;
    beforeEach(async () => {
        [deployer] = await ethers.getSigners();

        const legacyNodesMockFactory = new TokenAuctionMock__factory(deployer);
        legacyNodesMock = await legacyNodesMockFactory.deploy();
        await legacyNodesMock.waitForDeployment();

        // simulate the stargate contract is deployed in the deployer addess
        // so the deployer can call the functions with onlyStargate modifier
        config.STARGATE_CONTRACT_ADDRESS = deployer.address;
        config.TOKEN_AUCTION_CONTRACT_ADDRESS = await legacyNodesMock.getAddress();

        // set cap to 0 for token level 3
        config.TOKEN_LEVELS[2].cap = 0;
        config.STARGATE_CONTRACT_ADDRESS = deployer.address;
        const contracts = await getOrDeployContracts({
            forceDeploy: true,
            config,
        });

        deployer = contracts.deployer;
        stargateNFTContract = contracts.stargateNFTContract;
    });

    it("should revert when trying to call tokenURI with a non-existing token", async () => {
        await expect(stargateNFTContract.tokenURI(1)).to.be.revertedWithCustomError(
            stargateNFTContract,
            "ERC721NonexistentToken"
        );
    });

    it("should return the correct legacy nodes address", async () => {
        const legacyNodesAddress = await stargateNFTContract.legacyNodes();
        expect(legacyNodesAddress).to.equal(await legacyNodesMock.getAddress());
    });

    it("should return the correct stargate address", async () => {
        const stargateAddress = await stargateNFTContract.getStargate();
        expect(stargateAddress).to.equal(config.STARGATE_CONTRACT_ADDRESS);
    });

    it("should return the correct vtho token address", async () => {
        const vthoTokenAddress = await stargateNFTContract.getVthoTokenAddress();
        expect(vthoTokenAddress).to.equal(config.VTHO_TOKEN_ADDRESS);
    });

    it("should return the clock mode", async () => {
        const clockMode = await stargateNFTContract.CLOCK_MODE();
        expect(clockMode).to.equal("mode=blocknumber&from=default");
    });

    it("should return the current block number", async () => {
        const currentBlockNumber = await stargateNFTContract.clock();
        expect(currentBlockNumber).to.equal(await ethers.provider.getBlockNumber());
    });

    it("should return the current timestamp", async () => {
        const currentTimestamp = await stargateNFTContract.timestamp();
        const currentBlockNumber = await ethers.provider.getBlockNumber();
        const block = await ethers.provider.getBlock(currentBlockNumber);
        expect(currentTimestamp).to.equal(block?.timestamp);
    });

    it("should return the current version", async () => {
        const currentVersion = await stargateNFTContract.version();
        expect(currentVersion).to.equal(3);
    });

    it("should return the list of levels", async () => {
        const levels = await stargateNFTContract.getLevels();
        for (let i = 0; i < levels.length; i++) {
            const contractLevel = levels[i];
            const configLevel = config.TOKEN_LEVELS.find(
                (level) => level.level.id === Number(contractLevel.id)
            );
            expect(configLevel).to.not.be.undefined;
            expect(contractLevel.name).to.equal(configLevel?.level.name);
            expect(contractLevel.isX).to.equal(configLevel?.level.isX);
            expect(contractLevel.maturityBlocks).to.equal(configLevel?.level.maturityBlocks);
            expect(contractLevel.scaledRewardFactor).to.equal(
                configLevel?.level.scaledRewardFactor
            );
            expect(contractLevel.vetAmountRequiredToStake).to.equal(
                configLevel?.level.vetAmountRequiredToStake
            );
        }
    });
});
