import { ethers } from "ethers";
import { type TokenAuction } from "../../typechain-types";
import { StrengthLevel, TokenMetadata, TokenMetadataRaw } from "@repo/config/contracts/type";

/**
 * Legacy Nodes contract, aka TokenAuction contract
 */

// ---------------- upon deployment, with contract interface ---------------- //

/**
 * Adds a token to the legacy nodes contract - Used for seeding upon deployment
 * @param legacyNodesContract - The legacy nodes contract
 * @param holderAddress - The address of the holder
 * @param lvl - The strength level of the token
 * @param onUpgrade - Whether the token is on upgrade
 */
export const addToken = async (
    legacyNodesContract: TokenAuction,
    holderAddress: string,
    lvl: StrengthLevel,
    onUpgrade = false
) => {
    if (!legacyNodesContract) {
        throw new Error("Legacy nodes contract not found");
    }

    if (holderAddress === ethers.ZeroAddress) {
        throw new Error("Holder address cannot be zero");
    }

    const applyUpgradeTime = 0; // These timestamps are only emitted with the NewUpgradeApply event
    const applyUpgradeBlockno = 0;
    await legacyNodesContract.addToken(
        holderAddress,
        lvl,
        onUpgrade,
        applyUpgradeTime,
        applyUpgradeBlockno
    );
};

// ---------------- scripting, with contract factory and sdk ---------------- //

export const parseTokenMetadata = (tokenMetadata: TokenMetadataRaw): TokenMetadata => {
    return {
        idToOwner: tokenMetadata[0],
        level: tokenMetadata[1],
        onUpgrade: tokenMetadata[2],
        isOnAuction: tokenMetadata[3],
        lastTransferTime: tokenMetadata[4],
        createdAt: tokenMetadata[5],
        updatedAt: tokenMetadata[6],
    };
};
