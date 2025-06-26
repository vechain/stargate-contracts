import "dotenv/config";
import fs from "fs/promises"
import path from "path"
import { getConfig } from "@repo/config";
import { toIPFSURL, uploadPathToIPFS } from "../../helpers/ipfs"
import { METADATA_PATH, IMAGE_PATH, description, imagesData } from "./const"

/**
 * Interface for an NFT attribute.
 */
interface Attribute {
  trait_type: string
  value: string | number
}

/**
 * Interface for the NFT metadata.
 * @see NFT [Metadata Standards](https://docs.opensea.io/docs/metadata-standards)
 */
interface Metadata {
  name: string
  description: string
  image: string
  attributes: Attribute[]
}

/**
 * Converts a record of attributes into an array of `Attribute` objects.
 *
 * @param attributes - A record object containing the attributes to convert.
 * @returns An array of `Attribute` objects.
 */
function convertAttributes(attributes: Record<string, string | number>): Attribute[] {
  return Object.entries(attributes).map(([key, value]) => ({ trait_type: key, value }))
}

/**
 * Generates the NFT metadata for a given level.
 *
 * @param name - The name of the level.
 * @param description - The description of the level.
 * @param imagesCID - The CID of the images directory on IPFS.
 * @param attributes - The attributes of the level.
 * @param image - The image file for the level.
 *
 * @returns The generated NFT metadata.
 */
function generateMetadata(
  name: string,
  description: string,
  attributes: Record<string, string | number >,
  image: string,
): Metadata {
  return {
    name,
    description,
    image: image,
    attributes: convertAttributes(attributes),
  }
}

/**
 * Asynchronously saves the generated NFT metadata.
 * @param metadata - The `Metadata` object to save.
 */
async function saveMetadataToFile(metadata: Metadata, fileName: string): Promise<void> {
  await fs.writeFile(`${METADATA_PATH}/${fileName}.json`, JSON.stringify(metadata, null, 2))
  console.log(`Metadata saved to ${METADATA_PATH}/${fileName}`)
}

/**
 * Main function to generate and save NFT metadata.
 */
async function generateAndSaveMetadata(): Promise<void> {
  try {
    // 1. Grab IPFS service url from config
    const config = getConfig()
    const ipfsPinningService = config.ipfsPinningService;
    console.log(`This script will attempt a number of image uploads to ${ipfsPinningService}...`)

    // 2. Get list of all images in the directory
    const imageFiles = await fs.readdir(IMAGE_PATH);

    // 3. Upload images one by one to IPFS and generate metadata
    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i];
      const imageData = imagesData.find(image => image.imageName === imageFile)

      if (!imageData) {
        console.log(`Image ${imageFile} not found! Exiting...`)
        process.exit(1)
      }

      const imagePath = path.join(IMAGE_PATH, imageFile);

      console.log(`Uploading ${imagePath} to IPFS...`);

      const imageIpfsHash = await uploadPathToIPFS(imagePath);
      const imageIpfsUrl = toIPFSURL(imageIpfsHash)

      console.log(`Image ${imageFile} uploaded to IPFS: ${imageIpfsUrl}. Generating metadata...`)

      const metadata = generateMetadata(imageData.levelName, description, imageData.levelAttributes, imageIpfsUrl)
      await saveMetadataToFile(metadata, imageData.imageName.split(".")[0])
    }

    process.exit(0)
  } catch (error) {
    console.error("Error generating metadata:", error)
    process.exit(1)
  }
}

// Generate and save the NFT metadata
generateAndSaveMetadata()
  .then(() => process.exit(0))
  .catch(error => {
    console.error("Unhandled error:", error)
    process.exit(1)
  })
