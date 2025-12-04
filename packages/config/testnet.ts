import { AppConfig } from ".";
const config: AppConfig = {
  environment: "testnet",
  basePath: "https://example.org",
  ipfsPinningService:
    "https://api.gateway-proxy.vechain.org/api/v1/pinning/pinFileToIPFS",
  ipfsFetchingService: "https://api.gateway-proxy.vechain.org/ipfs",
  legacyNodesContractAddress: "0x8dbce5de4c1f1840a47ab10c682aee48e9d06c20",
  stargateNFTContractAddress: "0x887d9102f0003f1724d8fd5d4fe95a11572fcd77",
  nodeManagementContractAddress: "0xde17d0a516c38c168d37685bb71465f656aa256e",
  stargateDelegationContractAddress:
    "0x32cb945dc25f4fc4214df63e3825045d6088b096",
  stargateContractAddress: "0x1E02B2953AdEfEC225cF0Ec49805b1146a4429C1",
  protocolStakerContractAddress: "0x00000000000000000000000000005374616B6572",
  protocolParamsContractAddress: "0x0000000000000000000000000000506172616d73",
  nodeUrl: "https://testnet.vechain.org",
  indexerUrl: "https://indexer.testnet.vechain.org",
  network: {
    id: "test",
    name: "test",
    type: "test",
    defaultNet: true,
    urls: [
      "https://testnet.vechain.org",
      "https://vethor-node-test.vechaindev.com",
      "https://sync-testnet.veblocks.net",
      "https://testnet.vecha.in",
    ],
    explorerUrl: "https://explore-testnet.vechain.org",
    genesis: {
      id: "0x000000000b2bce3c70bc649a02749e8687721b09ed2e15997f466536b20bb127",
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
