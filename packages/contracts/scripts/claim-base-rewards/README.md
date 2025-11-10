## Claim Base Rewards

The aim of this script is to claim the base pending rewards for all the tokens in the StargateNFTV2 contracts before the hayabusa upgrade.

This script will fail if the rewards in the `.json` file are not correct so it should be called after the rewards are stopped or it will fail because the amounts do not match.

## Usage

This command is not available for devnet because it has no relevant information in the StargateNFTV2 contracts.

### Get rewards data

```bash
yarn contracts:get-claim-base-rewards-data:solo # or testnet, mainnet
```

### Claim rewards

By default, it will only print the transactions to be executed. To execute the transactions, set the `EXECUTE_TRANSACTIONS` environment variable to `true`.

```bash
yarn contracts:claim-base-rewards:solo # or testnet, mainnet

```

## Environment Variables

- `VITE_APP_ENV`: Environment configuration (local, testnet, mainnet)
- `MNEMONIC`: Mnemonic for the wallet to use for the transactions
- `BATCH_SIZE`: Batch size for the transactions
- `EXECUTE_TRANSACTIONS`: Whether to execute the transactions (true or false)
- `END_TOKEN_ID`: End token ID to process

## Output

The output is saved in the `data` folder in the `packages/contracts/scripts/claim-base-rewards` directory.

The output is saved in the `results` folder in the `packages/contracts/scripts/claim-base-rewards` directory.

## Verification

Once the rewards are claimed, you can verify the rewards by running the get rewards data script again and checking that length of the rewards data is 0 since the script will skip tokens with no base VTHO or delegation rewards.

```bash
yarn contracts:claim-base-rewards:solo # or testnet, mainnet
```
