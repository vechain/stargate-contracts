import { expect } from "chai";
import { Stargate } from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { ethers } from "hardhat";

describe("shard-u6: Stargate: Clock", () => {
    let stargateContract: Stargate;

    beforeEach(async () => {
        const config = createLocalConfig();
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });

        stargateContract = contracts.stargateContract;
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
