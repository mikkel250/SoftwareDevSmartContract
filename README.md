# Milestone payments

A developer and a client who already agreed on the work use this app to pay for one project in crypto. The client locks a non-refundable start fee, then locks one milestone at a time. Accepting a delivery pays the developer immediately. If the client does nothing before the review window ends, the developer is paid. A rejection in time returns that milestone and stops the project.

## Roles

- **Developer.** Sets up the project, builds a milestone only after it is locked, and marks it delivered.
- **Client.** Funds the deposit and each milestone, and accepts or rejects a delivery.

Scope and what each milestone means are agreed before anyone marks a milestone delivered. The app does not judge the work.

## Payments

One project uses one asset: ETH, WBTC, USDT, USDC, or USDS. Amounts are quantities of that asset. They are not repriced if the dollar value moves. USDT, USDC, and USDS are the way to keep a dollar amount stable.

The deposit is paid to the developer when the client locks the project, and it is never returned. It is on top of the milestone amounts. Each milestone is locked before that work starts. The next milestone can be funded only after the previous one is paid.

Either party can change an unlocked amount. If the client changes the terms, the developer confirms that version before the client can fund.

## Review windows

Each milestone has its own review duration, set before it is locked. The window starts when the developer marks the milestone delivered.

- The client can accept or reject until the window ends.
- Accepting pays the developer then.
- If the window ends with no rejection, the developer is paid.
- A rejection returns that milestone to the client and stops the project. The developer keeps the deposit and every milestone already paid.

## Local development

```bash
npm install
npx hardhat compile
npx hardhat test
npx hardhat node
npx hardhat run scripts/deploy.ts --network localhost
npm run start-frontend
```

`scripts/mint-mock-tokens.ts` mints the local mock tokens to addresses you pass. It refuses to run on mainnet.

## Networks

- **Localhost (31337).** `scripts/deploy.ts` deploys mock tokens and the factory, and writes `frontend/deployments.json`.
- **Sepolia.** The same script deploys mocks and the factory. Record the factory in `deployments.md`, then commit `frontend/deployments.json` without the `31337` entry so the published page can find the factory.
- **Mainnet.** Set `MAINNET_RPC_URL`. Run `CHECK_ONLY=true npx hardhat run scripts/deploy.ts --network mainnet` first. That checks each token's symbol and decimals and deploys nothing. Deploy only after the check passes.

The page must be served over HTTP or HTTPS for the wallet to connect.

## Scripts

- `npm test` runs the Hardhat suite.
- `npm run test:contract` runs the milestone project tests.
- `npm run ens-demo` and `npm run onchain-demo` resolve ENS names and read chain data.
- `npm run start-frontend` serves `frontend/` on port 8080.
