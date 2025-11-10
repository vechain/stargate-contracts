import { expect } from "chai";
import { StartedTestContainer } from "testcontainers";
import { IProtocolStaker, StargateNFT, Stargate } from "../../typechain-types";
import { IProtocolParams } from "../../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { compareAddresses } from "@repo/utils/AddressUtils";
import { TokenAuction } from "../../typechain-types";
import { StrengthLevel } from "@repo/config/contracts";
import { TransactionResponse } from "ethers";
import { ZERO_ADDRESS } from "@vechain/sdk-core";
import { createThorSoloContainer, getOrDeployContracts, MAX_UINT32 } from "../helpers";

describe("shard-i6: StargateNFT: Node Migration", () => {
    let soloContainer: StartedTestContainer;

    let protocolStakerContract: IProtocolStaker;
    let protocolParamsContract: IProtocolParams;
    let stargateNFTContract: StargateNFT;
    let stargateContract: Stargate;
    let legacyNodesContract: TokenAuction;

    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherUser: HardhatEthersSigner;

    let tx: TransactionResponse;

    const legacyTokenId = 1;
    const levelToMigrate = StrengthLevel.VeThorX;

    beforeEach(async () => {
        soloContainer = await createThorSoloContainer();

        const contracts = await getOrDeployContracts({ forceDeploy: true });

        protocolStakerContract = contracts.protocolStakerContract;
        protocolParamsContract = contracts.protocolParamsContract;
        stargateNFTContract = contracts.stargateNFTContract;
        stargateContract = contracts.stargateContract;
        legacyNodesContract = contracts.legacyNodesContract;

        deployer = contracts.deployer;
        user = contracts.otherAccounts[0];
        otherUser = contracts.otherAccounts[1];
        // Admin mints legacy NFTs to user1
        const addTokenParams = {
            addr: await user.getAddress(),
            lvl: levelToMigrate,
            onUpgrade: false,
            applyUpgradeTime: 0,
            applyUpgradeBlockno: 0,
        };
        tx = await legacyNodesContract
            .connect(deployer)
            .addToken(
                addTokenParams.addr,
                addTokenParams.lvl,
                addTokenParams.onUpgrade,
                addTokenParams.applyUpgradeTime,
                addTokenParams.applyUpgradeBlockno
            );
        await tx.wait();
        // Admin sets Stargate NFT as operator of Legacy Token Auction
        tx = await legacyNodesContract.addOperator(await stargateNFTContract.getAddress());
        await tx.wait();

        // Admin updates lead time on Legacy Token Auction
        tx = await legacyNodesContract.setLeadTime(0);
        await tx.wait();
    });

    afterEach(async () => {
        if (soloContainer) {
            await soloContainer.stop();
        }
    });

    it("should run all tests on solo with this config", async () => {
        const paramsKey = "0x00000000000064656c656761746f722d636f6e74726163742d61646472657373";
        const stargateAddress = await protocolParamsContract.get(paramsKey);
        const expectedParamsVal = BigInt(await stargateContract.getAddress());
        expect(stargateAddress).to.equal(expectedParamsVal);

        const validatorAddress = await protocolStakerContract.firstActive();
        expect(compareAddresses(validatorAddress, deployer.address)).to.be.true;

        const [leaderGroupSize, queuedValidators] =
            await protocolStakerContract.getValidationsNum();
        expect(leaderGroupSize).to.equal(1);
        expect(queuedValidators).to.equal(0);

        const [, , , , status, offlineBlock] =
            await protocolStakerContract.getValidation(validatorAddress);

        expect(status).to.equal(2); // 2 Active
        expect(offlineBlock).to.equal(MAX_UINT32);
    });

    it("A user with a legacy node can migrate to StargateNFT and delegate to a validator", async () => {
        const levelSpec = await stargateNFTContract.getLevel(levelToMigrate);
        const levelVetAmountRequired = levelSpec.vetAmountRequiredToStake;

        // ensure that user owns the legacy node
        expect(await legacyNodesContract.idToOwner(legacyTokenId)).to.be.equal(user.address);

        // migrate the node to StargateNFT
        const tx = await stargateContract
            .connect(user)
            .migrateAndDelegate(legacyTokenId, deployer.address, {
                value: levelVetAmountRequired,
                gasLimit: 10_000_000,
            });
        await tx.wait();

        // ensure that the node is migrated
        expect(await stargateNFTContract.getToken(legacyTokenId)).to.be.not.null;

        // ensure that the node is delegated
        expect(await stargateContract.getDelegationStatus(legacyTokenId)).to.be.equal(1);

        // ensure that the node is delegated to the validator
        expect((await stargateContract.getDelegationDetails(legacyTokenId)).validator).to.be.equal(
            deployer.address
        );

        // ensure that the node is burned
        expect(await legacyNodesContract.idToOwner(legacyTokenId)).to.be.equal(ZERO_ADDRESS);
    });
    it("An user shouldnt be able to migrate the node if he is not the legacy token owner", async () => {
        const levelSpec = await stargateNFTContract.getLevel(levelToMigrate);
        const levelVetAmountRequired = levelSpec.vetAmountRequiredToStake;

        // ensure that user owns the legacy node
        expect(await legacyNodesContract.idToOwner(legacyTokenId)).to.be.equal(user.address);

        // migrate the node to StargateNFT

        await expect(
            stargateContract
                .connect(otherUser)
                .migrateAndDelegate(legacyTokenId, deployer.address, {
                    value: levelVetAmountRequired,
                    gasLimit: 10_000_000,
                })
        ).to.be.reverted;
    });
});
