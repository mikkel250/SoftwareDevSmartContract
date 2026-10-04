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

function sepoliaNetwork(): { url: string; accounts: string[] } | undefined {
  const url = process.env.SEPOLIA_RPC_URL?.trim();
  const selectedNetwork = networkFromArgv() || process.env.HARDHAT_NETWORK;

  if (!url) {
    if (selectedNetwork === "sepolia") {
      throw new Error(
        "SEPOLIA_RPC_URL is not set. Copy .env.example to .env and set SEPOLIA_RPC_URL before using the Sepolia network."
      );
    }
    return undefined;
  }

  return {
    url,
    accounts: process.env.SEPOLIA_PRIVATE_KEY ? [process.env.SEPOLIA_PRIVATE_KEY] : [],
  };
}

const sepolia = sepoliaNetwork();

const config: HardhatUserConfig = {
  solidity: "0.8.28",
  networks: {
    ...(sepolia ? { sepolia } : {}),
  },
};

export default config;
