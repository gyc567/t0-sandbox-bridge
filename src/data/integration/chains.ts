/**
 * Blockchain + stablecoin enums from spec §5.2.
 * Testnets (Goerli/Nile/Chapel) per spec §1.3 / §7.1.
 */

export type Blockchain = "BSC" | "ETH" | "TRON";
export type Testnet = "Chapel" | "Goerli" | "Nile";

export interface ChainSpec {
  code: Blockchain;
  name: string;
  enumValue: number;
  /** Testnet for sandbox */
  testnet: Testnet;
  /** USDT contract — mainnet */
  contract: string;
}

export const CHAINS: readonly ChainSpec[] = [
  {
    code: "BSC",
    name: "BNB Smart Chain",
    enumValue: 10,
    testnet: "Chapel",
    contract: "0x55d398326f99059fF775485246999027B3197955",
  },
  {
    code: "ETH",
    name: "Ethereum",
    enumValue: 20,
    testnet: "Goerli",
    contract: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
  },
  {
    code: "TRON",
    name: "Tron",
    enumValue: 100,
    testnet: "Nile",
    contract: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t",
  },
];

export const STABLECOIN = {
  code: "USDT",
  name: "Tether USD",
  enumValue: 10,
} as const;
