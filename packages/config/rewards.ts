import { AppConfig } from "." 
 const config: AppConfig = {
  "environment": "rewards",
  "basePath": "https://example.org",
  "ipfsPinningService": "https://api.gateway-proxy.vechain.org/api/v1/pinning/pinFileToIPFS",
  "ipfsFetchingService": "https://api.gateway-proxy.vechain.org/ipfs",
  "legacyNodesContractAddress": "0x735edf3d8a2f67923fa5c24c660e496498d6e628",
  "stargateNFTContractAddress": "0x4c56a454ca3d519a61eeaf384d24cdf342339373",
  "nodeManagementContractAddress": "0xede8add1fd4e88f6ad3ce2eb4dc01d8d9aca9581",
  "stargateDelegationContractAddress": "0x008c71ca84ec1cf803557786e662231fa8b5edda",
  "nodeUrl": "https://thor-solo.dev.rewards.vechain.org",
  "network": {
    "id": "solo",
    "name": "solo",
    "type": "solo",
    "defaultNet": true,
    "urls": [
      "https://thor-solo.dev.rewards.vechain.org"
    ],
    "explorerUrl": "",
    "genesis": {
      "number": 325324,
      "id": "0x0004f6cc88bb4626a92907718e82f255b8fa511453a78e8797eb8cea3393b215",
      "size": 373,
      "parentID": "0x0004f6cb730dbd90fed09d165bfdf33cc0eed47ec068938f6ee7b7c12a4ea98d",
      "timestamp": 1533267900,
      "gasLimit": 11253579,
      "beneficiary": "0xb4094c25f86d628fdd571afc4077f0d0196afb48",
      "gasUsed": 21000,
      "totalScore": 1029988,
      "txsRoot": "0x89dfd9fcd10c9e53d68592cf8b540b280b72d381b868523223992f3e09a806bb",
      "txsFeatures": 0,
      "stateRoot": "0x86bcc6d214bc9d8d0dedba1012a63c8317d19ce97f60c8a2ef5c59bbd40d4261",
      "receiptsRoot": "0x15787e2533c470e8a688e6cd17a1ee12d8457778d5f82d2c109e2d6226d8e54e",
      "signer": "0xab7b27fc9e7d29f9f2e5bd361747a5515d0cc2d1",
      "isTrunk": true,
      "transactions": []
    },
    "blockTime": 10000
  }
};
  export default config;