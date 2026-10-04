# WorkContract dApp Frontend

A decentralized application (dApp) frontend for interacting with WorkContract smart contracts.

## Features

- **Wallet Integration**: Connect MetaMask and other Web3 wallets
- **ENS Resolution**: Resolve Ethereum Name Service addresses
- **Contract Interaction**: Deploy and interact with WorkContract instances
- **Real-time Data**: View blockchain information and contract states
- **Cross-browser Support**: Works with Chrome, Firefox, Brave, and other modern browsers

## Quick Start

### Local Development

1. **Start Local Server**:
   ```bash
   python3 -m http.server 8080 --directory .
   open http://localhost:8080
   ```

2. **Connect Wallet**: Click "Connect Wallet" and approve the connection

3. **Test Contract**: Use the pre-filled demo contract address or deploy your own

## Browser Configuration

### Brave Browser Users

Brave has a built-in wallet that may conflict with MetaMask:

1. Go to `brave://settings/web3`
2. Set "Default Ethereum wallet" to **"Extensions"**
3. Restart Brave browser

### MetaMask Setup

1. Install [MetaMask Extension](https://metamask.io/download/)
2. Create or import a wallet
3. Connect to your desired network (Mainnet, use Sepolia for testing)

## Smart Contract Deployment

To deploy your own WorkContract:

```bash
# Install dependencies
npm install

# Compile contracts
npx hardhat compile

# Deploy to local network
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost

# Deploy to testnet (configure network in hardhat.config.ts)
npx hardhat run scripts/deploy.ts --network sepolia
```

## Supported Networks

- **Sepolia Testnet**: Live demo contract at `0xAE39f19fd7377ec2389E459060955E86515F9d19`
- **Localhost**: Hardhat local development network
- **Mainnet**: Ethereum mainnet
- **Other Networks**: Configure in hardhat.config.ts

## Demo Contract Details

The default contract address (`0xAE39f19fd7377ec2389E459060955E86515F9d19`) is deployed on Sepolia testnet with:
- **Client**: `0xA36e3C733D46911fbFAF7f6c50b9dDf8963E95D0`
- **Worker**: `0x3cf8EA9C90559982824de436D25EB98f55d646A4`
- **Hourly Rate**: 0.001 ETH
- **Hours Required**: 2 hours
- **Guaranteed Amount**: 0.001 ETH
- **Contract Value**: 0.002 ETH

To interact with this contract, switch MetaMask to Sepolia testnet and get free Sepolia ETH from a faucet.

## Security Notes

- Never share your private keys or seed phrases
- Always verify contract addresses before interacting
- Test on testnets before using mainnet
- This dApp requires HTTPS or localhost for security

## Troubleshooting

### Wallet Not Connecting
- Ensure MetaMask is installed and unlocked
- Check browser console for errors
- Try refreshing the page
- For Brave: Configure wallet settings as described above

### Contract Interaction Fails
- Verify contract address is correct
- Ensure wallet is connected to the right network
- Check you have sufficient ETH for gas fees
- Confirm the contract is deployed on the current network

## Support

For issues and questions:
- Check the browser console for error messages
- Verify network configuration
- Ensure latest browser version
- Review MetaMask connection status 