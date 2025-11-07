import { GenericContainer, StartedTestContainer } from "testcontainers";

const THOR_SOLO_IMAGE = "vechain/thor:v2.4.0-rc.2";

/**
 * Creates and starts a VeChain Thor solo container for integration testing
 * @returns Promise<StartedTestContainer> - The started container instance
 */
export const createThorSoloContainer = async (): Promise<StartedTestContainer> => {
    return await new GenericContainer(THOR_SOLO_IMAGE)
        .withExposedPorts({ container: 8669, host: 8669 })
        .withUser("root")
        .withEnvironment({
            DOCKER: "1",
        })
        .withEntrypoint([
            "/bin/sh",
            "-c",
            "thor solo --hayabusa --on-demand --data-dir /data/thor --api-addr 0.0.0.0:8669 --api-cors '*' --verbosity 10 --block-interval 3600",
        ])
        .start();
};
