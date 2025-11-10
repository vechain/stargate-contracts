import axios from "axios";

export interface GenesisBlock {
    id: string;
    number: number;
    timestamp: number;
    parentID: string;
    [key: string]: any;
}

/**
 * Waits for thor-solo to be ready by checking the health endpoint
 * @param nodeUrl - The URL of the thor node
 * @param maxRetries - Maximum number of retries
 * @param retryDelay - Delay between retries in milliseconds
 * @returns Promise<void>
 */
export const waitForThorSolo = async (
    nodeUrl: string = "http://localhost:8669",
    maxRetries: number = 30,
    retryDelay: number = 2000
): Promise<void> => {
    console.log(`⏳ Waiting for thor-solo to be ready at ${nodeUrl}...`);

    for (let i = 0; i < maxRetries; i++) {
        try {
            // Try to fetch the genesis block as a health check
            const response = await axios.get(`${nodeUrl}/blocks/0`, {
                timeout: 5000,
            });

            if (response.status === 200 && response.data) {
                const block = response.data as GenesisBlock;
                if (block && block.id) {
                    return;
                }
            }
        } catch (error) {
            // Ignore errors and continue retrying
        }

        if (i < 3 || i % 5 === 0) {
            console.log(
                `   Attempt ${i + 1}/${maxRetries} - Thor-solo not ready yet, waiting ${retryDelay}ms...`
            );
        }
        await new Promise((resolve) => setTimeout(resolve, retryDelay));
    }

    throw new Error(`❌ Thor-solo failed to become ready after ${maxRetries} attempts`);
};

// Run if called directly
if (require.main === module) {
    waitForThorSolo().catch((error) => {
        console.error("Failed to wait for thor-solo:", error.message);
        process.exit(1);
    });
}
