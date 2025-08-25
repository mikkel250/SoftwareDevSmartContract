# Contract Deployments

## Sepolia Testnet

### WorkContract (Latest - Fresh for Testing)
- **Address0**: `0xB6E491Bef909d13bBe5FA5539f58B4D1DA784D5F` (already approved)
- **Address1**: `0x73bEe6b36fdb7b70A313A017D4C6d6d73b15D27f`
- **Address3**: `0xAE39f19fd7377ec2389E459060955E86515F9d19` (current default)
- **Deployer**: `0xA36e3C733D46911fbFAF7f6c50b9dDf8963E95D0`
- **Network**: Sepolia (Chain ID: 11155111)
- **Block Explorer**: [View on Etherscan](https://sepolia.etherscan.io/address/0xAE39f19fd7377ec2389E459060955E86515F9d19)
- **Status**: 🟢 Fresh deployment, ready for testing

#### Constructor Parameters:
- **Worker**: `0x3cf8EA9C90559982824de436D25EB98f55d646A4`
- **Hourly Rate**: 0.001 ETH (1000000000000000 wei)
- **Hours Required**: 2
- **Guaranteed Amount**: 0.001 ETH (1000000000000000 wei)
- **Ideal Duration**: 3600 seconds (1 hour)
- **Max Duration**: 7200 seconds (2 hours)
- **Initial Funding**: 0.002 ETH

### WorkContract (Previous - Completed)
- **Address**: `0xB6E491Bef909d13bBe5FA5539f58B4D1DA784D5F`
- **Status**: ✅ Contract completed (approved)
- **Block Explorer**: [View on Etherscan](https://sepolia.etherscan.io/address/0xB6E491Bef909d13bBe5FA5539f58B4D1DA784D5F)

#### Features Enabled:
- ✅ Client/Worker approval system
- ✅ Guaranteed payment mechanism
- ✅ Timeout-based claims
- ✅ Escrow functionality
- ✅ Event emission for state changes

---

## Local Development

### WorkContract (Local)
- **Address**: `0x5FbDB2315678afecb367f032d93F642f64180aa3` (deterministic)
- **Network**: Localhost (Chain ID: 31337)
- **Usage**: Local testing with `npx hardhat node`

---

## Mainnet

*No mainnet deployments yet*

---

## Deployment Commands

### Sepolia
```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

### Local
```bash
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

### Mainnet (when ready)
```bash
npx hardhat run scripts/deploy.ts --network mainnet
``` 