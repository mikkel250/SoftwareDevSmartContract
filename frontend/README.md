# Milestone payments dApp

A static page for a developer and a client to create a project, lock a start-fee deposit and one milestone at a time, and review each delivery.

## Features

- Connect a wallet and resolve ENS names
- Create a project in ETH, WBTC, USDT, USDC, or USDS
- Fund, deliver, accept, reject, or withdraw a credited payout
- List the projects for the connected account

## Local use

From the repo root, deploy the factory to a local node, then serve this directory:

```bash
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
python3 -m http.server 8080 --directory frontend
```

Open `http://localhost:8080`, connect a wallet on chain 31337, and use the factory address written into `deployments.json`.

The page must be served over HTTP or HTTPS. MetaMask does not treat a `file://` page as a Web3 app.

## Networks

`deployments.json` lists each chain. An entry with no factory address shows the asset metadata and no project actions. Switch the wallet to a chain that has a factory.

## Wallet notes

Brave can prefer its built-in wallet. Set `brave://settings/web3` so the default Ethereum wallet is Extensions, then restart Brave.

Never share a seed phrase. Confirm the factory address and the developer address before locking funds.
