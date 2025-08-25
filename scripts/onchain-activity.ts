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

  // 4. Contract Deployment with ENS
  console.log("\n=== Contract Deployment with ENS ===");
  
  // Use ENS name for worker (with hybrid resolution)
  const workerENS = "worker.eth"; // This would be a real ENS name
  let workerAddress: string | null = null;
  
  if (network.chainId === 31337n) {
    // Local network - use mock data (add worker.eth to our mappings)
    const localMockMappings = {
      ...MOCK_ENS_MAPPINGS,
      "worker.eth": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    };
    workerAddress = localMockMappings[workerENS.toLowerCase()] || null;
    if (workerAddress) {
      console.log(`Using mock ENS name ${workerENS} (${workerAddress}) for worker`);
    }
  } else {
    // Real network - try actual ENS resolution
    try {
      workerAddress = await ethers.provider.resolveName(workerENS);
      if (workerAddress) {
        console.log(`Using real ENS name ${workerENS} (${workerAddress}) for worker`);
      }
    } catch (error: any) {
      console.log(`ENS resolution failed: ${error.message}`);
    }
  }
  
  if (!workerAddress) {
    // Fallback to a generated address
    workerAddress = ethers.Wallet.createRandom().address;
    console.log(`ENS name ${workerENS} not found, using generated address: ${workerAddress}`);
  }

  // Deploy contract
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
  console.log(`Contract deployed to: ${contract.target}`);

  // 5. Contract Interaction and State Monitoring
  console.log("\n=== Contract State Monitoring ===");
  
  const contractBalance = await contract.getContractBalance();
  console.log(`Contract balance: ${ethers.formatEther(contractBalance)} ETH`);
  
  const [clientApproved, workerApproved] = await contract.getApprovalStatus();
  console.log(`Approval status - Client: ${clientApproved}, Worker: ${workerApproved}`);
  
  const paymentReleased = await contract.isPaymentReleased();
  console.log(`Payment released: ${paymentReleased}`);
  
  const [idealDeadline, maxDeadline] = await contract.getDeadlines();
  console.log(`Deadlines - Ideal: ${new Date(Number(idealDeadline) * 1000)}, Max: ${new Date(Number(maxDeadline) * 1000)}`);

  // 6. Event Monitoring
  console.log("\n=== Event Monitoring ===");
  
  // Set up temporary event listeners for demonstration
  console.log("Setting up temporary event listeners...");
  
  const eventCleanup = () => {
    contract.removeAllListeners("Approval");
    contract.removeAllListeners("PaymentReleased");
    contract.removeAllListeners("GuaranteedClaimed");
    console.log("Event listeners cleaned up");
  };
  
  // Listen for contract events temporarily
  contract.once("Approval", (approver, isClient) => {
    console.log(`Approval event: ${approver} (${isClient ? 'client' : 'worker'})`);
  });
  
  contract.once("PaymentReleased", (to, amount) => {
    console.log(`Payment released: ${ethers.formatEther(amount)} ETH to ${to}`);
  });
  
  contract.once("GuaranteedClaimed", (worker, amount) => {
    console.log(`Guaranteed claimed: ${ethers.formatEther(amount)} ETH by ${worker}`);
  });

  // 7. Multi-signature Simulation
  console.log("\n=== Multi-signature Simulation ===");
  
  // Simulate client approval
  console.log("Simulating client approval...");
  const clientApprovalTx = await contract.connect(deployer).approveCompletion();
  await clientApprovalTx.wait();
  console.log(`Client approval transaction: ${clientApprovalTx.hash}`);
  
  // Check state after approval
  const [newClientApproved, newWorkerApproved] = await contract.getApprovalStatus();
  console.log(`Updated approval status - Client: ${newClientApproved}, Worker: ${newWorkerApproved}`);

  // 8. Gas Estimation and Optimization
  console.log("\n=== Gas Analysis ===");
  
  try {
    const gasEstimate = await contract.approveCompletion.estimateGas();
    console.log(`Gas estimate for approveCompletion: ${gasEstimate.toString()}`);
    
    const gasPriceWei = await ethers.provider.getFeeData();
    const estimatedCost = gasEstimate * (gasPriceWei.gasPrice || 0);
    console.log(`Estimated cost: ${ethers.formatEther(estimatedCost)} ETH`);
  } catch (error: any) {
    console.log(`Gas estimation note: ${error.message.includes('already approved') ? 'Client already approved, gas estimation skipped' : 'Gas estimation failed'}`);
  }

  // 9. Network Switching Simulation
  console.log("\n=== Network Information ===");
  
  const currentNetwork = await ethers.provider.getNetwork();
  console.log(`Connected to: ${currentNetwork.name}`);
  console.log(`Chain ID: ${currentNetwork.chainId}`);
  console.log(`Block time: ~${currentNetwork.name === 'sepolia' ? '12' : '15'} seconds`);

  // 10. Address Validation and Checksum
  console.log("\n=== Address Validation ===");
  
  const addresses = [
    deployer.address,
    workerAddress,
    contract.target
  ];
  
  addresses.forEach((address, index) => {
    const isValid = ethers.isAddress(address);
    const checksum = ethers.getAddress(address);
    console.log(`Address ${index + 1}: ${isValid ? 'Valid' : 'Invalid'} ${checksum}`);
  });

  console.log("\n=== Onchain Activity Demo Complete ===");
  console.log("This demonstrates comprehensive blockchain interaction including:");
  console.log("- ENS resolution and reverse lookup");
  console.log("- Transaction monitoring and history");
  console.log("- Contract deployment and interaction");
  console.log("- Event listening and monitoring");
  console.log("- Gas estimation and optimization");
  console.log("- Address validation and checksum verification");
  
  // Clean up event listeners and ensure graceful exit
  eventCleanup();
  
  // Give a brief moment for any pending operations, then exit
  setTimeout(() => {
    console.log("Demo complete, exiting gracefully...");
    process.exit(0);
  }, 1000);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 