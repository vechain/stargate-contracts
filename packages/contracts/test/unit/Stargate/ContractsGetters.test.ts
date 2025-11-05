import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { Stargate, IProtocolStaker, StargateNFT } from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";

describe("shard-u7: Stargate: Contracts getters", () => {
    let stargateContract: Stargate;
    let protocolStakerContract: IProtocolStaker;
    let stargateNFTContract: StargateNFT;
    let deployer: HardhatEthersSigner;

    beforeEach(async () => {
        const config = createLocalConfig();
        [deployer] = await ethers.getSigners();
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });

        stargateContract = contracts.stargateContract;
        protocolStakerContract = contracts.protocolStakerContract;
        stargateNFTContract = contracts.stargateNFTContract;
    });

    it("should return the protocol staker contract address", async () => {
        const addrFromGetter = await stargateContract.getProtocolStakerContract();
        const expected = await protocolStakerContract.getAddress();
        expect(addrFromGetter).to.equal(expected);
    });

    it("should return the stargate NFT contract address", async () => {
        const addrFromGetter = await stargateContract.getStargateNFTContract();
        const expected = await stargateNFTContract.getAddress();
        expect(addrFromGetter).to.equal(expected);
    });
});
