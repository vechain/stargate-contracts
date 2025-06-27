import { defaultMainNetwork } from "@repo/constants";
import { AppConfig } from ".";
const config: AppConfig = {
  environment: "mainnet",
  basePath: "https://stargate.org",
  ipfsPinningService: "https://api.gateway-proxy.vechain.org/api/v1/pinning/pinFileToIPFS",
  ipfsFetchingService: "https://api.gateway-proxy.vechain.org/ipfs",
  legacyNodesContractAddress: "0xb81E9C5f9644Dec9e5e3Cac86b4461A222072302",
  stargateNFTContractAddress: "0x0000000000000000000000000000000000000000",
  nodeManagementContractAddress: "0xB0EF9D89C6b49CbA6BBF86Bf2FDf0Eee4968c6AB",
  stargateDelegationContractAddress: "0x0000000000000000000000000000000000000000",
  nodeUrl: "https://mainnet.vechain.org",
  network: defaultMainNetwork,
};
export default config;
