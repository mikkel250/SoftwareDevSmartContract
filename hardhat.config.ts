import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";
dotenv.config();

function networkFromArgv(): string | undefined {
  const argv = process.argv;
  const flagIndex = argv.indexOf("--network");
  if (flagIndex >= 0 && argv[flagIndex + 1] && !argv[flagIndex + 1].startsWith("-")) {
    return argv[flagIndex + 1];
  }
  for (const arg of argv) {
    if (arg.startsWith("--network=")) {
      const name = arg.slice("--network=".length);
      return name.length > 0 ? name : undefined;
    }
  }
  return undefined;
}

function envGatedNetwork(
  networkName: string,
  rpcUrlEnvVar: string,
  privateKeyEnvVar: string,
  missingRpcUrlError: string
): { url: string; accounts: string[] } | undefined {
  const url = process.env[rpcUrlEnvVar]?.trim();
  const selectedNetwork = networkFromArgv() || process.env.HARDHAT_NETWORK;

  if (!url) {
    if (selectedNetwork === networkName) {
      throw new Error(missingRpcUrlError);
    }
    return undefined;
  }

  return {
    url,
    accounts: process.env[privateKeyEnvVar] ? [process.env[privateKeyEnvVar]!] : [],
  };
}

const sepolia = envGatedNetwork(
  "sepolia",
  "SEPOLIA_RPC_URL",
  "SEPOLIA_PRIVATE_KEY",
  "SEPOLIA_RPC_URL is not set. Copy .env.example to .env and set SEPOLIA_RPC_URL before using the Sepolia network."
);

const mainnet = envGatedNetwork(
  "mainnet",
  "MAINNET_RPC_URL",
  "MAINNET_PRIVATE_KEY",
  "MAINNET_RPC_URL is not set. Copy .env.example to .env and set MAINNET_RPC_URL before using the mainnet network."
);

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    ...(sepolia ? { sepolia } : {}),
    ...(mainnet ? { mainnet } : {}),
  },
};

export default config;
