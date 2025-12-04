import { getConfig } from "@repo/config";
import { upgradeProxy } from "../../../helpers";
import { EnvConfig } from "@repo/config/contracts";
import { StargateDelegationV2 } from "../../../../typechain-types";
import { network } from "hardhat";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

    console.log(
        `Upgrading StargateDelegation contract at address: ${config.stargateDelegationContractAddress} on network: ${config.network.name} with hardhat network set to: ${network.name}`
    );

    const stargateDelegationV2 = (await upgradeProxy(
        "StargateDelegationV1",
        "StargateDelegationV2",
        config.stargateDelegationContractAddress,
        [],
        {
            version: 2,
        }
    )) as StargateDelegationV2;

    console.log(`StargateDelegation upgraded`);

    // check that upgrade was successful
    const version = await stargateDelegationV2.version();
    console.log(`New StargateDelegation version: ${version}`);

    if (version !== 2n) {
        throw new Error(`StargateDelegation version is not 2: ${version}`);
    }

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
