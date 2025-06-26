import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

import { ChakraProvider } from "@chakra-ui/react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { persister, queryClient } from "./utils/queryClient.ts";
import { VeChainKitProviderWrapper } from "./provider/index.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <ChakraProvider>
        <VeChainKitProviderWrapper>
          <App />
        </VeChainKitProviderWrapper>
      </ChakraProvider>
    </PersistQueryClientProvider>
  </React.StrictMode>
);
