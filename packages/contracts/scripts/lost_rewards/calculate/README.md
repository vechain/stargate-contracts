# Lost Rewards Compensation Script

This script analyzes the StargateDelegation contract to identify and calculate compensation for users affected by a rewards accumulation bug. The script performs comprehensive event-driven analysis to ensure accurate compensation attribution across complex ownership and delegation scenarios.

## The Problem

### Bug Description

The StargateDelegation contract had a bug where users who claimed their rewards **late** (after complete delegation periods had elapsed) would lose VTHO rewards. The bug caused rewards to be reset to accumulate from the current block instead of continuing from where they left off.

**Example Bug Scenario:**

- Delegation period: 60,480 blocks (~7 days)
- User delegates at block 100,000, rewards start accumulating at block 100,100 (only for new NFTs with maturity period; migrated NFTs start immediately)
- First period completes at block 160,580 (100,100 + 60,480)
- User claims at block 165,000 (4,420 blocks late)
- **Bug Impact**:
  1. User loses 4,420 blocks worth of rewards from the late claim
  2. **Critical**: Next delegation period resets to start from block 165,000 instead of continuing from 160,580
  3. This creates a cascading effect where future periods are also shifted and potentially affected

### Why Compensation is Needed

Users lost significant VTHO rewards through no fault of their own. The bug had two impacts:

1. **Immediate loss**: Late claims lost accumulated rewards
2. **Cascading effect**: Future delegation periods reset incorrectly, potentially causing more issues

This script calculates the exact amount each user lost and determines who should receive compensation based on NFT ownership at the time of each affected claim.

## Complex Scenarios & Edge Cases

### Scenario 1: Basic Late Claim

```
1. User A delegates NFT #123
2. User A claims late → loses rewards + next period resets incorrectly
3. Compensation: User A receives lost VTHO
```

### Scenario 2: Multiple Delegation Cycles (Auto-Renewal vs Manual)

```
Case A - Auto-Renewal Enabled (isDelegationForever: true):
1. User A delegates NFT #123 (auto-renewal ON)
2. User A claims late → loses rewards (Bug #1)
3. Delegation continues automatically (no new delegation event)
4. User A claims late again → loses rewards (Bug #2, compounded by reset from Bug #1)
5. Compensation: User A receives lost VTHO from both instances

Case B - Auto-Renewal Disabled (isDelegationForever: false):
1. User A delegates NFT #123 (auto-renewal OFF)
2. User A claims late within first period → loses rewards (Bug #1)
3. Delegation automatically ends after first period (no exit event needed)
4. User A claims after auto-end → NO BUG (delegation inactive, no compensation)
5. User A manually delegates again (new delegation event)
6. User A claims late → loses rewards (Bug #2)
7. Compensation: User A receives lost VTHO from Bug #1 and Bug #2 only

Case C - Manual Exit Request:
1. User A delegates NFT #123 (auto-renewal ON)
2. User A claims late → loses rewards (Bug #1)
3. User A requests delegation exit
4. User A claims after exit takes effect → NO BUG (delegation inactive)
5. Compensation: User A receives lost VTHO from Bug #1 only
```

### Scenario 3: NFT Transfer During Delegation

```
1. User A delegates NFT #123
2. User A claims late → loses rewards
3. User A transfers NFT #123 to User B
4. User B delegates NFT #123
5. User B claims late → loses rewards
6. Compensation:
   - User A receives lost VTHO from step 2
   - User B receives lost VTHO from step 5
```

### Scenario 4: Complex Multi-Owner Timeline

```
1. User A delegates NFT #123
2. User A claims (bug occurs)
3. User A requests delegation exit
4. User A claims again (after exit) → no compensation
5. User A transfers NFT #123 to User B
6. User B delegates NFT #123
7. User B claims late (bug occurs)
8. Compensation:
   - User A: lost VTHO from step 2 only
   - User B: lost VTHO from step 7
   - Step 4 excluded (claim after delegation ended)
```

### Scenario 5: Burned NFTs

```
1. User A delegates NFT #123
2. User A claims late → loses rewards
3. User A burns/unstakes NFT #123
4. Compensation: User A receives lost VTHO (historical ownership tracked)
```

### Scenario 6: Claims After Delegation Ends

```
Auto-Renewal OFF Example:
1. User A delegates NFT #123 (auto-renewal OFF)
2. First period ends automatically at block X
3. User A claims at block X+100 → no compensation
4. Rationale: Delegation auto-ended, was not active during claim

Manual Exit Example:
1. User A delegates NFT #123 (auto-renewal ON)
2. User A requests delegation exit (ends at block Y)
3. User A claims at block Y+100 → no compensation
4. Rationale: User explicitly ended delegation before claim
```

## How The Script Operates

### Step 1: Contract Setup

- Fetches delegation period from StargateDelegation contract
- Connects to StargateNFT and StargateDelegation contracts

### Step 2: Event Collection

Fetches all relevant blockchain events:

- **TokenMinted**: Initial ownership and token levels
- **DelegationSimulationStarted**: When delegations begin
- **DelegationRewardsClaimed**: When users claim rewards
- **DelegationExitRequested**: When users request to exit
- **Transfer**: NFT ownership changes
- **TokenBurned**: When NFTs are burned

### Step 3: Timeline Construction

- Groups events by token ID
- Creates chronological timeline for each NFT
- Tracks ownership changes through transfer events

### Step 4: Bug Analysis

For each token with reward claims:

1. **Ownership Tracking**: Maintains current owner throughout timeline
2. **Delegation State**: Tracks active vs. ended delegations including:
   - **Auto-renewal ON** (`isDelegationForever: true`): Delegation continues until explicit exit
   - **Auto-renewal OFF** (`isDelegationForever: false`): Delegation auto-ends after first period
   - **Manual exits**: Explicit exit requests override auto-renewal settings
3. **Claim Analysis**: For each claim during active delegation:
   - Calculates complete periods elapsed
   - Determines if claim was late
   - Calculates lost blocks and VTHO rewards
   - Attributes compensation to owner at time of claim

### Step 5: Compensation Mapping

- Maps each bug instance to the NFT owner at time of claim
- Aggregates total compensation per owner address
- Handles burned NFTs using historical ownership data
- **Critical**: Only compensates claims made during active delegation periods

## Bug Detection Logic

The script implements precise bug detection with **cascading effect handling**:

```typescript
// Find effective accumulation start, accounting for previous bugs in same delegation
let effectiveAccumulationStartBlock = originalRewardsAccumulationStartBlock;

// Check for previous claims in this delegation cycle
const previousClaims = claimsInDelegation
  .filter((claim) => claim.blockNumber < currentClaimBlock)
  .sort((a, b) => a.blockNumber - b.blockNumber);

if (previousClaims.length > 0) {
  const lastPreviousClaimBlock =
    previousClaims[previousClaims.length - 1].blockNumber;

  // Check if previous claim was late (caused a bug reset)
  const blocksSinceOriginalStart =
    lastPreviousClaimBlock - originalRewardsAccumulationStartBlock;
  const completePeriodsAtPreviousClaim = Math.floor(
    blocksSinceOriginalStart / delegationPeriod,
  );

  if (completePeriodsAtPreviousClaim > 0) {
    const expectedPreviousClaimEndBlock =
      originalRewardsAccumulationStartBlock +
      completePeriodsAtPreviousClaim * delegationPeriod;

    if (lastPreviousClaimBlock > expectedPreviousClaimEndBlock) {
      // Previous claim was late! It reset the accumulation start
      effectiveAccumulationStartBlock = lastPreviousClaimBlock;
    }
  }
}

// Now calculate periods from the effective start (which may have been reset)
const blocksSinceEffectiveStart = claimBlock - effectiveAccumulationStartBlock;
const completePeriods = Math.floor(
  blocksSinceEffectiveStart / delegationPeriod,
);

if (completePeriods === 0) {
  // First period not complete from effective start - no bug possible
  return null;
}

// Find when last complete period ended from effective start
const lastCompletedPeriodEndBlock =
  effectiveAccumulationStartBlock + completePeriods * delegationPeriod;

if (claimBlock <= lastCompletedPeriodEndBlock) {
  // Claim was on time - no bug
  return null;
}

// Bug detected! Calculate lost rewards
const lostBlocks = claimBlock - lastCompletedPeriodEndBlock;
const lostRewards = rewardRate * BigInt(lostBlocks);
```

### Critical: Cascading Bug Effect

The script correctly handles the **cascading reset effect**:

1. **First Bug**: Late claim loses rewards + resets next period to start from claim block
2. **Subsequent Claims**: Calculated from the new reset point, not original schedule
3. **Chain Effect**: Each bug creates a new "effective accumulation start" for future calculations

**Example Timeline:**

```
Block 100,000: Delegation starts, accumulation begins at 100,100
Block 160,580: First period ends (100,100 + 60,480)
Block 165,000: User claims late → Bug #1
                - Loses 4,420 blocks of rewards
                - Next period now starts from 165,000 (not 160,580)
Block 225,480: Second period should end (165,000 + 60,480)
Block 230,000: User claims late → Bug #2
                - Loses 4,520 blocks of rewards
                - Next period now starts from 230,000
```

Without this logic, the script would incorrectly calculate Bug #2 from the original 100,100 start point!

## Compensation Rules

### ✅ **Eligible for Compensation**

- Claim occurred during **active delegation** (before auto-end or explicit exit)
- Claim happened **after at least one complete period**
- Claim was **late** (beyond the last completed period)
- NFT owner at time of claim receives compensation

### ❌ **Not Eligible for Compensation**

- Claims during first period (no complete periods yet)
- Claims after delegation ended due to:
  - **Auto-renewal OFF**: Delegation auto-ended after first period
  - **Explicit exit request**: User manually requested delegation exit
- Claims that were on time (within period boundaries)
- Claims on NFTs with zero reward rates

## Usage

### Basic Usage

```bash
# Mainnet analysis
yarn contracts:calculate-lost-rewards:mainnet

# Testnet analysis
yarn contracts:calculate-lost-rewards:testnet
```

### Advanced Usage

```bash
# Custom block range
START_BLOCK=22000000 END_BLOCK=22500000 yarn contracts:calculate-lost-rewards:mainnet

# Debug specific token (detailed logging)
DEBUG_TOKEN_ID=17105 yarn contracts:calculate-lost-rewards:mainnet

# Combine parameters
START_BLOCK=22000000 DEBUG_TOKEN_ID=17105 yarn contracts:calculate-lost-rewards:mainnet
```

## Output

### Console Output

```
🔗 Using network: vechain_mainnet
📅 Delegation period: 60480 blocks

📊 Step 1: Fetching all TokenMinted events...
✅ Found 15420 TokenMinted events

📊 Step 2: Fetching all delegation and transfer events...
✅ Found 2087 delegation started events
✅ Found 1119 rewards claimed events
✅ Found 156 delegation exit events
✅ Found 8934 transfer events
✅ Found 12 unstake events

📊 Step 3: Processing and organizing events by token...

📊 Step 4: Analyzing tokens for the bug...
🎯 Analyzing 360 tokens with reward claims...

📈 Analysis complete!
📊 Total tokens analyzed: 360
💰 Tokens with claims: 360
🐛 Bug instances found: 308
🔥 Burned NFTs found: 12
💸 Total compensation needed: 270,451.74 VTHO

👤 COMPENSATION SUMMARY:
📊 Unique owners affected: 245
💰 Total compensation: 270,451.74 VTHO
🔥 Burned NFT compensation: 1,250.45 VTHO

⏱️  Execution time: 45.23 seconds
💾 Results saved to: lost-rewards-compensation-mainnet.json
```

### Debug Output (with DEBUG_TOKEN_ID)

```
🔍 DEBUG Token 12345:
📊 Total events: 8
🎯 Token level: 3

📋 Event timeline:
  1. Block 100000: MINTED - owner: 0xUserA..., level: 3
  2. Block 100500: DELEGATIONSTARTED - delegator: 0xUserA..., accumulation starts: 100600
  ⚠️  Auto-renewal OFF - delegation will auto-end at block: 161080
  3. Block 161000: REWARDSCLAIMED - claimer: 0xUserA..., amount: 1000.0 VTHO
  4. Block 161500: REWARDSCLAIMED - claimer: 0xUserA..., amount: 500.0 VTHO (NO BUG - delegation ended)
  5. Block 162000: DELEGATIONSTARTED - delegator: 0xUserA..., accumulation starts: 162100
  🔄 Auto-renewal ON - delegation continues indefinitely
  6. Block 222600: REWARDSCLAIMED - claimer: 0xUserA..., amount: 300.0 VTHO

🔬 Detailed analysis starting...
📊 ANALYSIS SUMMARY for Token 12345:
  🐛 Bug instances found: 2
  💸 Total compensation: 350.0 VTHO

  🎯 Compensation breakdown:
    1. Owner 0xUserA...: 250.0 VTHO (Claim at block 161000, lost 420 blocks)
    2. Owner 0xUserA...: 100.0 VTHO (Claim at block 222600, lost 120 blocks)

  ✅ Claim at block 161500 excluded - delegation had auto-ended
```

### JSON Output Structure

File: `lost-rewards-compensation-{network}.json`

```json
{
  "summary": {
    "network": "vechain_mainnet",
    "executionTime": "45.23 seconds",
    "totalBugInstances": 308,
    "uniqueTokensAffected": 280,
    "uniqueOwnersAffected": 245,
    "burnedNftsFound": 12,
    "totalLostRewards": "270451743820157726719116",
    "totalLostRewardsEther": "270451.743820157726719116",
    "bugTypeDistribution": {
      "base": 150,
      "burned_nft": 12,
      "multiple_occurrences": 89,
      "multiple_transfers": 45,
      "multiple_claims_in_delegation": 12
    }
  },
  "compensationByOwner": [
    {
      "owner": "0x1234567890abcdef1234567890abcdef12345678",
      "totalRewards": "25450780000000000000000",
      "totalRewardsEther": "25450.78",
      "tokenCount": 3,
      "bugInstanceCount": 5,
      "tokens": ["5819", "4467", "1276"],
      "bugInstances": [
        {
          "tokenId": "5819",
          "claimBlock": 22189456,
          "rewards": "54179582638888888888888"
        }
      ]
    }
  ],
  "compensations": [
    {
      "tokenId": "5819",
      "owner": "0x1234567890abcdef1234567890abcdef12345678",
      "delegationStartBlock": 22145789,
      "rewardsAccumulationStartBlock": 22173633,
      "claimBlock": 22189456,
      "expectedAccumulationStartBlock": 22173633,
      "lostBlocks": 15823,
      "lostRewards": "54179582638888888888888",
      "lostRewardsEther": "54179.582638888888888888",
      "rewardRate": "3424999999999999999",
      "delegationStartTx": "0x1234...",
      "claimTx": "0x5678...",
      "type": "multiple_transfers"
    }
  ]
}
```

### Bug Type Classification

Each compensation entry includes a `tags` array to help debug and understand all characteristics of each bug instance:

- **`base`**: Always present - indicates a standard late claim bug
- **`burned_nft`**: Token was burned/unstaked (either by the bug victim or subsequent owner)
- **`multiple_occurrences`**: Token had multiple bug instances across different delegation cycles
- **`multiple_transfers`**: Token was transferred between users during the delegation period
- **`multiple_claims_in_delegation`**: Multiple claims happened within the same delegation cycle
- **`transferred`**: The bug victim transferred the token after experiencing the bug

**Tag System Benefits:**

- A single bug instance can have multiple tags (e.g., `["base", "burned_nft", "multiple_transfers"]`)
- No artificial priority system - all relevant characteristics are captured
- Better analysis capabilities for understanding complex scenarios

The `bugTagDistribution` field in the summary provides counts for each tag to help with analysis.

## Technical Implementation

### Performance Optimizations

- **Parallel Event Fetching**: Multiple contract calls executed simultaneously
- **Chunked Queries**: Large block ranges split into manageable chunks
- **Efficient Filtering**: Only analyzes tokens with actual reward claims

### Accuracy Features

- **Complete Event Timeline**: Chronological analysis prevents missed edge cases
- **Precise State Tracking**: Accurate delegation active/inactive status including auto-renewal logic
- **Transfer Awareness**: Correct ownership attribution through NFT transfers
- **Burned NFT Handling**: Historical ownership tracking for destroyed NFTs

### Error Handling

- **Zero Reward Rate Detection**: Skips analysis for tokens with no rewards
- **Network-Specific Configuration**: Automatic contract address resolution
- **Safe File Operations**: Prevents data loss with backup and validation

## Data Validation

The script includes comprehensive validation:

- Cross-references event data with contract state
- Verifies reward rate calculations
- Validates delegation period timings
- Ensures compensation amounts match blockchain events
- **Critical**: Validates delegation active status using auto-renewal flags

## Files Generated

1. **`lost-rewards-compensation-{network}.json`**: Complete compensation data
2. **Console logs**: Real-time progress and summary statistics
3. **Debug logs**: Detailed event analysis (when DEBUG_TOKEN_ID used)

This script ensures accurate, fair compensation for all users affected by the delegation rewards bug across all possible scenarios and edge cases! 🎯
