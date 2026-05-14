(function attachGameLogic(root) {
  "use strict";

  var INITIAL_CASH = 10000;
  var HISTORY_LIMIT = 12;

  function roundMoney(value) {
    return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
  }

  function roundQuantity(value) {
    var number = Number(value);
    return Number.isFinite(number) ? Math.round((number + Number.EPSILON) * 1000000) / 1000000 : 0;
  }

  function createPortfolio(initialCash) {
    var cash = Number.isFinite(initialCash) ? initialCash : INITIAL_CASH;
    return {
      initialCash: cash,
      cash: cash,
      shares: 0,
      averageEntryPrice: 0,
      realizedPnl: 0,
      winningSells: 0,
      losingSells: 0,
      tradeLog: [],
      equityCurve: []
    };
  }

  function equityAt(portfolio, price) {
    return roundMoney(portfolio.cash + portfolio.shares * price);
  }

  function snapshotPortfolio(portfolio, price) {
    var equity = equityAt(portfolio, price);
    var unrealized = portfolio.shares * (price - portfolio.averageEntryPrice);
    return {
      cash: roundMoney(portfolio.cash),
      shares: portfolio.shares,
      averageEntryPrice: roundMoney(portfolio.averageEntryPrice),
      realizedPnl: roundMoney(portfolio.realizedPnl),
      unrealizedPnl: roundMoney(unrealized),
      equity: equity,
      returnPct: portfolio.initialCash === 0 ? 0 : ((equity - portfolio.initialCash) / portfolio.initialCash) * 100,
      tradeCount: portfolio.tradeLog.length
    };
  }

  function recordEquity(portfolio, price, candleIndex) {
    portfolio.equityCurve.push({
      candleIndex: candleIndex,
      equity: equityAt(portfolio, price)
    });
  }

  function buy(portfolio, price, quantity, candleIndex) {
    var qty = roundQuantity(quantity);
    var cost = roundMoney(qty * price);

    if (qty <= 0) {
      return { ok: false, message: "Choose a larger buy size." };
    }

    if (cost > portfolio.cash + 0.001) {
      return { ok: false, message: "Not enough cash for that buy." };
    }

    var previousCost = portfolio.averageEntryPrice * portfolio.shares;
    portfolio.cash = roundMoney(portfolio.cash - cost);
    portfolio.shares = roundQuantity(portfolio.shares + qty);
    portfolio.averageEntryPrice = portfolio.shares === 0 ? 0 : roundMoney((previousCost + cost) / portfolio.shares);
    portfolio.tradeLog.push({
      side: "buy",
      quantity: qty,
      price: price,
      candleIndex: candleIndex,
      cashAfter: portfolio.cash,
      sharesAfter: portfolio.shares
    });

    return { ok: true, message: "Bought " + qty + " BTC at $" + price.toFixed(2) + "." };
  }

  function sell(portfolio, price, quantity, candleIndex) {
    var qty = roundQuantity(quantity);

    if (qty <= 0) {
      return { ok: false, message: "Choose a larger sell size." };
    }

    if (qty > portfolio.shares) {
      return { ok: false, message: "Not enough shares to sell." };
    }

    var proceeds = roundMoney(qty * price);
    var closedPnl = roundMoney(qty * (price - portfolio.averageEntryPrice));
    portfolio.cash = roundMoney(portfolio.cash + proceeds);
    portfolio.shares = roundQuantity(portfolio.shares - qty);
    portfolio.realizedPnl = roundMoney(portfolio.realizedPnl + closedPnl);

    if (closedPnl >= 0) {
      portfolio.winningSells += 1;
    } else {
      portfolio.losingSells += 1;
    }

    if (portfolio.shares === 0) {
      portfolio.averageEntryPrice = 0;
    }

    portfolio.tradeLog.push({
      side: "sell",
      quantity: qty,
      price: price,
      candleIndex: candleIndex,
      cashAfter: portfolio.cash,
      sharesAfter: portfolio.shares,
      closedPnl: closedPnl
    });

    return { ok: true, message: "Sold " + qty + " BTC at $" + price.toFixed(2) + "." };
  }

  function buyQuantityFor(portfolio, price, fraction) {
    return roundQuantity((portfolio.cash * fraction) / price);
  }

  function sellQuantityFor(portfolio, fraction) {
    return roundQuantity(portfolio.shares * fraction);
  }

  function calculateMaxDrawdown(equityCurve) {
    var peak = 0;
    var maxDrawdown = 0;

    equityCurve.forEach(function eachPoint(point) {
      peak = Math.max(peak, point.equity);
      if (peak > 0) {
        maxDrawdown = Math.max(maxDrawdown, ((peak - point.equity) / peak) * 100);
      }
    });

    return maxDrawdown;
  }

  function buyAndHoldReturn(candles, startIndex, endIndex) {
    if (!candles.length || startIndex >= candles.length || endIndex >= candles.length) {
      return 0;
    }

    var start = candles[startIndex].close;
    var end = candles[endIndex].close;
    return start === 0 ? 0 : ((end - start) / start) * 100;
  }

  function computeRoundMetrics(portfolio, scenario, revealIndex, initialWindow) {
    var currentPrice = scenario.candles[revealIndex].close;
    var snapshot = snapshotPortfolio(portfolio, currentPrice);
    var sellCount = portfolio.winningSells + portfolio.losingSells;

    return {
      finalEquity: snapshot.equity,
      totalReturnPct: snapshot.returnPct,
      profitLoss: roundMoney(snapshot.equity - portfolio.initialCash),
      buyHoldReturnPct: buyAndHoldReturn(scenario.candles, Math.max(0, initialWindow - 1), revealIndex),
      tradeCount: portfolio.tradeLog.length,
      maxDrawdownPct: calculateMaxDrawdown(portfolio.equityCurve),
      winRatePct: sellCount === 0 ? 0 : (portfolio.winningSells / sellCount) * 100
    };
  }

  function safeLoadHistory(storage, key) {
    try {
      var raw = storage.getItem(key);
      if (!raw) {
        return [];
      }
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.map(sanitizeHistoryRecord).filter(Boolean).slice(0, HISTORY_LIMIT);
    } catch (error) {
      return [];
    }
  }

  function sanitizeHistoryRecord(record) {
    if (!record || typeof record !== "object") {
      return null;
    }

    return {
      playedAt: typeof record.playedAt === "string" ? record.playedAt : new Date(0).toISOString(),
      scenario: typeof record.scenario === "string" ? record.scenario : "Unknown scenario",
      returnPct: finiteNumber(record.returnPct),
      profitLoss: finiteNumber(record.profitLoss),
      trades: Math.max(0, Math.floor(finiteNumber(record.trades)))
    };
  }

  function finiteNumber(value) {
    var number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function saveHistory(storage, key, history) {
    storage.setItem(key, JSON.stringify(history.slice(0, HISTORY_LIMIT)));
  }

  function addHistoryRecord(storage, key, record) {
    var history = safeLoadHistory(storage, key);
    var next = [record].concat(history).slice(0, HISTORY_LIMIT);
    saveHistory(storage, key, next);
    return next;
  }

  var api = {
    INITIAL_CASH: INITIAL_CASH,
    HISTORY_LIMIT: HISTORY_LIMIT,
    addHistoryRecord: addHistoryRecord,
    buy: buy,
    buyAndHoldReturn: buyAndHoldReturn,
    buyQuantityFor: buyQuantityFor,
    calculateMaxDrawdown: calculateMaxDrawdown,
    computeRoundMetrics: computeRoundMetrics,
    createPortfolio: createPortfolio,
    equityAt: equityAt,
    recordEquity: recordEquity,
    roundMoney: roundMoney,
    roundQuantity: roundQuantity,
    safeLoadHistory: safeLoadHistory,
    saveHistory: saveHistory,
    sanitizeHistoryRecord: sanitizeHistoryRecord,
    sell: sell,
    sellQuantityFor: sellQuantityFor,
    snapshotPortfolio: snapshotPortfolio
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  root.StockGameLogic = api;
})(typeof window !== "undefined" ? window : globalThis);
