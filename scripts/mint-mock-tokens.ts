import { ethers } from "hardhat";
import { getAddress, parseEther, parseUnits, toBeHex } from "ethers";
import { readFileSync } from "fs";
import path from "path";

type Asset = {
  symbol: string;
  address: string;
  decimals: number;
};

type Deployment = {
  factory: string | null;
  assets: Asset[];
};

type Deployments = Record<string, Deployment>;

const DEPLOYMENTS_PATH = path.join(__dirname, "..", "frontend", "deployments.json");
const MOCK_AMOUNTS: Record<string, string> = {
  WBTC: "10",
  USDT: "100000",
  USDC: "100000",
  USDS: "100000",
};
const MINT_ABI = ["function mint(address to, uint256 amount)"];

function recipientsFromEnv(): string[] {
  const supplied = process.env.MINT_TO?.trim();
  if (!supplied) {
    throw new Error(
      "MINT_TO is required. Usage: MINT_TO=0xabc,0xdef npx hardhat run scripts/mint-mock-tokens.ts --network localhost"
    );
  }

  return supplied.split(",").map((recipient) => {
    const trimmed = recipient.trim();
    try {
      return getAddress(trimmed);
    } catch {
      throw new Error(
        `Invalid MINT_TO recipient "${trimmed}". Usage: MINT_TO=0xabc,0xdef npx hardhat run scripts/mint-mock-tokens.ts --network localhost`
      );
    }
  });
}

async function main() {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  if (chainId === 1n) {
    throw new Error("Refusing to mint mock tokens on mainnet.");
  }

  const deployment = (JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8")) as Deployments)[chainId.toString()];
  if (!deployment?.factory) {
    throw new Error(`No deployed factory entry for chain ${chainId} in frontend/deployments.json.`);
  }

  const recipients = recipientsFromEnv();
  const assets = deployment.assets.filter((asset) => asset.symbol in MOCK_AMOUNTS);
  if (assets.length !== 4) {
    throw new Error(`Deployment entry for chain ${chainId} must contain WBTC, USDT, USDC, and USDS.`);
  }

  for (const recipient of recipients) {
    if (chainId === 31337n && (await ethers.provider.getBalance(recipient)) < parseEther("100")) {
      await ethers.provider.send("hardhat_setBalance", [recipient, toBeHex(parseEther("100"))]);
      console.log(`Set ${recipient} ETH balance to 100 ETH.`);
    }

    for (const asset of assets) {
      const amount = parseUnits(MOCK_AMOUNTS[asset.symbol], asset.decimals);
      const token = new ethers.Contract(asset.address, MINT_ABI, (await ethers.getSigners())[0]);
      const transaction = await token.mint(recipient, amount);
      await transaction.wait();
      console.log(`Minted ${MOCK_AMOUNTS[asset.symbol]} ${asset.symbol} to ${recipient}.`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
