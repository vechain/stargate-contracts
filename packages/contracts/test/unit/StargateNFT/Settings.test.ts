import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts } from "../../helpers";
import { StargateNFT } from "../../../typechain-types";

describe("shard-u106: StargateNFT: Settings", () => {
    const config = createLocalConfig();
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let stargateNFTContract: StargateNFT;

    beforeEach(async () => {
        [deployer] = await ethers.getSigners();

        const contracts = await getOrDeployContracts({
            forceDeploy: true,
            config,
        });

        deployer = contracts.deployer;
        user = contracts.otherAccounts[0];
        stargateNFTContract = contracts.stargateNFTContract;
    });

    it("shouldn't be able to set the base URI if the caller has not the MANAGER_ROLE", async () => {
        await expect(stargateNFTContract.connect(user).setBaseURI("https://example.com"))
            .to.be.revertedWithCustomError(stargateNFTContract, "AccessControlUnauthorizedAccount")
            .withArgs(user.address, await stargateNFTContract.MANAGER_ROLE());
    });

    it("should be able to set the base URI if the caller has the MANAGER_ROLE", async () => {
        await stargateNFTContract.grantRole(
            await stargateNFTContract.MANAGER_ROLE(),
            deployer.address
        );
        await expect(stargateNFTContract.connect(deployer).setBaseURI("https://example.com")).to.not
            .be.reverted;
        expect(await stargateNFTContract.baseURI()).to.equal("https://example.com");
    });
});
