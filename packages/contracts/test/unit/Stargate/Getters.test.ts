import { expect } from "chai";
import { Stargate } from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";

describe("shard-u8: Stargate: Getters", () => {
    let stargateContract: Stargate;

    beforeEach(async () => {
        const config = createLocalConfig();
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });

        stargateContract = contracts.stargateContract;
    });

    it("should return the correct version", async () => {
        const version = await stargateContract.version();
        expect(version).to.be.equal(1);
    });
});
