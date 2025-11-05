# Smart Contract Tests

We have 2 type of tests:

- Unit tests
- Integration tests

Integration tests are automatically run on the thor-solo network. Since we are running against the thor-solo network and the coverage plugin is not compatible with it, we dont have a coverage report for them.

Unit tests are run on the hardhat network and we have a coverage report for them. The contracts that interact with the tested contracts are mocked and stored under the `test/mocks` folder.

## How to run the tests

### Unit tests

```bash
yarn test:hardhat
```

### Integration tests

```bash
yarn test:thor-solo
```

### Coverage

```bash
yarn test:coverage:solidity
```

## Guidelines

- Use **one top-level `describe()` block per test file**
- We setup the state of the contracts before each test and clean it up after each test to ensure each test is independent
  - We use the `createThorSoloContainer` helper to start the thor-solo network
  - We use the `getOrDeployContracts` helper to deploy the contracts
- Structure tests around contract behaviors and flows
- Keep file names descriptive (e.g. `Deployment.test.ts`, `Upgradeability.test.ts`)

## Test Sharding (CI Optimization)

We use **test sharding in GitHub Actions (GHA)** to speed up contract test execution by running subsets of tests in parallel.

### How It Works

Each test file top-level `describe()` includes a **shard ID**, like:

```ts
describe("shard-i1: Boost Maturity Period", () => {
  ...
});
```

- GHA defines a matrix of shard values
- At runtime, a `SHARD` environment variable is set
- The test runner filters with `--grep $SHARD` to run only matching files

This pattern allows us to parallelize tests without changing the code structure.

### Adding a New Shard

1. Add a top-level describe() block to your test file with the appropriate shard ID prefix:

For integration tests:

- Prefix with `shard-i`
- Use the shard number

```ts
describe("shard-i1: Delegation", () => { ... });
```

For unit tests:

- Prefix with `shard-u`
- Use the shard number

```ts
describe("shard-u1: Delegation", () => { ... });
```

2. Add the shard to the GitHub Actions matrix in `.github/workflows/unit-tests.yml` and `.github/workflows/integration-tests.yml`. Provide a human-readable `label` alongside the shard ID for job display.
