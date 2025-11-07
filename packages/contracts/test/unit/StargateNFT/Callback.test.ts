import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { StargateNFT } from "../../../typechain-types";
import { TransactionResponse } from "ethers";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ethers } from "hardhat";
import { getOrDeployContracts } from "../../helpers/deploy";
import { expect } from "chai";

describe("shard-u110: StargateNFT: Callback", () => {
    let stargateNFTContract: StargateNFT;
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let validator: HardhatEthersSigner;

    beforeEach(async () => {
        const config = createLocalConfig();
        [deployer] = await ethers.getSigners();

        config.STARGATE_CONTRACT_ADDRESS = deployer.address;
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });

        stargateNFTContract = contracts.stargateNFTContract;

        user = contracts.otherAccounts[0];
        otherAccounts = contracts.otherAccounts;
        validator = contracts.otherAccounts[1];
    });
    it("should revert when the caller is not the contract", async () => {
        await expect(
            stargateNFTContract.connect(user)._safeMintCallback(user.address, 1)
        ).to.be.revertedWithCustomError(stargateNFTContract, "UnauthorizedCaller");
    });
    it("should revert when the caller is not the contract", async () => {
        await expect(
            stargateNFTContract.connect(user)._burnCallback(1)
        ).to.be.revertedWithCustomError(stargateNFTContract, "UnauthorizedCaller");
    });
});
