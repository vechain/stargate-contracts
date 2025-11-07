import { AppConfig } from ".";
const config: AppConfig = {
  environment: "mainnet",
  basePath: "https://stargate.org",
  ipfsPinningService:
    "https://api.gateway-proxy.vechain.org/api/v1/pinning/pinFileToIPFS",
  ipfsFetchingService: "https://api.gateway-proxy.vechain.org/ipfs",
  legacyNodesContractAddress: "0xb81E9C5f9644Dec9e5e3Cac86b4461A222072302",
  stargateNFTContractAddress: "0x1856c533ac2d94340aaa8544d35a5c1d4a21dee7",
  nodeManagementContractAddress: "0xB0EF9D89C6b49CbA6BBF86Bf2FDf0Eee4968c6AB",
  stargateDelegationContractAddress:
    "0x4cb1c9ef05b529c093371264fab2c93cc6cddb0e",
  stargateContractAddress: "0x0000000000000000000000000000000000000000",
  protocolStakerContractAddress: "0x00000000000000000000000000005374616B6572",
  protocolParamsContractAddress: "0x0000000000000000000000000000506172616d73",
  nodeUrl: "https://mainnet.vechain.org",
  indexerUrl: "https://indexer.mainnet.vechain.org",
  network: {
    id: "main",
    name: "main",
    type: "main",
    defaultNet: true,
    urls: [
      "https://mainnet.vechain.org",
      "https://vethor-node.vechain.com",
      "https://mainnet.veblocks.net",
      "https://mainnet.vecha.in",
    ],
    explorerUrl: "https://vechainstats.com",
    genesis: {
      id: "0x00000000851caf3cfdb6e899cf5958bfb1ac3413d346d43539627e6be7ec1b4a",
    },
    blockTime: 10000,
  },
  cyclePeriods: [
    { value: 60480, label: "7 days" },
    { value: 129600, label: "15 days" },
    { value: 259200, label: "30 days" },
  ],
};
export default config;
