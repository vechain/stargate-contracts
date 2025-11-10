## Overview

Stargate is VeChain’s new staking platform, designed to transform how users participate in the VeChainThor network. Users can stake VET tokens, pick a validator of the protocol (by delegating their tokens to it), earn rewards for every block produced by the validator and unstake their tokens at any time.
Their staking position is represented by an NFT. In order to be able to delegate to a validator, the NFT must be matured, which means that a specific amount of blocks must pass since the NFT was minted.
The NFT can be boosted to skip the maturity period by paying a fee (VTHO).

The NFTs are minted and burned by the Stargate contract, which is the entry point for all interactions with the protocol.

## Requirements

Ensure your development environment is set up with the following:

- **Node.js (v20 or later):** [Download here](https://nodejs.org/en/download/package-manager) 📥
- **Yarn:** [Install here](https://classic.yarnpkg.com/lang/en/docs/install/#mac-stable) 🧶
- **Docker (for containerization):** [Get Docker](https://docs.docker.com/get-docker/) 🐳

## Project Structure

This project is using [Turborepo](https://turborepo.com/) to manage multiple projects under the same repository (frontend, contracts, packages).

The main project is the `apps/frontend` folder. Everytime we start the frontend it will also compile the contracts (under the `packages/contracts` folder) and deploy them if they are not deployed yet. This will allow to have up to date ABIs, addresses and types in the frontend.

### Frontend (apps/frontend) 🌐

A blazing-fast React application powered by Vite with Chakra UI, Framer Motion, and VeChain-Kit.

### Contracts (packages/contracts) 📜

Smart contracts in Solidity, managed with Hardhat for deployment on the Vechain Thor network.

### Packages 📦

Shared configurations and utility functions to unify and simplify the development process.

### Getting Started

Clone the repository, then install dependencies:

```bash
nvm use # Align your node version
```

```bash
yarn # Run this at the root level of the project
```

```bash
cp .env.example .env # copy the example file to the .env file containig base mnemonic
```

```bash
yarn solo-up # spin up a local vechain thor network (thor-solo)
```

```bash
yarn dev # deploy the contracts on the local thor-solo network and start the frontend
```

If you want to start the frontend or deploy the contracts against other networks, you can avoid starting the solo network, and just run the dev command against the network you want to use.

```bash
yarn dev:{network} # start the frontend on the devnet/testnet/mainnet network
```

If you need to redeploy the contracts you can either stop the solo network by running `yarn solo-down` and then start it again and run `yarn dev` again.

Optionally you can also delete the `stargateNFTContractAddress` address from the config file in the `packages/config/local.ts` (or testnet/mainnet.ts based on the network you are using) file and run the `yarn dev` command again.

## Smart contracts

### Compile contract and generate artifacts

```bash
  yarn contracts:compile
```

### Run tests

#### Intragetration tests

Note that tests will run on the thor solo network. The test environment will be automatically started by the command.

```bash
  yarn contracts:test:integration
  yarn contracts:test:integration:verbose ## to see the logs
```

#### Unit tests

Note that tests will run on the hardhat network.

```bash
  yarn contracts:test:unit
  yarn contracts:test:unit:verbose ## to see the logs
```

##### Run tests with coverage

Only unit tests have coverage option.

```bash
  yarn contracts:test:unit:coverage
```

Open the coverage report in the `packages/contracts/coverage/index.html` file in your browser to see the test coverage.

### Generate documentation

```bash
  yarn contracts:generate-docs
```

### Deploy contracts only (no frontend)

You can deploy the contracts without starting the frontend by running the following command:

```bash
  yarn contracts:deploy:{network}
```

This command will redeploy the contracts BUT WILL NOT save the addresses in the `packages/config/local.ts` file. You need to do that manually.

### Spin down the Solo Network

```bash
  yarn solo-down
```

### Clean docker solo network

```bash
  yarn solo-clean
```

### Fast forward periods and mine blocks

There are 2 scripts that can be used to mine any amount of blocks and fast forward any amount periods for a given validator.
The scripts work only against thor-solo.

#### Mine blocks

Run the following command to advance a desired amount of blocks in the thor-solo network:

`BLOCKS=10 yarn solo:mine-blocks`

#### Fast forward validator periods

`PERIODS=1 yarn solo:fast-forward-periods`

or specify the validator address:

`VALIDATOR_ADDRESS=0x PERIODS=1 yarn solo:fast-forward-periods`

NB: only 1 validator is available in the thor-solo network.

### Slither

Slither is running in a gha workflow every time there is any changes in the contracts folder.
It will report any issues found in the contracts.

It is possible to mark false positives by updating the `slither.config.json` file. Eg:

````json

```json
{
  "suppressions": [
    {
      "check": "reentrancy-eth",
      "file": "contracts/Stargate.sol",
      "function": "executeTransaction(uint256)",
      "reason": "CEI done; false positive"
    }
  ]
}
````

It is possible to:

- Mark an entire function as False Positive
- Mark a specific line of code as False Positive
- Mark a number of lines as False Positive

### Verify contracts

Optionally verify your smart contracts on Sourcify. This allows 3rd parties to view and independently verify all of the following:

- Source code
- Metadata
- Contract ABI
- Contract Bytecode
- Contract transaction ID

After deploying `SimpleStorage`, the console will print the address of the deployed contract. You can verify the contract on [sourcify.eth](https://repo.sourcify.dev/select-contract/):

```bash
yarn contracts:verify:mainnet <contract-address> <contract-name>
```

Read more about the verification process in the [packages/contracts/scripts/verify/README.md](packages/contracts/scripts/verify/README.md) file.

## Frontend App deployment

The frontend app is deployed using Vercel. The deployment is triggered automatically when a new Release is created on the main branch (please look at the [Release](https://github.com/vechain/stargate/releases) section).

- When something is pushed to develop the "Devnet" environment is deployed.
- When something is pushed to main the "Testnet" and "Beta" environments are deployed.
- When a release is created on the main branch the "Mainnet" environment is deployed.

In order to successfully deploy the frontend app in production, the following steps need to be followed:

1. Create a pr where the version in the `apps/frontend/package.json` file is updated. It should be a patch version bump, unless there are breaking changes, in which case it should be a major version bump. The version should be in the format `x.x.x`, where `x` is a number.
2. Once the pr is merged, create a new release on the main branch with the same version as the one in the pr. This will trigger the deployment of the frontend app to Vercel through the `on-production-release` workflow.
