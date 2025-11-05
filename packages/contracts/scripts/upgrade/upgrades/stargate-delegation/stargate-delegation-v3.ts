import { getConfig } from "@repo/config";
import { upgradeProxy } from "../../../helpers";
import { EnvConfig } from "@repo/config/contracts";
import { StargateDelegationV2 } from "../../../../typechain-types";
import { ethers, network } from "hardhat";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);
    const deployer = (await ethers.getSigners())[0];

    console.log(
        `Upgrading StargateDelegation contract to v3 at address: ${config.stargateDelegationContractAddress} on network: ${config.network.name} with hardhat network set to: ${network.name}`
    );
    console.log(`Deployer address: ${deployer.address}`);

    const stargateDelegationV2 = (await upgradeProxy(
        "StargateDelegationV2",
        "StargateDelegation",
        config.stargateDelegationContractAddress,
        [deployer.address], // the new LOST_REWARDS_WHITELISTER_ROLE will be assigned to the deployer
        {
            version: 3,
        }
    )) as StargateDelegationV2;

    console.log(`StargateDelegation upgraded`);

    // check that upgrade was successful
    const version = await stargateDelegationV2.version();
    console.log(`New StargateDelegation version: ${version}`);

    if (version !== 3n) {
        throw new Error(`StargateDelegation version is not 3: ${version}`);
    }

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
