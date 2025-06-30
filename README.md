## Overview

[![codecov](https://codecov.io/gh/vechain/stargate-contracts/graph/badge.svg?token=3OMYFKUMS9)](https://app.codecov.io/gh/vechain/stargate-contracts)

```
       ✦     *        .         ✶         *        .       ✦       .
 ✦   _______..___________.    ___      .______        _______      ___   .___________. _______  ✦
    /       ||           |   /   \     |   _  \      /  _____|    /   \  |           ||   ____| *
   |   (----``---|  |----`  /  ^  \    |  |_)  |    |  |  __     /  ^  \ `---|  |----`|  |__     .
    \   \        |  |      /  /_\  \   |      /     |  | |_ |   /  /_\  \    |  |     |   __|    ✶
.----)   |       |  |     /  _____  \  |  |\  \----.|  |__| |  /  _____  \   |  |     |  |____  *
|_______/        |__|    /__/     \__\ | _| `._____| \______| /__/     \__\  |__|     |_______| ✦
        *       .      ✦      *      .        ✶       *      ✦       .       *        ✶
```

Contracts are located in the `packages/contracts` folder.

Docs: [https://docs.stargate.vechain.org/](https://docs.stargate.vechain.org/for-developers/contracts)

Audit done by **Hacken** and is available in the root of the repo (`Hacken_Vechain Foundation_[SCA] VeChain _ Stargate _ May 2025 _P-2025-1669_3_20250630 10_14.pdf`).

## Stargate

Stargate is VeChain’s new staking platform, designed to transform how users participate in the VeChainThor network. Users can stake VET tokens, and use those to delegate them to a validator node of the protocol.
Their staking position is represented by an NFT.

This repo contains the StargateNFT, StargateDelegation and NodeManagementV3 contracts, plus a set of utility and mock contracts.

## Mainnet Addresses

```
"StargateNFT": "0x1856c533ac2d94340aaa8544d35a5c1d4a21dee7",
"StargateDelegation": "0x4cb1c9ef05b529c093371264fab2c93cc6cddb0e",
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

### Spin down the Solo Network

```bash
  yarn solo-down
```

### Deploy contracts

You can deploy the contracts without starting the frontend by running the following command:

```bash
  yarn contracts:deploy:solo
```

This command will redeploy the contracts BUT WILL NOT save the addresses in the `packages/config/local.ts` file. You need to do that manually.

To change the network you can do as follows:

```bash
  yarn contracts:deploy:testnet
```

Notice: After deploying the contracts you will need to manually deposit VTHO inside the StargateDelegation contract, otherwise you will not be able to claim delegation rewards or re-delegate.

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
