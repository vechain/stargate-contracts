import { getConfig } from "@repo/config";
import { upgradeProxy } from "../../../helpers";
import { EnvConfig } from "@repo/config/contracts";
import { NodeManagementV3 } from "../../../../typechain-types";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

    console.log(
        `Upgrading NodeManagement contract at address: ${config.nodeManagementContractAddress} on network: ${config.network.name}`
    );

    const nodeManagementV3 = (await upgradeProxy(
        "NodeManagementV2",
        "NodeManagementV3",
        config.nodeManagementContractAddress,
        [config.stargateNFTContractAddress],
        {
            version: 3,
        }
    )) as NodeManagementV3;

    console.log(`NodeManagement upgraded`);

    // check that upgrade was successful
    const version = await nodeManagementV3.version();
    console.log(`New NodeManagement version: ${version}`);

    if (parseInt(version) !== 2) {
        throw new Error(`NodeManagement version is not 3: ${version}`);
    }

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
