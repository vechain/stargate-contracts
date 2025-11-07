import { expect } from "chai";
import { Stargate, StargateNFT } from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";

describe("shard-u108: StargateNFT: Pausing", () => {
    let stargateNFTContract: StargateNFT;
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tx: TransactionResponse;
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

        await stargateNFTContract.grantRole(
            await stargateNFTContract.PAUSER_ROLE(),
            deployer.address
        );
    });

    it("should be able to pause and unpause the contract", async () => {
        tx = await stargateNFTContract.connect(deployer).pause();
        await tx.wait();
        expect(await stargateNFTContract.paused()).to.equal(true);
        tx = await stargateNFTContract.connect(deployer).unpause();
        await tx.wait();
        expect(await stargateNFTContract.paused()).to.equal(false);
    });

    it("should revert when non-admin tries to pause or unpause the contract", async () => {
        await expect(stargateNFTContract.connect(user).pause()).to.be.revertedWithCustomError(
            stargateNFTContract,
            "AccessControlUnauthorizedAccount"
        );
    });

    it("should revert when trying to call boost after it is paused", async () => {
        tx = await stargateNFTContract.connect(deployer).pause();
        await tx.wait();
        await expect(stargateNFTContract.connect(user).boost(1)).to.be.revertedWithCustomError(
            stargateNFTContract,
            "EnforcedPause"
        );
    });

    it("should revert when trying to call mint after it is paused", async () => {
        tx = await stargateNFTContract.connect(deployer).pause();
        await tx.wait();
        await expect(
            stargateNFTContract.connect(deployer).mint(1, user.address)
        ).to.be.revertedWithCustomError(stargateNFTContract, "EnforcedPause");
    });
    it("should revert when trying to call burn after it is paused", async () => {
        tx = await stargateNFTContract.connect(deployer).pause();
        await tx.wait();
        await expect(stargateNFTContract.connect(deployer).burn(1)).to.be.revertedWithCustomError(
            stargateNFTContract,
            "EnforcedPause"
        );
    });
    it("should revert when trying to call migrate after it is paused", async () => {
        tx = await stargateNFTContract.connect(deployer).pause();
        await tx.wait();
        await expect(
            stargateNFTContract.connect(deployer).migrate(1)
        ).to.be.revertedWithCustomError(stargateNFTContract, "EnforcedPause");
    });
    it("should revert when trying to call boostOnBehalfOf after it is paused", async () => {
        tx = await stargateNFTContract.connect(deployer).pause();
        await tx.wait();
        await expect(
            stargateNFTContract.connect(deployer).boostOnBehalfOf(user.address, 1)
        ).to.be.revertedWithCustomError(stargateNFTContract, "EnforcedPause");
    });
});
