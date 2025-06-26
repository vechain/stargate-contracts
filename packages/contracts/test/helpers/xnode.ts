import { getOrDeployContracts } from "./deploy";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

export const createLegacyNodeHolder = async (level: number, owner: HardhatEthersSigner) => {
  const { legacyNodesContract } = await getOrDeployContracts({});

  await legacyNodesContract.addToken(owner.address, level, false, 0, 0);

  return await legacyNodesContract.ownerToId(owner.address);
};
