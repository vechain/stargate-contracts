import { BaseContract, ContractFactory, Interface } from "ethers";
import { ethers } from "hardhat";
import { getImplementationAddress } from "@openzeppelin/upgrades-core";
import { AddressUtils } from "@repo/utils";
import { DeployUpgradeOptions } from "./type";

export const deployProxy = async (
  contractNameOrFactory: string | ContractFactory,
  args: any[],
  libraries: { [libraryName: string]: string } = {},
  logOutput: boolean = false,
  version?: number,
): Promise<BaseContract> => {
  const { factory: Contract, name: contractName } = await getContractNameAndFactory(
    contractNameOrFactory,
    libraries,
  );
  // Deploy the implementation contract
  const implementation = await Contract.deploy();
  await implementation.waitForDeployment();
  logOutput && console.log(`${contractName} impl.: ${await implementation.getAddress()}`);

  // Deploy the proxy contract, link it to the implementation and call the initializer
  const proxyFactory = await ethers.getContractFactory("StargateProxy");
  const proxy = await proxyFactory.deploy(
    await implementation.getAddress(),
    getInitializerData(Contract.interface, args, version),
  );
  await proxy.waitForDeployment();
  logOutput && console.log(`${contractName} proxy: ${await proxy.getAddress()}`);

  const newImplementationAddress = await getImplementationAddress(
    ethers.provider,
    await proxy.getAddress(),
  );
  if (!AddressUtils.compareAddresses(newImplementationAddress, await implementation.getAddress())) {
    throw new Error(
      `The implementation address is not the one expected: ${newImplementationAddress} !== ${await implementation.getAddress()}`,
    );
  }

  // Return an instance of the contract using the proxy address
  return Contract.attach(await proxy.getAddress());
};

export const deployUpgradeableWithoutInitialization = async (
  contractNameOrFactory: string | ContractFactory,
  libraries: { [libraryName: string]: string } = {},
  logOutput: boolean = false,
): Promise<string> => {
  const { factory: Contract, name: contractName } = await getContractNameAndFactory(
    contractNameOrFactory,
    libraries,
  );
  const implementation = await Contract.deploy();
  await implementation.waitForDeployment();
  logOutput && console.log(`${contractName} impl.: ${await implementation.getAddress()}`);

  // Deploy the proxy contract without initialization
  const proxyFactory = await ethers.getContractFactory("StargateProxy");
  const proxy = await proxyFactory.deploy(await implementation.getAddress(), "0x");
  await proxy.waitForDeployment();
  logOutput && console.log(`${contractName} proxy: ${await proxy.getAddress()}`);

  const newImplementationAddress = await getImplementationAddress(
    ethers.provider,
    await proxy.getAddress(),
  );
  if (!AddressUtils.compareAddresses(newImplementationAddress, await implementation.getAddress())) {
    throw new Error(
      `The implementation address is not the one expected: ${newImplementationAddress} !== ${await implementation.getAddress()}`,
    );
  }

  // Return the proxy address
  return await proxy.getAddress();
};

export const initializeProxy = async (
  proxyAddress: string,
  contractNameOrFactory: string | ContractFactory,
  args: any[],
  libraries: { [libraryName: string]: string } = {},
  version?: number,
): Promise<BaseContract> => {
  const { factory: Contract, name: contractName } = await getContractNameAndFactory(
    contractNameOrFactory,
    libraries,
  );
  // Prepare the initializer data using getInitializerData
  const initializerData = getInitializerData(Contract.interface, args, version);

  // Interact with the proxy contract to call the initializer using the prepared initializer data
  const signer = (await ethers.getSigners())[0];
  const tx = await signer.sendTransaction({
    to: proxyAddress,
    data: initializerData,
    gasLimit: 10_000_000,
  });
  await tx.wait();

  // Return an instance of the contract using the proxy address
  return Contract.attach(proxyAddress);
};

export const upgradeProxy = async (
  previousVersionContractName: string,
  newVersionContractNameOrFactory: string | ContractFactory,
  proxyAddress: string,
  args: any[] = [],
  options?: {
    version?: number;
    libraries?: { [libraryName: string]: string };
    logOutput?: boolean;
    forceInitialization?: boolean;
  },
): Promise<BaseContract> => {
  const { factory: Contract, name: contractName } = await getContractNameAndFactory(
    newVersionContractNameOrFactory,
    options?.libraries,
  );

  const implementation = await Contract.deploy();
  await implementation.waitForDeployment();

  const currentImplementationContract = await ethers.getContractAt(
    previousVersionContractName,
    proxyAddress,
  );

  options?.logOutput &&
    console.log(`${contractName} impl.: ${await implementation.getAddress()}`);

  const tx = await currentImplementationContract.upgradeToAndCall(
    await implementation.getAddress(),
    args.length > 0 || options?.forceInitialization
      ? getInitializerData(Contract.interface, args, options?.version)
      : "0x",
  );
  await tx.wait();

  const newImplementationAddress = await getImplementationAddress(ethers.provider, proxyAddress);
  if (!AddressUtils.compareAddresses(newImplementationAddress, await implementation.getAddress())) {
    throw new Error(
      `The implementation address is not the one expected: ${newImplementationAddress} !== ${await implementation.getAddress()}`,
    );
  }
  return Contract.attach(proxyAddress);
};

export const deployAndUpgrade = async (
  contractNames: string[],
  args: any[][],
  options: DeployUpgradeOptions,
): Promise<BaseContract> => {
  if (contractNames.length === 0) throw new Error("No contracts to deploy");

  if (contractNames.length !== args.length)
    throw new Error("Contract names and arguments must have the same length");

  if (options.libraries && contractNames.length !== options.libraries.length)
    throw new Error("Contract names and libraries must have the same length");

  if (options.versions && contractNames.length !== options.versions.length)
    throw new Error("Contract names and versions must have the same length");

  // 1. Deploy proxy and first implementation
  const contractName = contractNames[0];
  const contractArgs = args[0];

  let proxy = await deployProxy(
    contractName,
    contractArgs,
    options?.libraries?.[0],
    options.logOutput,
    options.versions?.[0],
  );

  // 2. Upgrade the proxy to the next versions
  for (let i = 1; i < contractNames.length; i++) {
    const previousVersionContractName = contractNames[i - 1];
    const newVersionContractName = contractNames[i];
    const contractArgs = args[i];

    proxy = await upgradeProxy(
      previousVersionContractName,
      newVersionContractName,
      await proxy.getAddress(),
      contractArgs,
      {
        version: options.versions?.[i],
        libraries: options.libraries?.[i],
        logOutput: options.logOutput,
        forceInitialization: options.forceInitialization?.[i],
      },
    );
  }

  return proxy;
};

export function getInitializerData(contractInterface: Interface, args: any[], version?: number) {
  const initializer = version ? `initializeV${version}` : "initialize";

  const fragment = contractInterface.getFunction(initializer);
  if (!fragment) {
    throw new Error(`Contract initializer not found`);
  }
  return contractInterface.encodeFunctionData(fragment, args);
}

async function getContractNameAndFactory(
  contractNameOrFactory: string | ContractFactory,
  libraries: { [libraryName: string]: string } = {},
): Promise<{ factory: ContractFactory; name: string }> {
  if (typeof contractNameOrFactory === "string") {
    // If contractName is a string, get the ContractFactory
    return {
      factory: await ethers.getContractFactory(contractNameOrFactory, { libraries }),
      name: contractNameOrFactory,
    };
  } else {
    // If contractNameOrFactory is a ContractFactory, use it directly
    return {
      factory: contractNameOrFactory,
      name: contractNameOrFactory.constructor.name,
    };
  }
}
