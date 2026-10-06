import { ethers, network } from "hardhat";
import { Contract, getAddress } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";

type Asset = {
  symbol: string;
  address: string;
  decimals: number;
};

type Deployment = {
  name: "mainnet" | "sepolia" | "localhost";
  factory: string | null;
  assets: Asset[];
};

type Deployments = Record<string, Deployment>;

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DEPLOYMENTS_PATH = path.join(__dirname, "..", "frontend", "deployments.json");
const ERC20_METADATA_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
];
const MAINNET_ASSETS: Asset[] = [
  { symbol: "WBTC", address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599", decimals: 8 },
  { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  { symbol: "USDS", address: "0xdC035D45d973E3EC169d2276DDab16f1e407384F", decimals: 18 },
];

function fullAssetList(tokens: Asset[]): Asset[] {
  return [{ symbol: "ETH", address: ZERO_ADDRESS, decimals: 18 }, ...tokens];
}

function writeDeployment(chainId: bigint, deployment: Deployment): void {
  const deployments: Deployments = existsSync(DEPLOYMENTS_PATH)
    ? JSON.parse(readFileSync(DEPLOYMENTS_PATH, "utf8"))
    : {};

  deployments[chainId.toString()] = deployment;
  writeFileSync(DEPLOYMENTS_PATH, `${JSON.stringify(deployments, null, 2)}\n`);
}

async function verifyMainnetAssets(): Promise<void> {
  for (const asset of MAINNET_ASSETS) {
    const code = await ethers.provider.getCode(asset.address);
    if (code === "0x") {
      throw new Error(`${asset.symbol} has no contract code at ${asset.address}`);
    }

    const token = new Contract(asset.address, ERC20_METADATA_ABI, ethers.provider);
    const [symbol, decimals] = await Promise.all([token.symbol(), token.decimals()]);
    console.log(
      `${asset.symbol}: observed symbol=${symbol}, decimals=${decimals}; expected symbol=${asset.symbol}, decimals=${asset.decimals}`
    );

    if (symbol !== asset.symbol || Number(decimals) !== asset.decimals) {
      throw new Error(
        `${asset.symbol} metadata mismatch: expected symbol=${asset.symbol}, decimals=${asset.decimals}; actual symbol=${symbol}, decimals=${decimals}`
      );
    }
  }
}

async function deployMocks(): Promise<Asset[]> {
  const mockErc20 = await ethers.getContractFactory("MockERC20");
  const mockNoReturnErc20 = await ethers.getContractFactory("MockNoReturnERC20");

  const wbtc = await mockErc20.deploy("Mock Wrapped BTC", "WBTC", 8);
  const usdt = await mockNoReturnErc20.deploy("Mock Tether USD", "USDT", 6);
  const usdc = await mockErc20.deploy("Mock USD Coin", "USDC", 6);
  const usds = await mockErc20.deploy("Mock USDS", "USDS", 18);
  await Promise.all([wbtc.waitForDeployment(), usdt.waitForDeployment(), usdc.waitForDeployment(), usds.waitForDeployment()]);

  return [
    { symbol: "WBTC", address: getAddress(await wbtc.getAddress()), decimals: 8 },
    { symbol: "USDT", address: getAddress(await usdt.getAddress()), decimals: 6 },
    { symbol: "USDC", address: getAddress(await usdc.getAddress()), decimals: 6 },
    { symbol: "USDS", address: getAddress(await usds.getAddress()), decimals: 18 },
  ];
}

async function main() {
  if (network.name === "hardhat") {
    throw new Error(
      "Refusing to deploy on the in-process hardhat network. Those contracts disappear when this process exits. Run: npx hardhat run scripts/deploy.ts --network localhost"
    );
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  let name: Deployment["name"];
  let tokens: Asset[];

  if (chainId === 1n) {
    await verifyMainnetAssets();
    console.log("Mainnet asset metadata check passed.");
    if (process.env.CHECK_ONLY === "true") {
      return;
    }
    name = "mainnet";
    tokens = MAINNET_ASSETS;
  } else if (chainId === 31337n || chainId === 11155111n) {
    name = chainId === 31337n ? "localhost" : "sepolia";
    const [deployer] = await ethers.getSigners();
    console.log("Deploying with account:", deployer.address);
    tokens = await deployMocks();
  } else {
    throw new Error(`Unsupported chain ID ${chainId}. Supported chains are 1, 11155111, and 31337.`);
  }

  const [deployer] = await ethers.getSigners();
  if (chainId === 1n) {
    console.log("Deploying with account:", deployer.address);
  }
  const factory = await ethers.getContractFactory("MilestoneProjectFactory");
  const deployedFactory = await factory.deploy(
    tokens[0].address,
    tokens[1].address,
    tokens[2].address,
    tokens[3].address
  );
  await deployedFactory.waitForDeployment();
  const factoryAddress = getAddress(await deployedFactory.getAddress());

  writeDeployment(chainId, {
    name,
    factory: factoryAddress,
    assets: fullAssetList(tokens),
  });

  console.log("MilestoneProjectFactory deployed to:", factoryAddress);
  for (const token of tokens) {
    console.log(`${token.symbol}: ${token.address} (${token.decimals} decimals)`);
  }
}


main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});