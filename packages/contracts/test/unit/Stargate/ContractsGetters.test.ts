import { expect } from "chai";
import { Stargate, IProtocolStaker, StargateNFT } from "../../../typechain-types";
import { getOrDeployContracts } from "../../helpers/deploy";
import { createLocalConfig } from "@repo/config/contracts/envs/local";

describe("shard-u7: Stargate: Contracts getters", () => {
    let stargateContract: Stargate;
    let protocolStakerContract: IProtocolStaker;
    let stargateNFTContract: StargateNFT;

    beforeEach(async () => {
        const config = createLocalConfig();
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
