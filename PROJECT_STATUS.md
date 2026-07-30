# PROJECT STATUS

## Product objective
A beginner-friendly NSE paper-trading website. Users practise buying and selling Indian stocks with ₹10,00,000 of virtual money, with no real money, signup or broker involved.

## Current architecture
Static single-page site (no build step) plus one Vercel serverless function that proxies NSE India's public NIFTY 50 market-data JSON. All account state lives in the browser's `localStorage`; there is no database and no server-side user state.

## Technology stack
- HTML5, CSS3, vanilla JavaScript (ES5-compatible syntax in `app.js`)
- Node.js serverless function (`api/quotes.js`), no npm dependencies
- Vercel (zero-config: static root + `/api` directory)

## Working features
- Market watch: 15 NSE large caps, price / change / % change, 5-second refresh, price flash, search filter
- Buy & Sell from the market watch or the order ticket
- Validation: whole-number quantity, sufficient cash, sufficient holdings
- Portfolio: qty, average cost, live price, value, per-stock P&L
- Account summary: cash, holdings value, total value, total P&L vs ₹10,00,000
- Order history (last 200 orders stored, last 30 shown)
- Reset account with confirmation
- Live feed with automatic, clearly labelled fallback to a simulated feed
- Responsive layout, keyboard accessible, visible focus states, reduced-motion support

## Current task
Initial release (branch `feature/paper-trading-demo`).

## Pending tasks
- Optional: NIFTY 50 index ticker in the header
- Optional: limit orders
- Optional: intraday price chart per stock
- Optional: expand universe beyond NIFTY 50 constituents

## Known issues
- NSE blocks many cloud/data-centre IPs, so the deployed `/api/quotes` may consistently return 503 and the UI will run on the simulated feed. This is handled gracefully and labelled in the UI.
- Prices are indicative/delayed; no order book, no slippage, no brokerage or taxes modelled.
- State is per-browser only; clearing site data resets the account.

## Required environment variables
None.

## Deployment information
Vercel, framework preset "Other", no build command, output directory = repository root. `api/quotes.js` deploys automatically as a Node serverless function.

## Important architectural decisions
- No framework and no dependencies: keeps the demo readable for beginners and instantly deployable.
- Quotes are proxied server-side because NSE endpoints cannot be called from the browser (CORS + cookie requirements).
- The client always keeps a local simulated feed so the demo never appears broken when NSE is unreachable.
- No secrets or environment variables are required, so nothing sensitive can leak.

## Last completed change
Created the initial application: `index.html`, `styles.css`, `app.js`, `api/quotes.js`, `README.md`, `.gitignore`, `PROJECT_STATUS.md`.
