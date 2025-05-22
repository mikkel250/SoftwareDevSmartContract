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

**The contract must be funded with at least** `hourlyRate * hoursRequired` **ETH.**

#### Example Hardhat Deployment
```shell
npx hardhat compile
npx hardhat run scripts/deploy.js --network <network>
```
Example `deploy.js`:
```js
async function main() {
  const [deployer] = await ethers.getSigners();
  const WorkContract = await ethers.getContractFactory("WorkContract");
  const contract = await WorkContract.deploy(
    "0xWorkerAddress", // worker
    ethers.utils.parseEther("0.01"), // hourlyRate (0.01 ETH)
    100, // hoursRequired
    ethers.utils.parseEther("0.5"), // guaranteedAmount (0.5 ETH)
    60 * 60 * 24 * 7, // idealDuration (1 week)
    60 * 60 * 24 * 14, // maxDuration (2 weeks)
    { value: ethers.utils.parseEther("1.0") } // funding (1 ETH)
  );
  await contract.deployed();
  console.log("WorkContract deployed to:", contract.address);
}
main();
```

### 3. Interaction Guide

#### Public Functions
- `approveCompletion()`: Called by client or worker to approve completion. When both approve, payment is released to the worker.
- `claimGuaranteed()`: Called by the worker if full approval is not reached. Worker receives the guaranteed amount, client is refunded the rest.
- `workerClaimAfterDeadline()`: Worker claims all funds after `maxDeadline` if client has not approved.
- `clientClaimAfterDeadline()`: Client claims all funds after `maxDeadline` if worker has not approved.
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
   - If both approve, full payment is released to the worker.
   - If only the worker approves, they may call `claimGuaranteed()` to receive the guaranteed amount; the client is refunded the remainder.
4. **Timeouts**:
   - If the client does not approve by `maxDeadline`, the worker can call `workerClaimAfterDeadline()` to claim all funds.
   - If the worker does not approve by `maxDeadline`, the client can call `clientClaimAfterDeadline()` to reclaim all funds.

### 5. Dispute & Timeout Handling
- **Disputes**: If both parties do not approve, the worker can claim the guaranteed amount (`claimGuaranteed()`), and the client is refunded the rest.
- **Timeouts**: After `maxDeadline`, if only one party has approved, the non-approving party can claim all funds using the appropriate function (`workerClaimAfterDeadline()` or `clientClaimAfterDeadline()`).

---
