import fetch from "node-fetch";

/**
 * Fetches the genesis block ID from a running thor-solo node
 * @param {string} nodeUrl - The URL of the thor node (default: http://localhost:8669)
 * @returns {Promise<string>} The genesis block ID
 */
export const fetchGenesisId = async (nodeUrl = "http://localhost:8669") => {
  try {
    console.log(`Fetching genesis block from ${nodeUrl}...`);

    // Fetch the genesis block (block 0)
    const response = await fetch(`${nodeUrl}/blocks/0`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const genesisBlock = await response.json();

    if (!genesisBlock || !genesisBlock.id) {
      throw new Error("Invalid genesis block response");
    }

    console.log(`Found genesis block ID: ${genesisBlock.id}`);
    return genesisBlock.id;
  } catch (error) {
    console.error("Failed to fetch genesis block:", error.message);
    console.log("Make sure thor-solo is running on", nodeUrl);
    throw error;
  }
};

/**
 * Fetches the complete genesis block from a running thor-solo node
 * @param {string} nodeUrl - The URL of the thor node (default: http://localhost:8669)
 * @returns {Promise<object>} The complete genesis block object
 */
export const fetchGenesisBlock = async (nodeUrl = "http://localhost:8669", verbose = false) => {
  try {
    if (verbose) {
      console.log(`Fetching complete genesis block from ${nodeUrl}...`);
    }

    const response = await fetch(`${nodeUrl}/blocks/0`);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const genesisBlock = await response.json();

    if (!genesisBlock) {
      throw new Error("Invalid genesis block response");
    }

    return genesisBlock;
  } catch (error) {
    if (verbose) {
      console.error("Failed to fetch genesis block:", error.message);
      console.log("Make sure thor-solo is running on", nodeUrl);
    }
    throw error;
  }
};
