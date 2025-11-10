import { getOrDeployContracts } from "./deploy";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export const createLegacyNodeHolder = async (level: number, owner: HardhatEthersSigner) => {
    const { legacyNodesContract } = await getOrDeployContracts({});

    const tx = await legacyNodesContract.addToken(owner.address, level, false, 0, 0);
    await tx.wait();

    return await legacyNodesContract.ownerToId(owner.address);
};
