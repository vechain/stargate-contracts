# StarGate Contracts

```
//        ✦     *        .         ✶         *        .       ✦       .
//  ✦   _______..___________.    ___      .______        _______      ___   .___________. _______   ✦
//     /       ||           |   /   \     |   _  \      /  _____|    /   \  |           ||   ____|  *
//    |   (----``---|  |----`  /  ^  \    |  |_)  |    |  |  __     /  ^  \ `---|  |----`|  |__      .
//     \   \        |  |      /  /_\  \   |      /     |  | |_ |   /  /_\  \    |  |     |   __|     ✶
// .----)   |       |  |     /  _____  \  |  |\  \----.|  |__| |  /  _____  \   |  |     |  |____   *
// |_______/        |__|    /__/     \__\ | _| `._____| \______| /__/     \__\  |__|     |_______|  ✦
//         *       .      ✦      *      .        ✶       *      ✦       .       *        ✶
```

This package contains all the types and artifacts of the StarGate contracts (StargateNFT, StargateDelegation, NodeManagementV3, etc.) so you do not need to manually import the ABI files and you can have full types support in your queries / clause building.

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

If you want to install multiple versions at the same time, you can add them like this in your `package.json`:

```json
{
  "@vechain/stargate-contracts-artifacts-1-0-0": "npm:@vechain/stargate-contracts-artifacts@1.0.0",
  "@vechain/stargate-contracts-artifacts-2-0-0": "npm:@vechain/stargate-contracts-artifacts@2.0.0",
  "@vechain/stargate-contracts-artifacts-3-0-0": "npm:@vechain/stargate-contracts-artifacts@3.0.0"
}
```

Then in your code you can import the contracts like this:

```javascript
import { StargateNFT__factory as StargateNFTV1__factory } from "@vechain/stargate-contracts-artifacts-1-0-0";
import { StargateNFT__factory as StargateNFTV2__factory } from "@vechain/stargate-contracts-artifacts-2-0-0";
```

This way all the version can be accesed from the same project.

### Checkout the release notes to see the changes between versions

[Release notes](https://github.com/vechain/stargate-contracts/releases)
