import { EnvConfig, getContractsConfig } from "@repo/config/contracts";
import {
    deployUpgradeableWithoutInitialization,
    initializeProxyAllVersions,
} from "../../../helpers";
import { ethers } from "hardhat";
import { Stargate } from "../../../../typechain-types";
import { getConfig } from "@repo/config";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

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
                        admin: contractsConfig.CONTRACTS_ADMIN_ADDRESS,
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

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
