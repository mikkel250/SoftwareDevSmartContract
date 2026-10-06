import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Demonstrating onchain activity with account:", deployer.address);

  // Check network information for ENS compatibility
  const network = await ethers.provider.getNetwork();
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);

  // 1. ENS Integration and Resolution
  console.log("\n=== ENS Integration ===");
  
  // Mock ENS mappings for local development (same as interact-with-ens.ts)
  const MOCK_ENS_MAPPINGS: { [key: string]: string } = {
    "vitalik.eth": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
    "ens.eth": "0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7",
    "ethereum.eth": "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359"
  };

  const MOCK_REVERSE_ENS: { [key: string]: string } = {
    "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045": "vitalik.eth",
    "0xFe89cc7aBB2C4183683ab71653C4cdc9B02D44b7": "ens.eth",
    "0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359": "ethereum.eth"
  };
  
  // Resolve popular ENS names
  const ensNames = ["vitalik.eth", "ens.eth", "ethereum.eth"];
  for (const name of ensNames) {
    try {
      let address: string | null = null;
      let reverseName: string | null = null;
      
      if (network.chainId === 31337n) {
        // Local Hardhat network - use mock data
        console.log(`Using mock ENS data for local development`);
        address = MOCK_ENS_MAPPINGS[name.toLowerCase()] || null;
        if (address) {
          const checksumAddress = ethers.getAddress(address);
          reverseName = MOCK_REVERSE_ENS[checksumAddress] || null;
        }
      } else {
        // Real network - use actual ENS resolution
        console.log(`Using real ENS resolution on ${network.name}`);
        address = await ethers.provider.resolveName(name);
        if (address) {
          reverseName = await ethers.provider.lookupAddress(address);
        }
      }
      
      if (address) {
        console.log(`${name} → ${address}`);
        console.log(`   Reverse: ${address} → ${reverseName || "No ENS name"}`);
      } else {
        console.log(`${name} → Not found`);
      }
    } catch (error: any) {
      console.log(`${name} → Error: ${error.message}`);
    }
  }

  // 2. Blockchain Information
  console.log("\n=== Blockchain Information ===");
  
  const blockNumber = await ethers.provider.getBlockNumber();
  console.log(`Current block: ${blockNumber}`);
  
  console.log(`Network: ${network.name} (Chain ID: ${network.chainId})`);
  
  const gasPrice = await ethers.provider.getFeeData();
  console.log(`Gas price: ${ethers.formatUnits(gasPrice.gasPrice || 0, 'gwei')} Gwei`);
  
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Account balance: ${ethers.formatEther(balance)} ETH`);

  // 3. Transaction History and Monitoring
  console.log("\n=== Transaction Monitoring ===");
  
  // Get recent blocks and their transactions
  const recentBlocks = Math.min(5, blockNumber + 1); // Don't go below block 0
  for (let i = 0; i < recentBlocks; i++) {
    const currentBlockNumber = blockNumber - i;
    if (currentBlockNumber >= 0) {
      const block = await ethers.provider.getBlock(currentBlockNumber);
      if (block) {
        console.log(`Block ${block.number}: ${block.transactions.length} transactions`);
        
        // Show first few transaction hashes if any exist
        if (block.transactions.length > 0) {
          const txHashes = block.transactions.slice(0, 3);
          txHashes.forEach((tx, index) => {
            console.log(`  TX ${index + 1}: ${tx}`);
          });
        }
      }
    }
  }

  // 4. Network and address checks
  console.log("\n=== Network Information ===");
  
  const currentNetwork = await ethers.provider.getNetwork();
  console.log(`Connected to: ${currentNetwork.name}`);
  console.log(`Chain ID: ${currentNetwork.chainId}`);

  console.log("\n=== Address Validation ===");
  const checksum = ethers.getAddress(deployer.address);
  console.log(`Deployer: ${ethers.isAddress(checksum) ? "Valid" : "Invalid"} ${checksum}`);

  console.log("\n=== Onchain Activity Demo Complete ===");
  console.log("This demonstrates:");
  console.log("- ENS resolution and reverse lookup");
  console.log("- Transaction monitoring and history");
  console.log("- Address validation and checksum verification");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 