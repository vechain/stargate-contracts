import "dotenv/config";
import { getConfig } from "@repo/config";
import { getFolderName, zipFolder } from "../../helpers/fs"
import { uploadPathToIPFS, toIPFSURL } from "../../helpers/ipfs"
import { METADATA_PATH } from "./const"

async function uploadMetadataToIpfs(METADATA_PATH: string): Promise<void> {
  try {
    // 1. Grab IPFS service url from config
    const config = getConfig()
    const ipfsPinningService = config.ipfsPinningService;
    console.log(`This script will attempt to upload nfts metadata to ${ipfsPinningService}...`);

    // 2. Zip the directory and get the path to the zip file
    await zipFolder(METADATA_PATH, `${METADATA_PATH}.zip`);

    // 3. Upload the zip file to IPFS
    const metadataIpfsUrl = await uploadPathToIPFS(`${METADATA_PATH}.zip`);

    console.log(
      "Metadata IPFS URL:",
      toIPFSURL(metadataIpfsUrl, undefined, getFolderName(METADATA_PATH)) + "/"
    );
    process.exit(0);
  } catch (error) {
    console.error("Error uploading metadata to IPFS:", error);
    process.exit(1);
  }
}

uploadMetadataToIpfs(METADATA_PATH)
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Unhandled error:", error)
    process.exit(1)
  })
