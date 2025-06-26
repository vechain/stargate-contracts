import renderer from "react-test-renderer";
import React from "react";
import { test, expect } from "vitest";
import App from "../src/App";
import { DAppKitProvider } from "@vechain/vechain-kit";
import { WalletConnectOptions } from "@vechain/vechain-kit";

test("Welcome", async () => {
  const walletConnectOptions: WalletConnectOptions = {
    projectId: "a0b855ceaf109dbc8426479a4c3d38d8",
    metadata: {
      name: "Sample VeChain dApp",
      description: "A sample VeChain dApp",
      url: window.location.origin,
      icons: [``],
    },
  };
  const component = renderer.create(
    <React.StrictMode>
      <DAppKitProvider
        nodeUrl={"https://testnet.vechain.org/"}
        genesis={"test"}
        usePersistence
        walletConnectOptions={walletConnectOptions}
      >
        <App />
      </DAppKitProvider>
    </React.StrictMode>
  );

  const tree = component.toJSON();
  expect(tree).toBeDefined();
});
