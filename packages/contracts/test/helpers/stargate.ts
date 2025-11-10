import { HardhatEthersSigner, SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { StargateNFT, Stargate, ProtocolStakerMock } from "../../typechain-types";
import { fastForwardValidatorPeriods, mineBlocks } from "./common";
import { log } from "./log";
import { MAX_UINT32 } from "./constants";

export async function stakeNFT(
    user: SignerWithAddress,
    levelId: number,
    stargateContract: Stargate,
    stargateNFTContract: StargateNFT,
    shouldLog: boolean = true
): Promise<{
    tokenId: bigint;
    levelSpec: any;
    levelVetAmountRequired: bigint;
}> {
    const levelSpec = await stargateNFTContract.getLevel(levelId);
    // stake the NFT
    const tx = await stargateContract
        .connect(user)
        .stake(levelId, { value: levelSpec.vetAmountRequiredToStake });
    await tx.wait();
    const tokenId = await stargateNFTContract.getCurrentTokenId();
    if (shouldLog) {
        log("\n🎉 Correctly staked an NFT of level", levelId);
    }
    return {
        tokenId,
        levelSpec,
        levelVetAmountRequired: levelSpec.vetAmountRequiredToStake,
    };
}

/**
 * Stakes an NFT, waits for maturity, and returns the token ID and level specs
 * This is the most common setup pattern across delegation tests
 */
export async function stakeAndMatureNFT(
    user: SignerWithAddress,
    levelId: number,
    stargateNFTContract: StargateNFT,
    stargateContract: Stargate,
    shouldLog: boolean = true
): Promise<{
    tokenId: bigint;
    levelSpec: any;
    levelVetAmountRequired: bigint;
}> {
    const { tokenId, levelSpec, levelVetAmountRequired } = await stakeNFT(
        user,
        levelId,
        stargateContract,
        stargateNFTContract,
        shouldLog
    );
    await mineBlocks(Number(levelSpec.maturityBlocks));
    if (shouldLog) {
        log("\n🚀 Fast-forwarded", Number(levelSpec.maturityBlocks), "blocks to mature the NFT");
    }
    return { tokenId, levelSpec, levelVetAmountRequired };
}

export async function exitDelegation(
    user: SignerWithAddress,
    tokenId: bigint,
    stakerContract: Stargate,
    periodSize: bigint,
    startBlock: bigint,
    waitNextPeriod: boolean = true
) {
    const tx = await stakerContract.connect(user).requestDelegationExit(tokenId);
    await tx.wait();
    if (waitNextPeriod) {
        await fastForwardValidatorPeriods(Number(periodSize), Number(startBlock), 0);
    }
}

/**
 * Delegates an NFT to a validator and returns the delegation ID
 */
export async function delegateNFT(
    user: SignerWithAddress,
    tokenId: bigint,
    validatorAddress: string,
    stargateContract: Stargate,
    shouldLog: boolean = true
): Promise<bigint> {
    const delegateTx = await stargateContract.connect(user).delegate(tokenId, validatorAddress);
    await delegateTx.wait();

    if (shouldLog) {
        log("\n🎉 Correctly delegated the NFT to validator", validatorAddress);
    }

    const delegationId = await stargateContract.getDelegationIdOfToken(tokenId);
    return delegationId;
}

/**
 * Complete flow: stake NFT, mature it, and delegate it
 * Returns all the relevant data needed for delegation tests
 */
export async function stakeAndDelegateNFT(
    user: SignerWithAddress,
    levelId: number,
    validatorAddress: string,
    stargateNFTContract: StargateNFT,
    stargateContract: Stargate,
    shouldLog: boolean = true
): Promise<{
    tokenId: bigint;
    delegationId: bigint;
    levelSpec: any;
    levelVetAmountRequired: bigint;
}> {
    const { tokenId, levelSpec, levelVetAmountRequired } = await stakeAndMatureNFT(
        user,
        levelId,
        stargateNFTContract,
        stargateContract,
        shouldLog
    );

    const delegationId = await delegateNFT(
        user,
        tokenId,
        validatorAddress,
        stargateContract,
        shouldLog
    );

    return { tokenId, delegationId, levelSpec, levelVetAmountRequired };
}

export async function logContractStatus(
    protocolStakerMock: ProtocolStakerMock,
    delegationId: number,
    deployer: HardhatEthersSigner
) {
    const { _status: validatorStatus } = await protocolStakerMock.getValidation(deployer.address);
    const { startPeriod: delegationStartPeriod, endPeriod: delegationEndPeriod } =
        await protocolStakerMock.getDelegationPeriodDetails(delegationId);
    const { completedPeriods: validatorCompletedPeriods, exitBlock: validatorExitBlock } =
        await protocolStakerMock.getValidationPeriodDetails(deployer.address);

    const currentValidatorPeriod = validatorCompletedPeriods + 1n;
    const validatorRequestedExit = validatorExitBlock != MAX_UINT32;
    const userRequestedExit = delegationEndPeriod != MAX_UINT32;
    const delegationStarted = delegationStartPeriod <= currentValidatorPeriod;
    const delegationEnded = userRequestedExit && delegationEndPeriod < currentValidatorPeriod;
    log(`\n`);
    log(`--------------------------------`);
    log(`VALIDATOR DETAILS`);
    log(`--------------------------------`);
    log(`validatorStatus: ${validatorStatus}`);
    log(`delegationStartPeriod: ${delegationStartPeriod}`);
    log(`delegationEndPeriod: ${delegationEndPeriod}`);
    log(`validatorCompletedPeriods: ${validatorCompletedPeriods}`);
    log(`validatorExitBlock: ${validatorExitBlock}`);
    log(`--------------------------------`);
    log(`COMPUTED VALUES`);
    log(`--------------------------------`);
    log(`currentValidatorPeriod: ${currentValidatorPeriod}`);
    log(`validatorRequestedExit: ${validatorRequestedExit}`);
    log(`userRequestedExit: ${userRequestedExit}`);
    log(`delegationStarted: ${delegationStarted}`);
    log(`delegationEnded: ${delegationEnded}`);
    log(`--------------------------------`);
    log(`\n`);
}
