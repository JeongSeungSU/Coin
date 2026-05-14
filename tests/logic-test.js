"use strict";

var assert = require("assert");
var logic = require("../src/gameLogic.js");
var scenarios = require("../src/scenarios.js");

function memoryStorage(initialValue) {
  var data = initialValue ? { history: initialValue } : {};
  return {
    getItem: function getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem: function setItem(key, value) {
      data[key] = value;
    },
    removeItem: function removeItem(key) {
      delete data[key];
    }
  };
}

function approx(actual, expected, tolerance) {
  assert.ok(Math.abs(actual - expected) <= tolerance, "Expected " + actual + " to be within " + tolerance + " of " + expected);
}

var portfolio = logic.createPortfolio(10000);
assert.strictEqual(portfolio.cash, 10000);
assert.strictEqual(portfolio.shares, 0);

var buyResult = logic.buy(portfolio, 50, 100, 4);
assert.strictEqual(buyResult.ok, true);
assert.strictEqual(portfolio.cash, 5000);
assert.strictEqual(portfolio.shares, 100);
assert.strictEqual(portfolio.averageEntryPrice, 50);

var rejectedBuy = logic.buy(portfolio, 1000, 10, 5);
assert.strictEqual(rejectedBuy.ok, false);
assert.strictEqual(portfolio.cash, 5000);

var rejectedSell = logic.sell(portfolio, 52, 101, 6);
assert.strictEqual(rejectedSell.ok, false);
assert.strictEqual(portfolio.shares, 100);

var sellResult = logic.sell(portfolio, 60, 40, 7);
assert.strictEqual(sellResult.ok, true);
assert.strictEqual(portfolio.shares, 60);
assert.strictEqual(portfolio.cash, 7400);
assert.strictEqual(portfolio.realizedPnl, 400);
assert.strictEqual(portfolio.winningSells, 1);

var snapshot = logic.snapshotPortfolio(portfolio, 60);
assert.strictEqual(snapshot.equity, 11000);
approx(snapshot.returnPct, 10, 0.0001);

approx(logic.buyQuantityFor(portfolio, 60, 0.5), 61.666667, 0.000001);
assert.strictEqual(logic.sellQuantityFor(portfolio, 0.5), 30);

var btcPortfolio = logic.createPortfolio(10000);
var btcQuantity = logic.buyQuantityFor(btcPortfolio, 80000, 0.25);
assert.strictEqual(btcQuantity, 0.03125);
assert.strictEqual(logic.buy(btcPortfolio, 80000, btcQuantity, 1).ok, true);
assert.strictEqual(btcPortfolio.shares, 0.03125);
assert.strictEqual(logic.sellQuantityFor(btcPortfolio, 0.5), 0.015625);

var drawdown = logic.calculateMaxDrawdown([
  { equity: 10000 },
  { equity: 11000 },
  { equity: 9900 },
  { equity: 12000 }
]);
approx(drawdown, 10, 0.0001);

assert.ok(Array.isArray(scenarios));
assert.strictEqual(scenarios.length, 3);
assert.strictEqual(scenarios.reduce(function countCandles(total, scenario) {
  return total + scenario.candles.length;
}, 0), 1096);
scenarios.forEach(function validateScenario(scenario) {
  assert.ok(scenario.candles.length >= 70);
  assert.strictEqual(scenario.symbol, "BTCUSDT");
  assert.strictEqual(scenario.timeframe, "1d");
  assert.ok(scenario.source.indexOf("Binance public API") !== -1);
  scenario.candles.forEach(function validateCandle(candle) {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(candle.time));
    assert.ok(candle.high >= candle.open);
    assert.ok(candle.high >= candle.close);
    assert.ok(candle.low <= candle.open);
    assert.ok(candle.low <= candle.close);
    assert.ok(candle.volume > 0);
  });
});

var benchmark = logic.buyAndHoldReturn(scenarios[0].candles, 29, scenarios[0].candles.length - 1);
assert.ok(Number.isFinite(benchmark));

var metricsPortfolio = logic.createPortfolio(10000);
logic.recordEquity(metricsPortfolio, scenarios[0].candles[29].close, 29);
logic.buy(metricsPortfolio, scenarios[0].candles[29].close, logic.buyQuantityFor(metricsPortfolio, scenarios[0].candles[29].close, 0.25), 29);
logic.recordEquity(metricsPortfolio, scenarios[0].candles[30].close, 30);
var metrics = logic.computeRoundMetrics(metricsPortfolio, scenarios[0], 30, 30);
assert.ok(Number.isFinite(metrics.finalEquity));
assert.ok(Number.isFinite(metrics.buyHoldReturnPct));
assert.strictEqual(metrics.tradeCount, 1);

var storage = memoryStorage();
assert.deepStrictEqual(logic.safeLoadHistory(storage, "history"), []);
var nextHistory = logic.addHistoryRecord(storage, "history", { playedAt: "now", scenario: "A", returnPct: 1, profitLoss: 100, trades: 2 });
assert.strictEqual(nextHistory.length, 1);
assert.strictEqual(logic.safeLoadHistory(memoryStorage("{bad json"), "history").length, 0);

var malicious = JSON.stringify([
  {
    playedAt: 1,
    scenario: 7,
    returnPct: "not a number",
    profitLoss: "<img src=x onerror=alert(1)>",
    trades: "<script>alert(1)</script>"
  }
]);
var sanitized = logic.safeLoadHistory(memoryStorage(malicious), "history");
assert.strictEqual(sanitized.length, 1);
assert.strictEqual(sanitized[0].playedAt, "1970-01-01T00:00:00.000Z");
assert.strictEqual(sanitized[0].scenario, "Unknown scenario");
assert.strictEqual(sanitized[0].returnPct, 0);
assert.strictEqual(sanitized[0].profitLoss, 0);
assert.strictEqual(sanitized[0].trades, 0);

console.log("logic tests passed");
