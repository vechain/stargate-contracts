## Overview

[![codecov](https://codecov.io/gh/vechain/stargate-contracts/graph/badge.svg?token=3OMYFKUMS9)](https://app.codecov.io/gh/vechain/stargate-contracts)

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

Contracts are located in the `packages/contracts` folder.

Docs: [https://docs.stargate.vechain.org/](https://docs.stargate.vechain.org/)

## Stargate

Stargate is VeChain’s new staking platform, designed to transform how users participate in the VeChainThor network. Users can stake VET tokens, and use those to delegate them to a validator node of the protocol.
Their staking position is represented by an NFT.

This repo contains the StargateNFT, StargateDelegation and NodeManagementV3 contracts, plus a set of utility and mock contracts.

## Mainnet Addresses

```
"StargateNFT": "0x0000000000000000000000000000000000000000",
"StargateDelegation": "0x0000000000000000000000000000000000000000",
"TokenAuction (Legacy Nodes)": "0xb81E9C5f9644Dec9e5e3Cac86b4461A222072302",
"NodeManagementV3": "0xB0EF9D89C6b49CbA6BBF86Bf2FDf0Eee4968c6AB",
```

## Testnet Addresses

```
"StargateNFT": "0x1ec1d168574603ec35b9d229843b7c2b44bcb770",
"StargateDelegation": "0x7240e3bc0d26431512d5b67dbd26d199205bffe8",
"TokenAuction (Legacy Nodes)": "0x0747b39abc0de3d11c8ddfe2e7eed00aaa8d475c",
"NodeManagementV3": "0x8bcbfc20ee39c94f4e60afc5d78c402f70b4f3b2",
```

## Requirements

Ensure your development environment is set up with the following:

- **Node.js (v20 or later):** [Download here](https://nodejs.org/en/download/package-manager) 📥
- **Yarn:** [Install here](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable) 🧶
- **Docker (for containerization):** [Get Docker](https://docs.docker.com/get-docker/) 🐳
- **Hardhat (for smart contracts):** [Getting Started with Hardhat](https://hardhat.org/hardhat-runner/docs/getting-started) ⛑️

### Getting Started

Clone the repository, then install dependencies:

```bash
nvm use # Align your node version
```

```bash
yarn # Run this at the root level of the project
```

Place your `.env` file in the root folder. Copy `.env.example` and rename it to `.env`, then change values to your own. When running on Solo (see next section) you can re-use the values from the example file.

## Running on Solo Network Locally (docker needed!) 🔧

### Spin up the Solo Network in a docker container

```bash
  yarn solo-up
```

### Run the frontend and deploy the contracts on the Local Solo Network

```bash
  yarn dev
```

You should see a log like this, that means the frontend is running:

```bash
frontend:dev:   VITE v5.3.2  ready in 135 ms
frontend:dev:
frontend:dev:   ➜  Local:   http://localhost:5001/
frontend:dev:   ➜  Network: http://192.168.1.26:5001/
frontend:dev:   ➜  Network: http://192.168.64.1:5001/
frontend:dev:   ➜  press h + enter to show help
```

and then you see a log like this, that means the contracts are deployed:

```bash
@repo/contracts:check-contracts-deployment: ================  Contracts deployed in 0m 9s
@repo/contracts:check-contracts-deployment: Contracts { stargateNFT: '0xE55842798426F155Ad7Ff6E9C93378690d1FF46a' }
@repo/contracts:check-contracts-deployment: Contracts and libraries addresses saved to /path/apps/react-dapp-template/packages/contracts/deploy_output
@repo/contracts:check-contracts-deployment: Total execution time: 0m 9s
@repo/contracts:check-contracts-deployment: Deployment completed successfully!
@repo/contracts:check-contracts-deployment: ================================================================================
@repo/contracts:check-contracts-deployment: Writing new config file to /path/apps/react-dapp-template/packages/config/local.ts
```

or a log like this, that means the contracts are already deployed (if you run the `yarn dev` command again):

```bash
@repo/contracts:check-contracts-deployment: Checking contracts deployment on vechain_solo (http://localhost:8669)...
@repo/contracts:check-contracts-deployment: stargateNFT contract already deployed
```

### Redeploy contracts

If you want to run your frontend with a fresh deployment of the contracts you can do the following:

1. Go to the `packages/config/local.ts` (or testnet/mainnet.ts based on the network you are using) file and set the `stargateNFTContractAddress` to an empty string. Then run the `yarn dev` command again.

```typescript
  stargateNFTContractAddress: "",
```

2. Run the `yarn dev` command again.

```bash
  yarn dev
```

or

```bash
  yarn dev:testnet
```

If you want to change any of the config values for the deployment you can do so in the `packages/config/contracts/envs/local.ts` or `packages/config/contracts/envs/testnet.ts`.

### Deploy contracts only (no frontend)

You can deploy the contracts without starting the frontend by running the following command:

```bash
  yarn contracts:deploy:solo
```

This command will redeploy the contracts BUT WILL NOT save the addresses in the `packages/config/local.ts` file. You need to do that manually.

To change the network you can do as follows:

```bash
  yarn contracts:deploy:testnet
```

### Spin down the Solo Network

```bash
  yarn solo-down
```

## Running on Testnet 🌐

### Deploy the contracts on the Testnet:

```bash
  yarn contracts:deploy:testnet
```

_This will not save the addresses in the `packages/config/testnet.ts` file. You need to do that manually._

### Run the frontend to interact with the contracts on the Testnet:

```bash
  yarn dev:testnet
```

### Run tests

Note that tests will run on the Hardhat network.

```bash
  yarn contracts:test
```

### Run tests with coverage

```bash
  yarn contracts:test:coverage
```

Open the coverage report in the `packages/contracts/coverage/index.html` file in your browser to see the test coverage.

### Generate documentation

```bash
  yarn contracts:generate-docs
```

## Project Structure

This project is using [Turborepo](https://turborepo.com/) to manage multiple projects under the same repository (frontend, contracts, packages).

The main project is the `apps/frontend` folder. Everytime we start the frontend it will also compile the contracts (under the `packages/contracts` folder) and deploy them if they are not deployed yet. This will allow to have up to date ABIs, addresses and types in the frontend.

### Frontend (apps/frontend) 🌐

A blazing-fast React application powered by Vite with Chakra UI, Framer Motion, and VeChain-Kit.

### Contracts (packages/contracts) 📜

Smart contracts in Solidity, managed with Hardhat for deployment on the Vechain Thor network.

### Packages 📦

Shared configurations and utility functions to unify and simplify the development process.

### Verify contracts (Optional)

Optionally verify your smart contracts on Sourcify. This allows 3rd parties to view and independently verify all of the following:

- Source code
- Metadata
- Contract ABI
- Contract Bytecode
- Contract transaction ID

After deploying `SimpleStorage`, the console will print the address of the deployed contract. You can verify the contract on [sourcify.eth](https://repo.sourcify.dev/select-contract/):

```bash
yarn contracts:verify:mainnet 0x98307db87474fc30d6e022e2b31f384b134c2c2a
```

**Note:** Hardhat throws an error when verifying contracts on VeChain networks. This error can be ignored as the contract is still verified on Sourcify. See an [example here](https://repo.sourcify.dev/contracts/full_match/100010/0x98307db87474fC30D6E022E2b31f384B134C2c2A/sources/contracts/)
