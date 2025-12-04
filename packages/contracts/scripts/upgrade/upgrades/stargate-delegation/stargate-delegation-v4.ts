import { getConfig } from "@repo/config";
import { upgradeProxy } from "../../../helpers";
import { EnvConfig } from "@repo/config/contracts";
import { StargateDelegation } from "../../../../typechain-types";
import { ethers, network } from "hardhat";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
    const deployer = (await ethers.getSigners())[0];

    console.log(
        `Upgrading StargateDelegation contract to v4 at address: ${config.stargateDelegationContractAddress} on network: ${config.network.name} with hardhat network set to: ${network.name}`
    );
    console.log(`Deployer address: ${deployer.address}`);

    const stargateDelegation = (await upgradeProxy(
        "StargateDelegationV3",
        "StargateDelegation",
        config.stargateDelegationContractAddress,
        [],
        {
            version: 4,
        }
    )) as StargateDelegation;

    console.log(`StargateDelegation upgraded`);

    // check that upgrade was successful
    const version = await stargateDelegation.version();
    console.log(`New StargateDelegation version: ${version}`);

    if (version !== 4n) {
        throw new Error(`StargateDelegation version is not 4: ${version}`);
    }

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
