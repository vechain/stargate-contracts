import { EnvConfig } from "@repo/config/contracts";
import { ethers } from "hardhat";
import { getConfig } from "@repo/config";

async function main() {
    if (!process.env.VITE_APP_ENV) {
        throw new Error("Missing VITE_APP_ENV");
    }

    const [deployer] = await ethers.getSigners();
    console.log(`Deployer address: ${deployer.address}`);

    const config = getConfig(process.env.VITE_APP_ENV as EnvConfig);

    console.log(`Deploying Stargate contract on network: ${config.network.name}`);

    console.log(`Deploying Stargate Clock...`);
    const stargateClockFactory = await ethers.getContractFactory("Clock");
    const stargateClock = await stargateClockFactory.deploy();
    await stargateClock.waitForDeployment();
    const stargateClockAddress = await stargateClock.getAddress();
    console.log(`Stargate Clock deployed at address: ${stargateClockAddress}`);

    // deploy stargate implementation
    console.log(`Deploying new Stargate implementation...`);
    const stargateFactory = await ethers.getContractFactory("Stargate", {
        libraries: {
            Clock: stargateClockAddress,
        },
    });
    const newImplementation = await stargateFactory.deploy();
    await newImplementation.waitForDeployment();
    const newImplementationAddress = await newImplementation.getAddress();
    console.log(`New StargateNFT implementation deployed at address: ${newImplementationAddress}`);

    // upgrade stargatenft proxy
    console.log(`Upgrading Stargate proxy...`);
    const stargateProxyAddress = config.stargateContractAddress;
    const stargateProxy = await ethers.getContractAt("Stargate", stargateProxyAddress);
    let tx = await stargateProxy.upgradeToAndCall(newImplementationAddress, "0x");
    await tx.wait();
    console.log(
        `Stargate proxy upgraded to new implementation at address: ${newImplementationAddress}`
    );

    console.log(`Revoking upgrader role from deployer...`);
    const upgraderRole = await stargateProxy.UPGRADER_ROLE();
    tx = await stargateProxy.renounceRole(upgraderRole, deployer.address);
    await tx.wait();
    console.log(`Upgrader role revoked from deployer at address: ${deployer.address}`);

    console.log("--------------------------------");
    console.log(`Stargate proxy upgraded and upgrader role revoked`);

    console.log("Execution completed");
    process.exit(0);
}

// Execute the main function
main();
