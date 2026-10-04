# Sample Hardhat Project

This project demonstrates a basic Hardhat use case. It comes with a sample contract, a test for that contract, and a Hardhat Ignition module that deploys that contract.

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
npx hardhat ignition deploy ./ignition/modules/Lock.ts
```

---

## Enhanced Features for Crypto-Forward Experience

This project now includes comprehensive blockchain interaction capabilities:

### ENS (Ethereum Name Service) Integration
- **ENS Resolution**: Resolve human-readable names to Ethereum addresses
- **Reverse Lookup**: Convert addresses back to ENS names
- **Contract Deployment with ENS**: Use ENS names instead of hardcoded addresses

### Onchain Activity Monitoring
- **Transaction History**: Monitor recent blocks and transactions
- **Contract State Tracking**: Real-time monitoring of contract balances and status
- **Event Listening**: Listen for contract events and state changes
- **Gas Estimation**: Optimize transaction costs

### dApp Frontend Interface
- **Web3 Wallet Integration**: Connect MetaMask and other Web3 wallets
- **Interactive Contract Management**: Deploy and interact with contracts through UI
- **Real-time Blockchain Data**: Display network information and account balances
- **User-friendly ENS Resolution**: Resolve ENS names directly in the browser

### Comprehensive Testing
- **Full Contract Test Suite**: Complete coverage of all contract functions
- **Multi-signature Testing**: Test approval workflows and dispute resolution
- **Timeout Handling**: Test deadline-based claim mechanisms
- **Security Testing**: Access control and authorization tests

### New Scripts and Tools
- `scripts/interact-with-ens.ts` - ENS resolution and integration examples
- `scripts/onchain-activity.ts` - Comprehensive blockchain interaction demo
- `test/WorkContract.test.ts` - Complete test suite for the smart contract
- `frontend/index.html` - Interactive dApp interface

# Run ENS integration demo
`npm run ens-demo`

# Run comprehensive onchain activity demo  
`npm run onchain-demo`

# Run full test suite
`npm run test:contract`

# Start local web server and open dApp
`npm run start-frontend`

# Or manually start server and open browser
`python3 -m http.server 8080 --directory frontend`
`open http://localhost:8080`

# Deploy to Netlify
The frontend is ready for deployment to Netlify and includes a live demo contract on Sepolia testnet. Simply connect your repository and Netlify will automatically deploy from the `frontend` directory.

**Live Demo Contract**: `0xAE39f19fd7377ec2389E459060955E86515F9d19` (Sepolia)

**Note**: The dApp must be served via HTTP/HTTPS (not file://) for MetaMask to recognize it as a legitimate Web3 application.
---

## WorkContract: Deployment & Usage Guide

### 1. Contract Summary

`WorkContract` is a smart contract for managing work agreements, approvals, deadlines, and payments between a client and a worker. It acts as an escrow, ensuring fair payment and dispute resolution.

### 2. Deployment Instructions

#### Constructor Parameters
- `address payable _worker`: Address of the worker
- `uint _hourlyRate`: Hourly rate for the work (in wei)
- `uint _hoursRequired`: Number of hours required
- `uint _guaranteedAmount`: Minimum payment guaranteed to the worker (in wei)
- `uint _idealDuration`: Ideal completion duration (in seconds)
- `uint _maxDuration`: Maximum allowed completion duration (in seconds)

**The contract must be funded with at least** `hourlyRate * hoursRequired` **ETH.** `guaranteedAmount` cannot exceed that product. Any ETH above the contracted payment is refunded to the client when both parties approve. The worker address cannot be the deployer.

Sepolia deploys read `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` from the environment (see `.env`, which is gitignored). Do not commit RPC keys or private keys. If a key was previously committed, revoke it in the provider dashboard.

#### Example Hardhat Deployment
```shell
npx hardhat compile
npx hardhat run scripts/deploy.ts --network sepolia
```
Or `npm run deploy` against the default network. `scripts/deploy.ts` uses ethers v6:

```ts
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
console.log("WorkContract deployed to:", contract.target);
```

### 3. Interaction Guide

#### Public Functions
- `approveCompletion()`: Called by client or worker to approve completion. When both approve, the contracted payment is sent to the worker and any surplus funding is refunded to the client.
- `claimGuaranteed()`: Called by the worker after the worker has approved and the client has not. Worker receives the guaranteed amount, client is refunded the rest.
- `workerClaimAfterDeadline()`: Worker claims all funds after `maxDeadline` if the client has not approved.
- `clientClaimAfterDeadline()`: Client claims all funds after `maxDeadline` if the worker has not approved.
- `withdraw()`: Pulls ETH that was credited to the caller because a direct transfer was rejected.
- `getContractBalance()`: Returns contract's ether balance.
- `getApprovalStatus()`: Returns approval status of client and worker.
- `isPaymentReleased()`: Returns whether payment has been released.
- `getDeadlines()`: Returns the ideal and max deadlines.

#### Example Calls (using ethers.js)
```js
await contract.approveCompletion();
await contract.claimGuaranteed();
await contract.workerClaimAfterDeadline();
await contract.clientClaimAfterDeadline();
const balance = await contract.getContractBalance();
const [clientApproved, workerApproved] = await contract.getApprovalStatus();
const released = await contract.isPaymentReleased();
const [ideal, max] = await contract.getDeadlines();
```

### 4. Workflow: Client & Worker
1. **Deployment**: Client deploys and funds the contract, specifying all parameters.
2. **Work Period**: Worker performs the agreed work.
3. **Approval**:
   - Both client and worker call `approveCompletion()` when satisfied.
   - If both approve, the contracted payment (`hourlyRate * hoursRequired`) is released to the worker. Extra funding is refunded to the client.
   - If only the worker approves, they may call `claimGuaranteed()` to receive the guaranteed amount; the client is refunded the remainder. The worker must approve first, and the client must not have approved.
4. **Timeouts**:
   - If the client does not approve by `maxDeadline`, the worker can call `workerClaimAfterDeadline()` to claim all funds.
   - If the worker does not approve by `maxDeadline`, the client can call `clientClaimAfterDeadline()` to reclaim all funds.

### 5. Dispute & Timeout Handling
- **Disputes**: After the worker approves and the client does not, the worker can claim the guaranteed amount (`claimGuaranteed()`), and the client is refunded the rest.
- **Timeouts**: After `maxDeadline`, `workerClaimAfterDeadline()` pays the worker when the client has not approved. `clientClaimAfterDeadline()` pays the client when the worker has not approved. The party who already approved is the one who can claim; the other party's approval blocks that claim.

---
