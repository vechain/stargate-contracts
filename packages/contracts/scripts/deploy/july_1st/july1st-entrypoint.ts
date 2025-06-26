import inquirer from "inquirer";
import { execSync } from "child_process";
import { EnvConfig, getContractsConfig } from "@repo/config/contracts";
import { july1stConfig } from "./july1st_config";

async function deployJuly1st() {
  try {
    const env = process.env.VITE_APP_ENV;
    if (!env) throw new Error("Environment variable VITE_APP_ENV is not set.");

    // Filter scripts based on available networks for the current environment
    const availableScripts = Object.entries(july1stConfig).filter(([, script]) =>
      script.availableNetworks.includes(env === "local" ? "testnet" : env)
    );

    if (availableScripts.length === 0) {
      console.log(`No July 1st scripts available for environment: ${env}`);
      process.exit(0);
    }

    // Prompt the user to select a script to run
    const { script } = await inquirer.prompt<{
      script: string;
    }>({
      type: "list",
      name: "script",
      message: "Which July 1st script do you want to run?",
      choices: availableScripts.map(([key, scriptConfig]) => ({
        name: `${key} - ${scriptConfig.description}`,
        value: key,
      })),
    });

    const selectedScript = july1stConfig[script];

    console.log(`You are about to run the following July 1st script:`);
    console.log(`\nScript: ${selectedScript.name}`);
    console.log(`Description: ${selectedScript.description}`);
    console.log(`Environment: ${env}\n`);

    if (selectedScript.name === "deploy") {
      const envConfig = getContractsConfig(env as EnvConfig);
      console.log(`Env Configurations:`, envConfig, "\n");
    }

    // Confirm the deployment
    const { confirmDeploy } = await inquirer.prompt<{
      confirmDeploy: boolean;
    }>({
      type: "confirm",
      name: "confirmDeploy",
      message: `Do you want to proceed with running ${selectedScript.name} on environment ${env}?`,
      default: false,
    });

    if (!confirmDeploy) {
      console.log("Deployment aborted.");
      process.exit(0);
    }

    // Set environment variables
    process.env.JULY1ST_SCRIPT = selectedScript.name;

    console.log(`\nStarting July 1st script: ${selectedScript.name} on ${env}...`);

    // Run the deployment script directly using the npm script
    const scriptCommand = `${selectedScript.turboCommand}:${env}`;
    console.log(`Executing: yarn ${scriptCommand}`);
    execSync(`yarn ${scriptCommand}`, { stdio: "inherit" });

    console.log("\nJuly 1st script completed successfully!");
  } catch (error) {
    console.error("July 1st script failed:", error);
    process.exit(1);
  }
}

deployJuly1st();
