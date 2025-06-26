Those scripts are intended to be used on July 1st, 2025 for the release of Stargate delegation, for the VeChain Galactica version of the protocol.

All commands used to run the app, the contracts are using the main `deploy.ts` script, whilet the tests are using the `test/helper/deploy.ts` script.

The scripts in this folder are ordered, but can be executed independently. Eg: before releasing on mainnet we can test the deployment on testnet (by deploying also a custom set of legacy contracts and NodeManagement), or deploy on mainnet the Stargate contracts, then upgrade NodeManagement to version 3, then transfer roles and ownership to a new admin address.
