# Lost Rewards Seeding Script

This script seeds lost rewards data into the StargateDelegation contract based on calculated compensation data.

## Overview

The script processes compensation data from the `../calculate/` directory and uses the `addLostRewards` function on the StargateDelegation contract to seed lost rewards for affected users. It handles multiple bug instances per token by summing rewards appropriately.

## Prerequisites

1. **Environment Setup**: Set the `VITE_APP_ENV` environment variable to the target network (`local`, `testnet`, or `mainnet`)
2. **Permissions**: The deployer account must have the `LOST_REWARDS_WHITELISTER_ROLE` on the StargateDelegation contract
3. **Compensation Data**: The corresponding compensation data file must exist in `../calculate/lost-rewards-compensation-{environment}.json`

## Usage

From root folder:

```bash
yarn contracts:seed-lost-rewards:testnet
```

## What the Script Does

1. **Loads Compensation Data**: Reads the appropriate JSON file based on the environment
2. **Processes Data**: Groups bug instances by tokenId and sums rewards per owner/token combination
3. **Validates Permissions**: Ensures the deployer has the required `LOST_REWARDS_WHITELISTER_ROLE`
4. **Shows Preview**: Displays a summary of data to be seeded and asks for confirmation
5. **Batched Execution**: Processes the seeding in batches to avoid gas limit issues
6. **Progress Tracking**: Shows detailed progress for each batch with transaction hashes

## Data Processing Logic

The script processes compensation data using the following logic:

1. For each owner in the compensation data
2. Groups all bug instances by tokenId
3. Sums the rewards for each tokenId
4. Creates arrays of `(owner, tokenId, totalRewards)` for the contract call

This ensures that if a user has multiple bug instances for the same token, the rewards are properly aggregated.

## Batch Processing

The script processes entries in batches of 50 (configurable via `BATCH_SIZE`) to:

- Avoid transaction gas limits
- Prevent overwhelming the network
- Allow for better error handling and progress tracking

## Error Handling

- Validates environment configuration
- Checks for compensation data file existence
- Verifies deployer permissions
- Handles batch processing errors with detailed logging
- Provides clear error messages for common issues

## Output

The script provides detailed logging including:

- Environment and network information
- Data summary statistics
- Processing progress
- Transaction hashes and gas usage
- Final completion statistics

## Important Notes

- **Confirmation Required**: The script will ask for confirmation before proceeding with the actual seeding
- **Irreversible**: Once seeded, lost rewards are stored in the contract mapping
- **Idempotency**: Running the script multiple times will override the previous data (be careful!)
