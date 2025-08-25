import { ethers } from "hardhat";

// Mock ENS mappings for local development
const MOCK_ENS_MAPPINGS: { [key: string]: string } = {
  "vitalik.eth": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "ens.eth": "0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7",
  "ethereum.eth": "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359",
  "worker.eth": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" // Hardhat account #1
};

// Mock reverse ENS mappings
const MOCK_REVERSE_ENS: { [key: string]: string } = {
  "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045": "vitalik.eth",
  "0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7": "ens.eth",
  "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359": "ethereum.eth",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8": "worker.eth"
};

async function resolveENSName(name: string): Promise<string | null> {
  const network = await ethers.provider.getNetwork();
  
  if (network.chainId === 31337n) {
    // Local Hardhat network - use mock data
    console.log(`Using mock ENS data for local development`);
    const address = MOCK_ENS_MAPPINGS[name.toLowerCase()] || null;
    // Ensure proper checksum format
    return address ? ethers.getAddress(address) : null;
  } else {
    // Real network - use actual ENS resolution
    console.log(`Using real ENS resolution on ${network.name}`);
    try {
      return await ethers.provider.resolveName(name);
    } catch (error: any) {
      console.log(`ENS resolution failed: ${error.message}`);
      return null;
    }
  }
}

async function lookupENSAddress(address: string): Promise<string | null> {
  const network = await ethers.provider.getNetwork();
  
  if (network.chainId === 31337n) {
    // Local Hardhat network - use mock data
    const checksumAddress = ethers.getAddress(address);
    return MOCK_REVERSE_ENS[checksumAddress] || null;
  } else {
    // Real network - use actual ENS reverse lookup
    try {
      return await ethers.provider.lookupAddress(address);
    } catch (error: any) {
      console.log(`ENS reverse lookup failed: ${error.message}`);
      return null;
    }
  }
}

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Interacting with ENS using account:", deployer.address);

  // Check network information
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  
  // Example ENS names to resolve
  const ensNames = [
    "vitalik.eth",
    "ens.eth", 
    "ethereum.eth"
  ];

  console.log("\n=== ENS Resolution Examples ===");
  
  for (const name of ensNames) {
    try {
      // Resolve ENS name to address using our hybrid resolver
      const address = await resolveENSName(name);
      if (address) {
        console.log(`${name} → ${address}`);
        
        // Get reverse lookup (address to ENS) using our hybrid resolver
        const reverseName = await lookupENSAddress(address);
        console.log(`   Reverse: ${address} → ${reverseName || "No ENS name"}`);
      } else {
        console.log(`${name} → Not found`);
      }
    } catch (error: any) {
      console.log(`${name} → Error: ${error.message}`);
    }
  }

  // Demonstrate using ENS in contract deployment
  console.log("\n=== Using ENS in Contract Deployment ===");
  
  // Example: Use ENS name instead of hardcoded address
  const workerENS = "worker.eth"; // This would be a real ENS name
  let workerAddress = await resolveENSName(workerENS);
  
  if (!workerAddress) {
    // Fallback to a generated address if ENS resolution fails
    workerAddress = ethers.Wallet.createRandom().address;
    console.log(`ENS name ${workerENS} not found, using fallback address: ${workerAddress}`);
  } else {
    console.log(`Using ENS name ${workerENS} (${workerAddress}) for worker`);
  }
  
  try {
    // Deploy contract using ENS-resolved or fallback address
    const WorkContract = await ethers.getContractFactory("WorkContract");
    const contract = await WorkContract.deploy(
      workerAddress,
      ethers.parseEther("0.001"),
      2,
      ethers.parseEther("0.001"),
      3600,
      7200,
      { value: ethers.parseEther("0.002") }
    );
    
    await contract.waitForDeployment();
    console.log(`Contract deployed successfully to: ${contract.target}`);
    console.log(`   Worker address: ${workerAddress}`);
  } catch (error: any) {
    console.log(`Contract deployment failed: ${error.message}`);
  }

  // Demonstrate checking contract balance and transaction history
  console.log("\n=== Onchain Activity Examples ===");
  
  try {
    const latestBlock = await ethers.provider.getBlockNumber();
    console.log(`Latest block: ${latestBlock}`);
    
    const balance = await ethers.provider.getBalance(deployer.address);
    console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);
    
    // Get recent transactions for the account
    const block = await ethers.provider.getBlock(latestBlock);
    console.log(`Block ${latestBlock} has ${block?.transactions.length} transactions`);
    
    // Display gas price information
    const feeData = await ethers.provider.getFeeData();
    if (feeData.gasPrice) {
      console.log(`Current gas price: ${ethers.formatUnits(feeData.gasPrice, 'gwei')} Gwei`);
    }
    
    console.log(`\nENS Integration Demo Complete!`);
    console.log(`This demonstrates:`);
    console.log(`   - ENS name resolution (${network.chainId === 31337n ? 'mock data' : 'real ENS'})`);
    console.log(`   - Reverse ENS lookup`);
    console.log(`   - Contract deployment with ENS addresses`);
    console.log(`   - Network detection and hybrid functionality`);
    console.log(`   - Onchain activity monitoring`);
    
  } catch (error: any) {
    console.log(`Error getting blockchain info: ${error.message}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 