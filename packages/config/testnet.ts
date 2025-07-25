import { AppConfig } from "." 
 const config: AppConfig = {
  "environment": "testnet",
  "basePath": "https://example.org",
  "ipfsPinningService": "https://api.gateway-proxy.vechain.org/api/v1/pinning/pinFileToIPFS",
  "ipfsFetchingService": "https://api.gateway-proxy.vechain.org/ipfs",
  "legacyNodesContractAddress": "0x0747b39abc0de3d11c8ddfe2e7eed00aaa8d475c",
  "stargateNFTContractAddress": "0x1ec1d168574603ec35b9d229843b7c2b44bcb770",
  "nodeManagementContractAddress": "0x8bcbfc20ee39c94f4e60afc5d78c402f70b4f3b2",
  "stargateDelegationContractAddress": "0x7240e3bc0d26431512d5b67dbd26d199205bffe8",
  "nodeUrl": "https://testnet.vechain.org",
  "network": {
    "id": "test",
    "name": "test",
    "type": "test",
    "defaultNet": true,
    "urls": [
      "https://testnet.vechain.org",
      "https://vethor-node-test.vechaindev.com",
      "https://sync-testnet.veblocks.net",
      "https://testnet.vecha.in"
    ],
    "explorerUrl": "https://explore-testnet.vechain.org",
    "genesis": {
      "number": 0,
      "id": "0x000000000b2bce3c70bc649a02749e8687721b09ed2e15997f466536b20bb127",
      "size": 170,
      "parentID": "0xffffffff00000000000000000000000000000000000000000000000000000000",
      "timestamp": 1530014400,
      "gasLimit": 10000000,
      "beneficiary": "0x0000000000000000000000000000000000000000",
      "gasUsed": 0,
      "totalScore": 0,
      "txsRoot": "0x45b0cfc220ceec5b7c1c62c4d4193d38e4eba48e8815729ce75f9c0ab0e4c1c0",
      "txsFeatures": 0,
      "stateRoot": "0x4ec3af0acbad1ae467ad569337d2fe8576fe303928d35b8cdd91de47e9ac84bb",
      "receiptsRoot": "0x45b0cfc220ceec5b7c1c62c4d4193d38e4eba48e8815729ce75f9c0ab0e4c1c0",
      "signer": "0x0000000000000000000000000000000000000000",
      "isTrunk": true,
      "transactions": []
    },
    "blockTime": 10000
  }
};
    export default config;