# PaperTrade NSE 📈

A simple, clean paper-trading website for **complete beginners**. You get **₹10,00,000 of virtual money** and can buy and sell NSE stocks. No signup, no broker, no real money, no risk.

## What it does

- **Market watch** — 15 NSE large-cap stocks with price, change and % change, refreshing every 5 seconds.
- **One-click Buy / Sell** straight from the market watch, or a full order ticket with quantity and estimated cost.
- **Portfolio** — quantity, average cost, live value and profit/loss per stock.
- **Order history** — every demo trade you place, with time, side, quantity and price.
- **Account summary** — cash, holdings value, total value and overall P&L.
- **Reset account** — go back to ₹10,00,000 any time.
- Everything is stored in your browser (`localStorage`). Nothing is sent to a server, nothing is shared.

## Where the prices come from

`/api/quotes` is a serverless function that reads NSE India's public NIFTY 50 market-data JSON (the same data the nseindia.com website loads), caches it for 10 seconds and returns only the fields this app needs.

NSE frequently blocks requests from cloud/data-centre IP addresses and has no official public API for third parties. When the live feed is unavailable, the app automatically switches to a **clearly labelled simulated feed** (a bounded random walk around indicative prices) so the demo always works. The badge under the header always tells you which feed is active:

- `● Live NSE feed`
- `● Simulated feed (live NSE data unavailable)`

Quotes are indicative/delayed and are for education only — this is **not** investment advice and no order ever reaches an exchange.

## Tech stack

- Plain HTML, CSS and vanilla JavaScript — no build step, no framework, no dependencies.
- One Node.js serverless function (`api/quotes.js`) for the NSE proxy.
- Deployed on Vercel (zero-config: static files + `/api` directory).

## Repository structure

```
index.html        Whole UI (market watch, order ticket, portfolio, history)
styles.css        Dark, responsive, accessible styling
app.js            Trading engine, portfolio maths, rendering, feed fallback
api/quotes.js     Serverless NSE quote proxy (10s cache, graceful 503)
PROJECT_STATUS.md Project memory / current state
```

## Run it

There is no build step. Any static file server works for the UI:

```bash
npx serve .
```

To also exercise `/api/quotes` locally, use the Vercel CLI:

```bash
npx vercel dev
```

## Deploy to Vercel

1. Import this repository in Vercel.
2. Framework preset: **Other**. Build command: none. Output directory: `.` (repository root).
3. Deploy. `api/quotes.js` is picked up automatically as a serverless function.

## Environment variables

None. The app needs no keys or secrets.

## Disclaimer

PaperTrade NSE is an educational simulator. Orders are never routed to any exchange or broker, no real money is involved, and prices may be delayed or simulated. Nothing here is investment advice.
