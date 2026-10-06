# Contract Deployments

## Retired: WorkContract on Sepolia

These addresses are the old single-agreement escrow. The app no longer loads them. They stay on Sepolia and are not part of the milestone product.

- `0xB6E491Bef909d13bBe5FA5539f58B4D1DA784D5F` (completed)
- `0x73bEe6b36fdb7b70A313A017D4C6d6d73b15D27f`
- `0xAE39f19fd7377ec2389E459060955E86515F9d19`
- Deployer: `0xA36e3C733D46911fbFAF7f6c50b9dDf8963E95D0`
- Network: Sepolia (chain ID 11155111)

## MilestoneProjectFactory

No factory deployment is recorded yet. After a deploy, record the factory address here and publish `frontend/deployments.json` without a chain `31337` entry.

### Local

```bash
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
```

### Sepolia

```bash
npx hardhat run scripts/deploy.ts --network sepolia
```

### Mainnet

Run the metadata check before any deploy. It needs `MAINNET_RPC_URL` and does not deploy when `CHECK_ONLY=true`.

```bash
CHECK_ONLY=true npx hardhat run scripts/deploy.ts --network mainnet
npx hardhat run scripts/deploy.ts --network mainnet
```
