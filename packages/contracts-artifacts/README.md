# Scargate Contracts artifacts

You can install an NPM package containing all the types and artifacts of the StarGate contracts so you do not need to manually import the ABI files and you can have full types support in your queries / clause building.

NPM Package: [https://www.npmjs.com/package/@vechain/stargate-contracts-artifacts](https://www.npmjs.com/package/@vechain/stargate-contracts-artifacts)

#### Installation:

```sh
yarn add @vechain/stargate-contracts-artifacts
```

or&#x20;

```sh
npm install @vechain/stargate-contracts-artifacts
```

#### Usage (with [SDK](https://docs.vechain.org/developer-resources/sdks-and-providers/sdk)):

```javascript
import { StargateNFT__factory } from "@vechain/stargate-contracts-artifacts";

const res = await thor.contracts
  .load(stargateContractAddress, StargateNFT__factory.abi)
  .read.balanceOf(address);
```

#### Usage (JSON Artifacts)

You should be also able to get the JSON artifacts from this package

```javascript

import * as StargateNFTArtifact from "@vechain/stargate-contracts-artifacts/artifacts/contracts/StargateNFT.sol/StargateNFT.json";
```

#### Multiple versions

This package will pull the latest version of the contracts. If you want to use a specific version, you can install it by appending `@{version}` to the package name.

For example, to install version 1.0.0:

```sh
yarn add @vechain/stargate-contracts-artifacts@1.0.0
```

or&#x20;

```sh
npm install @vechain/stargate-contracts-artifacts@1.0.0
```
