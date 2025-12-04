import { network } from "hardhat";
import { getConfig } from "@repo/config";
import { checkContractsDeployment } from "../helpers/config";

const config = getConfig();

async function main() {
    console.log(`Checking contracts deployment on ${network.name} (${config.network.urls[0]})...`);
    await checkContractsDeployment();
    process.exit(0);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error);
    process.exit(1);
});
