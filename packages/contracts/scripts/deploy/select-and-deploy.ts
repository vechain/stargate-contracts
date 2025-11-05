import { getConfig } from "@repo/config";

import { execSync } from "child_process";
import { selectDeployConfig } from "./select-deploy-config";
import { EnvConfig } from "@repo/config/contracts";
import inquirer from "inquirer";

async function selectAndDeployContract() {
    try {
        const env = process.env.VITE_APP_ENV;
        if (!env) throw new Error("Environment variable VITE_APP_ENV is not set.");

        const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

        const { contract } = await inquirer.prompt<{
            contract: keyof typeof selectDeployConfig;
        }>({
            type: "list",
            name: "contract",
            message: "Which contract do you want to deploy?",
            choices: Object.keys(selectDeployConfig),
        });

        const selectedContract = selectDeployConfig[contract];

        const { version } = await inquirer.prompt<{
            version: string;
        }>({
            type: "list",
            name: "version",
            message: `Which version do you want to deploy ${contract} to?`,
            choices: selectedContract.versions.map((version) => ({
                name: `${version} - ${selectedContract.descriptions[version]}`,
                value: version,
            })),
        });

        console.log(`You are about to deploy the following contract:`);
        console.log(`\nContract: ${selectedContract.name}`);
        console.log(`Description: ${selectedContract.descriptions[version]}`);
        console.log(`Environment: ${env}\n`);

        const { confirmDeploy } = await inquirer.prompt<{
            confirmDeploy: boolean;
        }>({
            type: "confirm",
            name: "confirmDeploy",
            message: `Do you want to proceed with the deployment of ${selectedContract.name} on environment ${env}?`,
            default: false,
        });

        if (!confirmDeploy) {
            console.log("Deployment aborted.");
            process.exit(0);
        }

        process.env.CONTRACT_TO_DEPLOY = selectedContract.name;
        process.env.CONTRACT_VERSION = version;

        console.log(`\nStarting deployment of ${selectedContract.name} on ${env}...`);

        if (env === "local") {
            execSync(`turbo run deploy:contract:solo`, { stdio: "inherit" });
        } else {
            execSync(`turbo run deploy:contract:${env}`, { stdio: "inherit" });
        }

        console.log("\nDeployment complete!");
    } catch (error) {
        console.error("Deployment failed:", error);
        process.exit(1);
    }
}

selectAndDeployContract();
