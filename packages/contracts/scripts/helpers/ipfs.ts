import axios from "axios";
import { formData } from "./fs";
import { getConfig } from "@repo/config";

/**
 * Uploads a file to IPFS and returns the IPFS hash.
 * @param filePath - The path to the file to upload.
 * @returns The IPFS hash of the uploaded file.
 */
export async function uploadPathToIPFS(filePath: string): Promise<string> {
    try {
        // 1. Grab IPFS service url from config
        const config = getConfig();
        const ipfsPinningService = config.ipfsPinningService;

        // 2. Make a request to the IPFS pinning service
        const form = formData(filePath);
        const response = await axios.post(ipfsPinningService, form, {
            headers: form.getHeaders(),
        });

        // 3. Return the IPFS hash from the response
        return response.data.IpfsHash;
    } catch (error) {
        console.error("Error uploading file to IPFS:", error);
        throw new Error("Upload to IPFS failed");
    }
}

/**
 * Constructs an IPFS URL using a CID, and optionally a folder name and a file name.
 * @param cid - The CID to convert into an IPFS URL.
 * @param fileName - The name of the file to append to the URL. Optional.
 * @param folderName - The name of the folder to append to the URL. Optional.
 * @returns The IPFS URL in the format 'ipfs://{cid}/{folderName}/{fileName}'.
 */
export function toIPFSURL(cid: string, fileName?: string, folderName?: string): string {
    let url = `ipfs://${cid}`;
    if (folderName) {
        url += `/${folderName}`;
    }
    if (fileName) {
        url += `/${fileName}`;
    }
    return url;
}
