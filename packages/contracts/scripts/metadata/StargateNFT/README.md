## ✨ StargateNFT Metadata & Image Upload (IPFS)

This flow handles generating and uploading StargateNFT metadata and images to IPFS. Each image is uploaded individually and linked in the metadata with its own CID.

### ⚠️ Image Requirements

To ensure smooth uploads and better UX:

- **Image must be ~1MB max**, optimize the image before uploading (e.g., using [Compress PNG](https://compresspng.com) or CLI tools)
- **Remove EXIF metadata** using a tool like:

  ```bash
  exiftool -all= ./images/7.png
  ```

### 🖼 Get ready to upload

1. Update `imagesData` in `consts.ts` if needed

2. Add image files to `packages/contracts/metadata/stargateNFT/images` (make sure each image filename matches `imageName` defined in `consts.ts`)

### ⚙️ Upload

Note that currently all environments are configured to pin/fetch images to/from IPFS prod, which is why we have a single script for now. From project root, run


```bash
# Command below uploads images, gens metadata and uploads the metadata
yarn contracts:upload-stargate-nft-metadata
```

