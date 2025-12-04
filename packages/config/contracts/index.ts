export * from "./type";

import { createTestnetConfig } from "./envs/testnet";
import { createMainnetConfig } from "./envs/mainnet";
import { createLocalConfig } from "./envs/local";
import { createDevnetConfig } from "./envs/devnet";
import { EnvConfig } from "./type";

export function getContractsConfig(env: EnvConfig) {
  switch (env) {
    case "testnet":
      return createTestnetConfig();
    case "mainnet":
      return createMainnetConfig();
    case "local":
      return createLocalConfig();
    case "devnet":
      return createDevnetConfig();

    default:
      throw new Error(`Invalid ENV "${env}"`);
  }
}

export function shouldRunSimulation() {
  return process.env.VITE_APP_ENV == "local" && process.env.RUN_SIMULATION === "true";
}

export function isE2E() {
  return process.env.VITE_APP_ENV == "e2e";
}
