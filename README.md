# 📈 NSE Paper Trader

A free, zero-install **paper trading simulator for the Indian stock market (NSE)** that runs entirely in the browser and is hosted on GitHub Pages.

**Live site:** https://TJ-zip.github.io/nse-paper-trader/

## Features

- **₹10,00,000 virtual capital** — no signup, no real money, no risk.
- **Live NSE quotes** for 38 large-cap stocks plus NIFTY 50 and BANK NIFTY, refreshed every 10 seconds from public market-data endpoints (Yahoo Finance `*.NS` chart API via CORS proxies, with a Stooq CSV fallback). If no feed is reachable, the app switches to a clearly labelled **simulated feed** so the simulator always works.
- **Market and limit orders.** Limit orders rest in an order book and fill automatically when the live price touches your price.
- **Realistic costs** — ₹20 brokerage per executed order, like a discount broker.
- **Live portfolio maths** — average price, holdings value, unrealised P&L, realised P&L, total equity and overall return.
- **Interactive price chart** (custom HTML5 canvas) with 1D / 5D / 1M / 6M / 1Y ranges.
- **Watchlist** with add/remove, one-click B/S buttons, and a scrolling market ticker.
- **Market status** badge (NSE open 9:15 AM – 3:30 PM IST, Mon–Fri) and a live IST clock.
- **Everything is saved in `localStorage`**, so your portfolio survives a refresh. Trades export to CSV.
- Fully responsive dark trading-terminal UI. No build step, no framework, no backend.

## Files

| File | Purpose |
|---|---|
| `index.html` | Page structure |
| `styles.css` | Dark terminal theme, responsive layout |
| `app.js` | Data feed, order engine, portfolio maths, canvas chart |
| `.nojekyll` | Tells GitHub Pages to serve the files as-is |

## Enable GitHub Pages

Settings → **Pages** → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → **Save**.
The site goes live at `https://TJ-zip.github.io/nse-paper-trader/` in about a minute.

## Run locally

```bash
git clone https://github.com/TJ-zip/nse-paper-trader.git
cd nse-paper-trader
python3 -m http.server 8000
# open http://localhost:8000
```

## Notes on the live data

Browsers cannot call NSE's own endpoints directly (NSE blocks cross-origin requests), so quotes are fetched from public endpoints through free CORS proxies. Prices may be delayed by a few minutes and are **for education only**.

## Disclaimer

This project is an educational simulator. It is not investment advice, is not affiliated with the NSE, and executes no real trades.
