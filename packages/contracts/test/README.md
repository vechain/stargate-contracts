# Smart Contract Tests

We organize smart contract tests by **feature**, **user story**, or **contract domain**, to avoid bloated files and improve maintainability.

Each major contract (e.g. `StargateNFT`, `NodeManagement`) has its own directory under `tests/`, and each file within tests a specific aspect such as deployment, upgradability, settings libraries, or staking/migration flows.

## Guidelines

- Use **one top-level `describe()` block per test file**
- Structure tests around contract behaviors and flows
- Keep file names descriptive (e.g. `Deployment.test.ts`, `Upgradeability.test.ts`)

## Test Sharding (CI Optimization)

We use **test sharding in GitHub Actions (GHA)** to speed up contract test execution by running subsets of tests in parallel.

### How It Works

Each test file top-level `describe()` includes a **shard ID**, like:

```ts
describe("shard1: StargateNFT Deployment", () => {
  ...
});
```

- GHA defines a matrix of shard values
- At runtime, a `SHARD` environment variable is set
- The test runner filters with `--grep $SHARD` to run only matching files

This pattern allows us to parallelize tests without changing the code structure.

### Adding a New Shard

1. Add a top-level describe() block to your test file with the appropriate shard ID prefix:

```ts
describe("shard102: StargateDelegation Settings", () => { ... });
```

2. Add the shard to the GitHub Actions matrix in `.github/workflows/unit-tests.yml`. Provide a human-readable `label` alongside the shard ID for job display.

To avoid conflicts, follow these shard ID ranges:

- StargateNFT shards start from 1
- StargateDel shards, from 100
- NodeManagement shards, from 1000
- Other shards, from 10000
