import { getConfig } from "@repo/config";
import { upgradeProxy } from "../../../helpers";
import { EnvConfig } from "@repo/config/contracts";
import { NodeManagementV4 } from "../../../../typechain-types";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

    console.log(
        `Upgrading NodeManagement contract at address: ${config.nodeManagementContractAddress} on network: ${config.network.name}`
    );

    const nodeManagementV4 = (await upgradeProxy(
        "NodeManagementV3",
        "NodeManagementV4",
        config.nodeManagementContractAddress,
        [],
        {
            version: 4,
            forceInitialization: true, // because the args are empty, we need to force the initialization
        }
    )) as NodeManagementV4;

    console.log(`NodeManagement upgraded`);

    // check that upgrade was successful
    const version = await nodeManagementV4.version();
    console.log(`New NodeManagement version: ${version}`);

    if (parseInt(version) !== 4) {
        throw new Error(`NodeManagement version is not 4: ${version}`);
    }

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
