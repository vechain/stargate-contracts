import { AppConfig } from "." 
 const config: AppConfig = {
  "environment": "testnet",
  "basePath": "https://example.org",
  "ipfsPinningService": "https://api.gateway-proxy.vechain.org/api/v1/pinning/pinFileToIPFS",
  "ipfsFetchingService": "https://api.gateway-proxy.vechain.org/ipfs",
  "legacyNodesContractAddress": "0x8dbce5de4c1f1840a47ab10c682aee48e9d06c20",
  "stargateNFTContractAddress": "0x887d9102f0003f1724d8fd5d4fe95a11572fcd77",
  "nodeManagementContractAddress": "0xde17d0a516c38c168d37685bb71465f656aa256e",
  "stargateDelegationContractAddress": "0x32cb945dc25f4fc4214df63e3825045d6088b096",
  "nodeUrl": "https://testnet.vechain.org",
  "indexerUrl": "https://indexer.testnet.vechain.org/api/v1",
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