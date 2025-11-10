import { spawn } from "child_process";
import { waitForThorSolo } from "./waitForThorSolo";

/**
 * Starts thor-solo with clean logging
 */
async function startThorSolo(): Promise<void> {
    console.log("🚀 Starting thor-solo containers...");

    try {
        // Pull the latest image of thor solo
        await pullLatestThorSoloImage();

        // Start docker compose with minimal output
        const dockerProcess = spawn("docker", ["compose", "up", "-d", "--wait", "--quiet-pull"], {
            stdio: ["inherit", "pipe", "pipe"],
        });

        let output = "";
        let errorOutput = "";

        dockerProcess.stdout?.on("data", (data) => {
            output += data.toString();
        });

        dockerProcess.stderr?.on("data", (data) => {
            errorOutput += data.toString();
        });

        await new Promise<void>((resolve, reject) => {
            dockerProcess.on("close", (code) => {
                if (code === 0) {
                    console.log("✅ Docker containers started successfully");
                    resolve();
                } else {
                    console.error("❌ Failed to start docker containers");
                    if (errorOutput) {
                        console.error(errorOutput);
                    }
                    reject(new Error(`Docker compose failed with exit code ${code}`));
                }
            });
        });

        // Wait for thor-solo to be ready
        await waitForThorSolo();

        console.log("🎉 Thor-solo is ready for development!");
    } catch (error) {
        console.error("❌ Failed to start thor-solo:", (error as Error).message);
        process.exit(1);
    }
}

/**
 * Pulls the latest thor-solo Docker image
 */
async function pullLatestThorSoloImage(): Promise<void> {
    console.log("📥 Pulling latest thor-solo image...");

    const pullProcess = spawn("docker", ["compose", "pull", "--quiet"], {
        stdio: ["inherit", "pipe", "pipe"],
    });

    let errorOutput = "";

    pullProcess.stderr?.on("data", (data) => {
        errorOutput += data.toString();
    });

    await new Promise<void>((resolve, reject) => {
        pullProcess.on("close", (code) => {
            if (code === 0) {
                console.log("✅ Latest thor-solo image pulled successfully");
                resolve();
            } else {
                console.error("❌ Failed to pull latest thor-solo image");
                if (errorOutput) {
                    console.error(errorOutput);
                }
                reject(new Error(`Docker compose pull failed with exit code ${code}`));
            }
        });
    });
}

// Run if called directly
if (require.main === module) {
    startThorSolo();
}
