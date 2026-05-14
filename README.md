# Chart Replay Trader

A no-dependency static browser game for practicing virtual buy/sell decisions on bundled BTCUSDT daily candlestick charts.

## Run

Open `index.html` in a browser.

## Verify

```powershell
node --check src\gameLogic.js
node --check src\scenarios.js
node --check src\app.js
node --check tests\logic-test.js
node --check tests\static-test.js
node tests\logic-test.js
node tests\static-test.js
```

## Scope

- No sign-up.
- Three bundled BTCUSDT scenarios covering completed daily candles from 2023-05-14 through 2026-05-13.
- Hidden future candles with step-by-step replay.
- Buy and sell markers drawn directly on the chart.
- Long-only virtual BTC market buy/sell with fractional BTC sizing.
- Local result history in browser storage.
- No live data, accounts, broker connection, margin, shorting, or leaderboards.
