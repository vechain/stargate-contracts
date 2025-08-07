# Burned NFT Rewards Claiming Script

This script claims lost rewards for users whose NFTs have been burned (unstaked) but still have eligible compensation.

## Overview

The `claimBurnedNftRewards.ts` script processes the compensation data and automatically claims rewards for burned NFTs by calling the `claimLostRewardsInBatch(owners, tokenIds)` function on the StargateDelegation contract.

## Prerequisites

1. **Lost rewards must be seeded first**: Run the seeding script (`seedLostRewards.ts`) before attempting to claim rewards
2. **Compensation data**: The script requires the compensation data file (`lost-rewards-compensation-{environment}.json`)

## How It Works

1. **Data Loading**: Loads compensation data from the JSON file
2. **Filtering**: Iterates through all entries and calls `stargateNFT.tokenExists()` function to check if the NFT is burned
3. **Claiming**: Calls `claimLostRewardsInBatch(owners, tokenIds)` for each batch of owners
4. **Reporting**: Provides detailed success/failure statistics

## Usage

### Local/Solo Network

From root folder:

```bash
yarn contracts:claim-burned-nft-rewards:testnet
```

## Environment Variables

- `VITE_APP_ENV`: Environment configuration (local, testnet, mainnet)

### Error Handling

- **No rewards found**: Script skips entries where `claimableLostRewards()` returns 0
- **Already claimed**: Claims that were already processed will be skipped
- **Failed claims**: Individual failures don't stop the entire process

### Batch Processing

- Claims are processed individually (not in batches like seeding)
- Each claim has a 1-second delay to avoid network congestion
- Conservative gas limits are used (500,000 gas per claim)

## Expected Output

```
=== Burned NFT Rewards Claiming Script ===
Environment: testnet
Network: VeChain Testnet (vechain_testnet)
Deployer address: 0x...
StargateDelegation contract: 0x...

📂 Loading compensation data...
📊 Data Summary:
  • Total bug instances: 1684
  • Burned NFTs found: 306
  • Burned NFT total rewards: 0.0 VTHO
  • Bug type distribution: { burned_nft: 2, base: 1390, ... }

🔄 Processing burned NFT compensation data...
📋 Burned NFT entries found: 2
  • Unique owners: 2
  • Total VTHO to claim: 734398782000000000 wei

📋 Preview of burned NFT entries to be claimed:
  1. Owner: 0x976EA7... | Token: 100007 | Amount: 367199391000000000 wei
  2. Owner: 0x14dC79... | Token: 100008 | Amount: 367199391000000000 wei

🚀 Starting claiming process...
  ⏳ Claiming for owner 0x976EA7... token 100007 (367199391000000000 wei)...
    📝 Transaction submitted: 0x...
    ✅ Claimed successfully! Gas used: 42,853

🎉 Burned NFT rewards claiming completed!
✅ Successful claims: 2
❌ Failed claims: 0
📊 Total entries processed: 2
```

## Troubleshooting

### No Burned NFT Entries Found

This can happen when:

- No NFTs were burned during the analyzed period
- All burned NFT rewards were already claimed
- The compensation calculation didn't identify any burned NFT cases

### Claims Failing

Common reasons for failed claims:

- **Already claimed**: Rewards were previously claimed
- **Not seeded**: Lost rewards weren't seeded into the contract
- **Invalid permissions**: Contract access issues
- **Gas issues**: Transaction reverted due to gas problems

### Contract Integration

The script uses:

- `claimableLostRewards(owner, tokenId)`: Check available rewards
- `claimLostRewards(owner, tokenId)`: Claim the rewards
- Both functions are part of the StargateDelegation contract V3

## Security Considerations

- The script only claims rewards for legitimate burned NFT entries
- Each claim is validated before execution using `claimableLostRewards()`
- Failed claims are logged but don't affect other claims
- Conservative gas limits prevent excessive gas consumption
