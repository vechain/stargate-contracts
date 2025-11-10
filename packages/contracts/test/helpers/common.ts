import { ethers, network } from "hardhat";
import { mine } from "@nomicfoundation/hardhat-network-helpers";
import { StargateNFT, Errors__factory, IProtocolStaker } from "../../typechain-types";
import { getOrDeployContracts } from "./deploy";

export const mineBlocks = async (blocks: number) => {
    for (let i = 0; i < blocks; i++) {
        await waitForNextBlock();
    }
};

export const waitForNextBlock = async () => {
    if (network.name === "hardhat") {
        await mine(1);
        return;
    }

    // Force a new block by sending a transaction using ethers
    const [signer] = await ethers.getSigners();

    // Send a minimal transaction to trigger a new block
    const tx = await signer.sendTransaction({
        to: ethers.ZeroAddress, // Zero address
        value: 0, // Minimal value
        gasLimit: 21000, // Standard gas limit for simple transfer
    });

    // Wait for the transaction to be mined
    return await tx.wait();
};

// Since we moved errors to a separate library, our tests expect the
// error from the library instead of from the contract.
// The most common pattern people use in their tests when using library
// errors is to create a test helper like this one.
export const getStargateNFTErrorsInterface = async (_stargateNFTContract?: StargateNFT) => {
    const { stargateNFTContract } = await getOrDeployContracts({
        forceDeploy: false,
    });
    const addressToUse = _stargateNFTContract
        ? await _stargateNFTContract.getAddress()
        : await stargateNFTContract.getAddress();

    return Errors__factory.connect(addressToUse, ethers.provider);
};

// Helper function to find the level with the lowest VET requirement
export const getLevelWithLowestVetRequirement = async (stargateNFTContract: StargateNFT) => {
    const levels = await stargateNFTContract.getLevels();
    let lowestLevel = null;
    let lowestVetAmount = ethers.MaxUint256;

    for (const level of levels) {
        if (level.vetAmountRequiredToStake < lowestVetAmount) {
            lowestLevel = level;
            lowestVetAmount = level.vetAmountRequiredToStake;
        }
    }

    if (!lowestLevel) {
        throw new Error("No active levels found");
    }

    return {
        id: lowestLevel.id,
        vetAmount: lowestLevel.vetAmountRequiredToStake,
    };
};

/**
 * Fast-forward blockchain to complete validator periods ( leave periodsToComplete = 0 to fast-forward to the start of the next period)
 * @param validatorPeriod - getValidatorPeriodDetails.period as number
 * @param validatorStartBlock - getValidatorPeriodDetails.startBlock as number
 * @param periodsToComplete - Number of additional periods to complete (0 = just next period) as number
 */
export const fastForwardValidatorPeriods = async (
    validatorPeriod: number,
    validatorStartBlock: number,
    periodsToComplete: number = 0
) => {
    const currentBlock = await ethers.provider.getBlockNumber();

    const blocksInCurrentPeriod =
        (Number(currentBlock) - Number(validatorStartBlock)) % Number(validatorPeriod);
    const blocksToFastForward =
        validatorPeriod - blocksInCurrentPeriod + validatorPeriod * periodsToComplete;

    await mineBlocks(blocksToFastForward);
    return blocksToFastForward;
};
