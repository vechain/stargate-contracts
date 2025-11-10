import { AppConfig } from "."
const config: AppConfig = {
  "environment": "devnet",
  "basePath": "http://localhost:3000",
  "ipfsPinningService": "https://api.gateway-proxy.vechain.org/api/v1/pinning/pinFileToIPFS",
  "ipfsFetchingService": "https://api.gateway-proxy.vechain.org/ipfs",
  "legacyNodesContractAddress": "0xd762d72848852c856be1c626154f2bc92e74d0a3",
  "stargateNFTContractAddress": "0x2fd6240f2eeef39b213c600c70ad2ab64753db6d",
  "stargateDelegationContractAddress": "0x510a40c106d6ddd48892d65992c83bfd7df8166b",
  "nodeManagementContractAddress": "0xb9f584317c45b54d9e9abebb2a374ec57a3c7796",
  "stargateContractAddress": "0x35ce14062457ef7817e10bbc3815317f5a07d695",
  "protocolStakerContractAddress": "0x00000000000000000000000000005374616B6572",
  "protocolParamsContractAddress": "0x0000000000000000000000000000506172616d73",
  "indexerUrl": "https://dev.devnet.veworld.vechain.org",
  "nodeUrl": "https://hayabusa.live.dev.node.vechain.org",
  "network": {
    "id": "devnet",
    "name": "devnet",
    "type": "devnet",
    "defaultNet": true,
    "urls": [
      "https://hayabusa.live.dev.node.vechain.org"
    ],
    "explorerUrl": "https://insights-hayabusa.dev.node.vechain.org",
    "blockTime": 10000,
    "genesis": {
      "id": "0x00000000e8ec20f5c7a23530e54a68f6091f8f09285b5f647cc99856689beb21"
    }
  },
  "cyclePeriods": [
    { "value": 18, "label": "3 minutes" },
    { "value": 180, "label": "30 minutes" },
    { "value": 8640, "label": "1 day" },
  ],
};
export default config;
