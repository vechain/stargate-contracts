import { EnvConfig, getContractsConfig } from "@repo/config/contracts";
import {
    deployUpgradeableWithoutInitialization,
    initializeProxyAllVersions,
} from "../../../helpers";
import { ethers } from "hardhat";
import { Stargate } from "../../../../typechain-types";
import { getConfig } from "@repo/config";
import { TransactionResponse } from "ethers";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const [deployer] = await ethers.getSigners();

    const contractsConfig = getContractsConfig(process.env.VITE_APP_ENV as EnvConfig);

    const appConfig = getConfig(process.env.VITE_APP_ENV as EnvConfig);

    console.log(`Deploying Stargate contract on network: ${appConfig.network.name}`);

    const stargateClockFactory = await ethers.getContractFactory("Clock");
    const stargateClock = await stargateClockFactory.deploy();
    await stargateClock.waitForDeployment();
    const stargateClockAddress = await stargateClock.getAddress();

    console.log(`Stargate Clock deployed at address: ${stargateClockAddress}`);

    const stargateProxyAddress = await deployUpgradeableWithoutInitialization(
        "Stargate",
        {
            Clock: stargateClockAddress,
        },
        false
    );

    console.log(`Stargate proxy deployed at address: ${stargateProxyAddress}`);

    console.log("Initializing Stargate...");

    const stargate = (await initializeProxyAllVersions(
        "Stargate",
        stargateProxyAddress,
        [
            {
                args: [
                    {
                        admin: deployer.address,
                        protocolStakerContract: appConfig.protocolStakerContractAddress,
                        stargateNFTContract: appConfig.stargateNFTContractAddress,
                        maxClaimablePeriods: contractsConfig.MAX_CLAIMABLE_PERIODS || 832,
                    },
                ],
            },
        ],
        false
    )) as Stargate;

    console.log(`Stargate initialized at address: ${await stargate.getAddress()}`);

    console.log("Granting pauser role to deployer...");

    let tx: TransactionResponse;
    const pauserRole = await stargate.PAUSER_ROLE();
    console.log(`Pauser role: ${pauserRole}`);

    tx = await stargate.grantRole(pauserRole, deployer.address);
    await tx.wait();
    console.log(`Pauser role granted to deployer at address: ${deployer.address}`);

    console.log("Pausing the contract...");
    tx = await stargate.pause();
    await tx.wait();
    console.log(`Contract paused`);

    // grant admin role to admin in config
    const adminRole = await stargate.DEFAULT_ADMIN_ROLE();
    console.log(`Admin role: ${adminRole}`);
    tx = await stargate.grantRole(adminRole, contractsConfig.CONTRACTS_ADMIN_ADDRESS);
    await tx.wait();
    console.log(
        `Admin role granted to admin in config at address: ${contractsConfig.CONTRACTS_ADMIN_ADDRESS}`
    );

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
