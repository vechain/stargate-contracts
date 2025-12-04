/// <reference types="@vechain/connex-types" />

/**
 * The type of network that we are connected to (indentified by the genesis block)
 * */
export type NETWORK_TYPE = "main" | "test" | "solo" | "devnet";

/**
 * A model for the VechainThor network that we are connected to
 * @field `id` - Unique ID for this network
 * @field `defaultNet` - If the network is a default network
 * @field `name` - A name for this network
 * @field `type` - What type of network is it? `main, test, solo or custom`
 * @field `urls` - A list of URLs for this network
 * @field `currentUrl` - The current URL that we are connected to
 * @field `explorerUrl` - The explorer URL for this network
 * @field `genesis` - The genesis block for the network
 * @field `blockTime` - The time it takes to mine a block in milliseconds
 */
export type Network = {
  id: string;
  defaultNet: boolean;
  name: string;
  type: NETWORK_TYPE;
  urls: string[];
  explorerUrl: string;
  genesis: any;
  blockTime: number;
};

export const DEFAULT_GAS_COEFFICIENT = 0;

export const BASE_GAS_PRICE = "0x000000000000000000000000000000000000626173652d6761732d7072696365";
