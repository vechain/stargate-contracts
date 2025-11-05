import { expect } from "chai";
import { Stargate } from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { TransactionResponse } from "ethers";

describe("shard-u6: Stargate: Clock", () => {
    let stargateContract: Stargate;
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let validator: HardhatEthersSigner;

    beforeEach(async () => {
        const config = createLocalConfig();
        [deployer] = await ethers.getSigners();
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });

        stargateContract = contracts.stargateContract;

        user = contracts.otherAccounts[0];
        otherAccounts = contracts.otherAccounts;
        validator = contracts.otherAccounts[1];
    });

    it("should return the correct clock", async () => {
        const currentBlock = await ethers.provider.getBlockNumber();
        const clock = await stargateContract.clock();
        expect(clock).to.be.equal(currentBlock);
    });

    it("should return the clock mode", async () => {
        const clockMode = await stargateContract.CLOCK_MODE();
        expect(clockMode).to.be.equal("mode=blocknumber&from=default");
    });
});
