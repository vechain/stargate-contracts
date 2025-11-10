import {
    checkContractsDeployment,
    isDevnetNetwork,
    isSoloNetwork,
    validateGenesisId,
} from "../helpers/config";

async function main() {
    // Only validate genesis for solo network (local development) or devnet
    if (isSoloNetwork || isDevnetNetwork) {
        const genesisValid = await validateGenesisId();
        if (!genesisValid) {
            console.log(
                "❌ Genesis ID validation failed. Run `cd packages/config && yarn update-genesis` to update the config."
            );
            process.exit(1);
        }
    }

    await checkContractsDeployment();
    process.exit(0);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
