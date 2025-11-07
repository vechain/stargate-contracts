# Config Package

This package manages configuration files for the Stargate project.

### Scripts

#### `generateMockLocalConfig.mjs`

- **Purpose**: Generates a `local.ts` config file if it doesn't exist
- **Enhancement**: Now attempts to fetch the genesis block from thor-solo automatically
- **Fallback**: Uses a default genesis block if thor-solo is not running
- **Usage**: `yarn workspace @repo/config check-or-generate-local-config`

#### `updateAppConfigNetworkGenesis.mjs`

- **Purpose**: Update network genesis data on the current config (based on VITE_APP_ENV)
- **Usage**: `yarn workspace @repo/config test-genesis`

### Typical Workflows

#### Thor-Solo with Config Generation (Recommended)

```bash
# This will automatically:
# 1. Start thor-solo
# 2. Wait for it to be ready
# 3. Generate config with dynamic genesis
yarn solo-up

# Then start development (unchanged)
yarn dev
```

### API Endpoints Used

The scripts use the thor-solo REST API:

- `GET http://localhost:8669/blocks/0` - Fetches the genesis block (block 0)

### Files Created

- `packages/config/local.ts` - The local configuration file with dynamic genesis block data
