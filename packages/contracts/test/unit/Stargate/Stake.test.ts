import { createLocalConfig } from "@repo/config/contracts/envs/local";
import { getOrDeployContracts } from "../../helpers/deploy";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import {
    ProtocolStakerMock__factory,
    ProtocolStakerMock,
    Stargate,
    StargateNFTMock,
    StargateNFTMock__factory,
    MyERC20,
    MyERC20__factory,
} from "../../../typechain-types";
import { TransactionResponse } from "ethers";
import { expect } from "chai";

describe("shard-u1: Stargate: Staking", () => {
    const VTHO_TOKEN_ADDRESS = "0x0000000000000000000000000000456E65726779";
    let stargateContract: Stargate;
    let stargateNFTMockContract: StargateNFTMock;
    let protocolStakerMockContract: ProtocolStakerMock;
    let vthoTokenContract: MyERC20;
    let deployer: HardhatEthersSigner;
    let user: HardhatEthersSigner;
    let otherAccounts: HardhatEthersSigner[];
    let tx: TransactionResponse;
    let validator: HardhatEthersSigner;

    const LEVEL_ID = 1;
    const PERIOD_SIZE = 120;

    const VALIDATOR_STATUS_QUEUED = 1;
    const VALIDATOR_STATUS_ACTIVE = 2;
    const VALIDATOR_STATUS_EXITED = 3;

    const DELEGATION_STATUS_NONE = 0;
    const DELEGATION_STATUS_PENDING = 1;
    const DELEGATION_STATUS_ACTIVE = 2;
    const DELEGATION_STATUS_EXITED = 3;

    beforeEach(async () => {
        const config = createLocalConfig();
        [deployer] = await ethers.getSigners();

        // Deploy stargate nft mock
        const stargateNFTMockContractFactory = new StargateNFTMock__factory(deployer);
        stargateNFTMockContract = await stargateNFTMockContractFactory.deploy();
        await stargateNFTMockContract.waitForDeployment();

        // deploy protocol staker mock
        const protocolStakerMockContractFactory = new ProtocolStakerMock__factory(deployer);
        protocolStakerMockContract = await protocolStakerMockContractFactory.deploy();
        await protocolStakerMockContract.waitForDeployment();

        // Deploy VTHO token to the energy address
        const vthoTokenContractFactory = new MyERC20__factory(deployer);
        const tokenContract = await vthoTokenContractFactory.deploy(
            deployer.address,
            deployer.address
        );
        await tokenContract.waitForDeployment();
        const tokenContractBytecode = await ethers.provider.getCode(tokenContract);
        await ethers.provider.send("hardhat_setCode", [VTHO_TOKEN_ADDRESS, tokenContractBytecode]);

        // Deploy contracts
        config.STARGATE_NFT_CONTRACT_ADDRESS = await stargateNFTMockContract.getAddress();
        config.PROTOCOL_STAKER_CONTRACT_ADDRESS = await protocolStakerMockContract.getAddress();
        const contracts = await getOrDeployContracts({ forceDeploy: true, config });

        stargateContract = contracts.stargateContract;
        vthoTokenContract = MyERC20__factory.connect(VTHO_TOKEN_ADDRESS, deployer);

        user = contracts.otherAccounts[0];
        otherAccounts = contracts.otherAccounts;
        validator = contracts.otherAccounts[1];
        // add validator
        tx = await protocolStakerMockContract.addValidation(validator.address, PERIOD_SIZE);
        await tx.wait();

        tx = await protocolStakerMockContract.helper__setStargate(stargateContract.target);

        tx = await protocolStakerMockContract.helper__setValidatorStatus(
            validator.address,
            VALIDATOR_STATUS_ACTIVE
        );
        await tx.wait();

        // set level
        tx = await stargateNFTMockContract.helper__setLevel({
            id: LEVEL_ID,
            name: "Strength",
            isX: false,
            maturityBlocks: 10,
            scaledRewardFactor: 150,
            vetAmountRequiredToStake: ethers.parseEther("1"),
        });
        await tx.wait();

        tx = await stargateNFTMockContract.helper__setToken({
            tokenId: 10000,
            levelId: LEVEL_ID,
            mintedAtBlock: 0,
            vetAmountStaked: ethers.parseEther("1"),
            lastVetGeneratedVthoClaimTimestamp_deprecated: 0,
        });
        await tx.wait();

        // mint some VTHO to the stargate contract so it can reward users
        tx = await vthoTokenContract
            .connect(deployer)
            .mint(stargateContract, ethers.parseEther("50000000"));
        await tx.wait();
    });

    it("should stake with the correct amount", async () => {
        const levelSpec = await stargateNFTMockContract.getLevel(LEVEL_ID);
        tx = await stargateContract.stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
    });

    it("should revert when staking with an incorrect amount", async () => {
        const levelSpec = await stargateNFTMockContract.getLevel(LEVEL_ID);
        await expect(
            stargateContract.stake(LEVEL_ID, {
                value: levelSpec.vetAmountRequiredToStake + 1n,
            })
        ).to.be.revertedWithCustomError(stargateContract, "VetAmountMismatch");
    });

    it("should revert when trying to unstake an NFT with an active delegation", async () => {
        // stake an NFT
        const levelSpec = await stargateNFTMockContract.getLevel(LEVEL_ID);
        tx = await stargateContract.stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();
        // delegate the NFT to the validator
        const tokenId = await stargateNFTMockContract.getCurrentTokenId();
        tx = await stargateContract.delegate(tokenId, validator.address);
        await tx.wait();

        // set validator completed periods to 120 so is active
        tx = await protocolStakerMockContract.helper__setValidationCompletedPeriods(
            validator.address,
            10
        );
        await tx.wait();

        // assert the delegation is active
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_ACTIVE
        );
        await tx.wait();

        // unstake the NFT
        // should revert with InvalidDelegationStatus
        await expect(stargateContract.unstake(tokenId)).to.be.revertedWithCustomError(
            stargateContract,
            "InvalidDelegationStatus"
        );
    });

    it("should unstake the NFT and withdraw the VET from the protocol when the delegation is exited", async () => {
        // stake an NFT
        const levelSpec = await stargateNFTMockContract.getLevel(LEVEL_ID);
        const userBalanceBeforeStake = await ethers.provider.getBalance(user.address);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();

        const userBalanceAfterStake = await ethers.provider.getBalance(user.address);

        expect(userBalanceAfterStake).to.be.closeTo(
            userBalanceBeforeStake - levelSpec.vetAmountRequiredToStake,
            ethers.parseEther("0.1") // account for gas fees
        );

        // delegate the NFT to the validator
        const tokenId = await stargateNFTMockContract.getCurrentTokenId();
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();

        // set validator completed periods to 10 so is active
        tx = await protocolStakerMockContract.helper__setValidationCompletedPeriods(
            validator.address,
            10
        );
        await tx.wait();

        // request delegation exit
        tx = await stargateContract.connect(user).requestDelegationExit(tokenId);
        await tx.wait();

        // advance some periods so is exited
        tx = await protocolStakerMockContract.helper__setValidationCompletedPeriods(
            validator.address,
            20
        );
        await tx.wait();

        // assert the delegation is exited
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_EXITED
        );
        await tx.wait();

        // unstake the NFT
        tx = await stargateContract.connect(user).unstake(tokenId);
        await tx.wait();

        await expect(tx)
            .to.emit(stargateContract, "DelegationWithdrawn")
            .withArgs(
                tokenId,
                validator.address,
                1,
                levelSpec.vetAmountRequiredToStake,
                levelSpec.id
            );

        await expect(tx).to.emit(stargateContract, "DelegationRewardsClaimed").withArgs(
            user.address,
            tokenId,
            1, // delegationId
            levelSpec.vetAmountRequiredToStake, // amount
            2, // firstClaimedPeriod: Delegation started in period 1 so the first claimable is period 2
            11 // lastClaimedPeriod: Delegation exited after period 10 so the last claimable is period 11
        );
        const userBalancePostUnstake = await ethers.provider.getBalance(user.address);
        expect(userBalancePostUnstake).to.be.closeTo(
            userBalanceBeforeStake,
            ethers.parseEther("0.1") // account for gas fees
        );

        // assert the token is burned
        await expect(stargateNFTMockContract.ownerOf(tokenId)).to.be.revertedWithCustomError(
            stargateNFTMockContract,
            "ERC721NonexistentToken"
        );
    });
    it("should unstake the NFT and withdraw the VET from the protocol when the delegation is pending", async () => {
        // stake an NFT
        const levelSpec = await stargateNFTMockContract.getLevel(LEVEL_ID);
        const userBalanceBeforeStake = await ethers.provider.getBalance(user.address);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();

        const userBalanceAfterStake = await ethers.provider.getBalance(user.address);

        expect(userBalanceAfterStake).to.be.closeTo(
            userBalanceBeforeStake - levelSpec.vetAmountRequiredToStake,
            ethers.parseEther("0.1") // account for gas fees
        );

        // delegate the NFT to the validator
        const tokenId = await stargateNFTMockContract.getCurrentTokenId();
        tx = await stargateContract.connect(user).delegate(tokenId, validator.address);
        await tx.wait();

        // assert the delegation is pending
        expect(await stargateContract.getDelegationStatus(tokenId)).to.equal(
            DELEGATION_STATUS_PENDING
        );
        await tx.wait();

        // unstake the NFT
        tx = await stargateContract.connect(user).unstake(tokenId);
        await tx.wait();

        await expect(tx)
            .to.emit(stargateContract, "DelegationWithdrawn")
            .withArgs(
                tokenId,
                validator.address,
                1,
                levelSpec.vetAmountRequiredToStake,
                levelSpec.id
            );

        await expect(tx)
            .to.emit(stargateContract, "DelegationExitRequested")
            .withArgs(tokenId, validator.address, 1, await stargateContract.clock());

        // rewards should be 0 so no event should be emitted
        await expect(tx).to.not.emit(stargateContract, "DelegationRewardsClaimed");

        // balance should be the same as before staking with a bit of room for gas fees

        const userBalancePostUnstake = await ethers.provider.getBalance(user.address);

        expect(userBalancePostUnstake).to.be.closeTo(
            userBalanceBeforeStake,
            ethers.parseEther("0.1") // account for gas fees
        );

        // assert the token is burned
        await expect(stargateNFTMockContract.ownerOf(tokenId)).to.be.revertedWithCustomError(
            stargateNFTMockContract,
            "ERC721NonexistentToken"
        );
    });

    it("should revert if the token does not exist", async () => {
        await expect(stargateContract.connect(user).unstake(1000000)).to.be.reverted;
    });

    it("should revert if the token is under the maturity period", async () => {
        // stake an NFT
        const levelSpec = await stargateNFTMockContract.getLevel(LEVEL_ID);
        await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        const tokenId = await stargateNFTMockContract.getCurrentTokenId();

        // set the token to be under the maturity period
        tx = await stargateNFTMockContract.helper__setIsUnderMaturityPeriod(true);
        await tx.wait();

        // try to unstake the token
        await expect(stargateContract.connect(user).unstake(tokenId)).to.be.revertedWithCustomError(
            stargateContract,
            "TokenUnderMaturityPeriod"
        );
    });

    it("should revert if the token is not owned by the user", async () => {
        // stake an NFT
        const levelSpec = await stargateNFTMockContract.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();

        const tokenId = await stargateNFTMockContract.getCurrentTokenId();

        await expect(
            stargateContract.connect(otherAccounts[2]).unstake(tokenId)
        ).to.be.revertedWithCustomError(stargateContract, "UnauthorizedUser");
    });

    // Test get effective stake
    it("should return the correct effective stake", async () => {
        //stake an NFT
        const levelSpec = await stargateNFTMockContract.getLevel(LEVEL_ID);
        tx = await stargateContract.connect(user).stake(LEVEL_ID, {
            value: levelSpec.vetAmountRequiredToStake,
        });
        await tx.wait();

        const tokenId = await stargateNFTMockContract.getCurrentTokenId();
        const effectiveStake = await stargateContract.getEffectiveStake(tokenId);
        expect(effectiveStake).to.be.equal(
            (levelSpec.vetAmountRequiredToStake * levelSpec.scaledRewardFactor) / 100n
        );
    });

    // receive function
    it("should revert if the sender is not the StargateNFT contract or the protocol staker contract", async () => {
        await expect(
            user.sendTransaction({
                to: stargateContract.target,
                value: ethers.parseEther("1"),
            })
        ).to.be.revertedWithCustomError(stargateContract, "OnlyStargateNFTAndProtocolStaker");
    });

    it("should not revert if the sender is the StargateNFT", async () => {
        const stargateNFTMockContractAddress = await stargateNFTMockContract.getAddress();
        await ethers.provider.send("hardhat_impersonateAccount", [stargateNFTMockContractAddress]);
        await ethers.provider.send("hardhat_setBalance", [
            stargateNFTMockContractAddress,
            "0x100000000000000000000", // 100 ETH in hex
        ]);
        const stargateNFTMockSigner = await ethers.getSigner(stargateNFTMockContractAddress);

        await expect(
            stargateNFTMockSigner.sendTransaction({
                to: stargateContract.target,
                value: ethers.parseEther("5"),
            })
        ).to.not.be.reverted;
    });

    it("should not revert if the sender is the protocol staker", async () => {
        const protocolStakerMockContractAddress = await protocolStakerMockContract.getAddress();
        await ethers.provider.send("hardhat_impersonateAccount", [
            protocolStakerMockContractAddress,
        ]);
        await ethers.provider.send("hardhat_setBalance", [
            protocolStakerMockContractAddress,
            "0x100000000000000000000", // 100 ETH in hex
        ]);
        const protocolStakerMockSigner = await ethers.getSigner(protocolStakerMockContractAddress);

        await expect(
            protocolStakerMockSigner.sendTransaction({
                to: stargateContract.target,
                value: ethers.parseEther("5"),
            })
        ).to.not.be.reverted;
    });
});
