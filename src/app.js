(function startApp(root) {
  "use strict";

  var logic = root.StockGameLogic;
  var scenarios = root.StockScenarios;
  var HISTORY_KEY = "chartReplayTrader.history.v1";
  var INITIAL_WINDOW = 30;
  var MAX_VISIBLE_CANDLES = 82;
  var AUTO_INTERVAL_MS = 850;

  var dom = {};
  var game = {
    scenario: null,
    revealIndex: 0,
    portfolio: logic.createPortfolio(logic.INITIAL_CASH),
    selectedFraction: 0.25,
    complete: false,
    autoTimer: null,
    scenarioCursor: 0
  };

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    dom = collectDom();
    bindEvents();
    drawEmptyChart();
    renderHistory();
    render();
    if (new URLSearchParams(root.location.search).get("demo") === "1") {
      runDemoRound();
    }
  }

  function collectDom() {
    return {
      autoButton: document.getElementById("autoButton"),
      avgEntryValue: document.getElementById("avgEntryValue"),
      buyButton: document.getElementById("buyButton"),
      cashValue: document.getElementById("cashValue"),
      chart: document.getElementById("priceChart"),
      chartSubtitle: document.getElementById("chartSubtitle"),
      clearHistoryButton: document.getElementById("clearHistoryButton"),
      equityLabel: document.getElementById("equityLabel"),
      feedback: document.getElementById("feedback"),
      finishButton: document.getElementById("finishButton"),
      historyBody: document.getElementById("historyBody"),
      newGameButton: document.getElementById("newGameButton"),
      nextButton: document.getElementById("nextButton"),
      priceLabel: document.getElementById("priceLabel"),
      progressLabel: document.getElementById("progressLabel"),
      realizedValue: document.getElementById("realizedValue"),
      resultBenchmark: document.getElementById("resultBenchmark"),
      resultDrawdown: document.getElementById("resultDrawdown"),
      resultEquity: document.getElementById("resultEquity"),
      resultPanel: document.getElementById("resultPanel"),
      resultPnl: document.getElementById("resultPnl"),
      resultReturn: document.getElementById("resultReturn"),
      resultTitle: document.getElementById("resultTitle"),
      resultTrades: document.getElementById("resultTrades"),
      returnLabel: document.getElementById("returnLabel"),
      roundState: document.getElementById("roundState"),
      scenarioLabel: document.getElementById("scenarioLabel"),
      sellButton: document.getElementById("sellButton"),
      sharesValue: document.getElementById("sharesValue"),
      tradeCountValue: document.getElementById("tradeCountValue"),
      tradeLog: document.getElementById("tradeLog"),
      unrealizedValue: document.getElementById("unrealizedValue")
    };
  }

  function bindEvents() {
    dom.newGameButton.addEventListener("click", startRound);
    dom.finishButton.addEventListener("click", finishRound);
    dom.nextButton.addEventListener("click", nextCandle);
    dom.autoButton.addEventListener("click", toggleAutoPlay);
    dom.buyButton.addEventListener("click", handleBuy);
    dom.sellButton.addEventListener("click", handleSell);
    dom.clearHistoryButton.addEventListener("click", clearHistory);

    document.querySelectorAll("[data-size]").forEach(function eachSegment(button) {
      button.addEventListener("click", function onSizeClick() {
        document.querySelectorAll("[data-size]").forEach(function clearActive(node) {
          node.classList.remove("active");
        });
        button.classList.add("active");
        game.selectedFraction = Number(button.getAttribute("data-size"));
        render();
      });
    });

    root.addEventListener("resize", function onResize() {
      if (game.scenario) {
        drawChart();
      } else {
        drawEmptyChart();
      }
    });
  }

  function startRound() {
    stopAutoPlay();
    var scenario = scenarios[game.scenarioCursor % scenarios.length];
    game.scenarioCursor += 1;
    game.scenario = scenario;
    game.revealIndex = Math.min(INITIAL_WINDOW - 1, scenario.candles.length - 1);
    game.portfolio = logic.createPortfolio(logic.INITIAL_CASH);
    game.complete = false;
    logic.recordEquity(game.portfolio, currentPrice(), game.revealIndex);
    dom.resultPanel.classList.add("hidden");
    setFeedback("Round started. Future candles are hidden.");
    render();
  }

  function runDemoRound() {
    startRound();
    handleBuy();
    nextCandle();
    nextCandle();
    handleSell();
    setFeedback("Demo round loaded with sample buy and sell markers.");
    render();
  }

  function finishRound() {
    if (!game.scenario || game.complete) {
      return;
    }

    game.complete = true;
    stopAutoPlay();
    logic.recordEquity(game.portfolio, currentPrice(), game.revealIndex);
    var metrics = logic.computeRoundMetrics(game.portfolio, game.scenario, game.revealIndex, INITIAL_WINDOW);
    var record = {
      playedAt: new Date().toISOString(),
      scenario: game.scenario.symbol + " " + game.scenario.startDate + " to " + game.scenario.endDate,
      returnPct: metrics.totalReturnPct,
      profitLoss: metrics.profitLoss,
      trades: metrics.tradeCount
    };

    logic.addHistoryRecord(root.localStorage, HISTORY_KEY, record);
    renderResult(metrics);
    renderHistory();
    setFeedback("Round complete. Start another round when ready.");
    render();
  }

  function nextCandle() {
    if (!game.scenario || game.complete) {
      return;
    }

    if (game.revealIndex >= game.scenario.candles.length - 1) {
      finishRound();
      return;
    }

    game.revealIndex += 1;
    logic.recordEquity(game.portfolio, currentPrice(), game.revealIndex);
    setFeedback("Revealed one candle.");
    render();

    if (game.revealIndex >= game.scenario.candles.length - 1) {
      finishRound();
    }
  }

  function toggleAutoPlay() {
    if (game.autoTimer) {
      stopAutoPlay();
      setFeedback("Auto play stopped.");
      render();
      return;
    }

    if (!game.scenario || game.complete) {
      return;
    }

    game.autoTimer = root.setInterval(nextCandle, AUTO_INTERVAL_MS);
    setFeedback("Auto play is running.");
    render();
  }

  function stopAutoPlay() {
    if (game.autoTimer) {
      root.clearInterval(game.autoTimer);
      game.autoTimer = null;
    }
  }

  function handleBuy() {
    if (!game.scenario || game.complete) {
      return;
    }

    var price = currentPrice();
    var quantity = logic.buyQuantityFor(game.portfolio, price, game.selectedFraction);
    var result = logic.buy(game.portfolio, price, quantity, game.revealIndex);
    logic.recordEquity(game.portfolio, price, game.revealIndex);
    setFeedback(result.message);
    render();
  }

  function handleSell() {
    if (!game.scenario || game.complete) {
      return;
    }

    var price = currentPrice();
    var quantity = logic.sellQuantityFor(game.portfolio, game.selectedFraction);
    var result = logic.sell(game.portfolio, price, quantity, game.revealIndex);
    logic.recordEquity(game.portfolio, price, game.revealIndex);
    setFeedback(result.message);
    render();
  }

  function currentPrice() {
    return game.scenario ? game.scenario.candles[game.revealIndex].close : 0;
  }

  function render() {
    var hasRound = Boolean(game.scenario);
    var price = currentPrice();
    var snapshot = logic.snapshotPortfolio(game.portfolio, price);
    var lastIndex = hasRound ? game.scenario.candles.length - 1 : 0;
    var finished = hasRound && game.complete;

    dom.scenarioLabel.textContent = finished ? game.scenario.symbol : "Hidden";
    dom.progressLabel.textContent = hasRound ? (game.revealIndex + 1) + " / " + game.scenario.candles.length : "0 / 0";
    dom.priceLabel.textContent = money(price);
    dom.equityLabel.textContent = money(snapshot.equity);
    dom.returnLabel.textContent = percent(snapshot.returnPct);
    dom.returnLabel.className = snapshot.returnPct >= 0 ? "positive" : "negative";
    dom.cashValue.textContent = money(snapshot.cash);
    dom.sharesValue.textContent = formatQuantity(snapshot.shares) + " BTC";
    dom.avgEntryValue.textContent = money(snapshot.averageEntryPrice);
    dom.realizedValue.textContent = money(snapshot.realizedPnl);
    dom.realizedValue.className = snapshot.realizedPnl >= 0 ? "positive" : "negative";
    dom.unrealizedValue.textContent = money(snapshot.unrealizedPnl);
    dom.unrealizedValue.className = snapshot.unrealizedPnl >= 0 ? "positive" : "negative";
    dom.tradeCountValue.textContent = String(snapshot.tradeCount);
    dom.roundState.textContent = !hasRound ? "Idle" : finished ? "Complete" : game.autoTimer ? "Auto" : "Live";
    dom.chartSubtitle.textContent = chartSubtitle(hasRound, finished, lastIndex);

    dom.finishButton.disabled = !hasRound || finished;
    dom.nextButton.disabled = !hasRound || finished;
    dom.autoButton.disabled = !hasRound || finished;
    dom.autoButton.textContent = game.autoTimer ? "Stop Auto" : "Auto Play";
    dom.buyButton.disabled = !hasRound || finished;
    dom.sellButton.disabled = !hasRound || finished || game.portfolio.shares === 0;
    dom.newGameButton.textContent = hasRound ? "New Round" : "Start Round";

    renderTradeLog();

    if (hasRound) {
      drawChart();
    }
  }

  function chartSubtitle(hasRound, finished, lastIndex) {
    if (!hasRound) {
      return "Start a round to reveal the first candles.";
    }

    if (finished) {
      return game.scenario.symbol + " daily candles, " + game.scenario.startDate + " to " + game.scenario.endDate;
    }

    return game.scenario.symbol + " daily candles. Future candles hidden. Candle " + (game.revealIndex + 1) + " of " + (lastIndex + 1) + ".";
  }

  function renderTradeLog() {
    var entries = game.portfolio.tradeLog.slice(-8).reverse();
    dom.tradeLog.textContent = "";

    if (!entries.length) {
      var empty = document.createElement("li");
      empty.textContent = "No actions yet.";
      dom.tradeLog.appendChild(empty);
      return;
    }

    entries.forEach(function toListItem(trade) {
      var side = trade.side === "buy" ? "Bought" : "Sold";
      var pnl = trade.closedPnl === undefined ? "" : " P/L " + money(trade.closedPnl);
      var item = document.createElement("li");
      item.textContent = side + " " + formatQuantity(trade.quantity) + " BTC @ " + money(trade.price) + " on candle " + (trade.candleIndex + 1) + "." + pnl;
      dom.tradeLog.appendChild(item);
    });
  }

  function renderResult(metrics) {
    dom.resultPanel.classList.remove("hidden");
    dom.resultTitle.textContent = game.scenario.symbol + " - " + game.scenario.name;
    dom.resultEquity.textContent = money(metrics.finalEquity);
    dom.resultReturn.textContent = percent(metrics.totalReturnPct);
    dom.resultReturn.className = metrics.totalReturnPct >= 0 ? "positive" : "negative";
    dom.resultPnl.textContent = money(metrics.profitLoss);
    dom.resultPnl.className = metrics.profitLoss >= 0 ? "positive" : "negative";
    dom.resultBenchmark.textContent = percent(metrics.buyHoldReturnPct);
    dom.resultTrades.textContent = String(metrics.tradeCount);
    dom.resultDrawdown.textContent = percent(metrics.maxDrawdownPct);
  }

  function renderHistory() {
    var history = logic.safeLoadHistory(root.localStorage, HISTORY_KEY);
    dom.historyBody.textContent = "";

    if (!history.length) {
      var emptyRow = document.createElement("tr");
      var emptyCell = document.createElement("td");
      emptyCell.colSpan = 5;
      emptyCell.textContent = "No completed rounds yet.";
      emptyRow.appendChild(emptyCell);
      dom.historyBody.appendChild(emptyRow);
      return;
    }

    history.forEach(function toRow(record) {
      var cls = record.returnPct >= 0 ? "positive" : "negative";
      var row = document.createElement("tr");

      appendCell(row, safeDateLabel(record.playedAt));
      appendCell(row, record.scenario);
      appendCell(row, percent(record.returnPct), cls);
      appendCell(row, money(record.profitLoss), record.profitLoss >= 0 ? "positive" : "negative");
      appendCell(row, String(record.trades));

      dom.historyBody.appendChild(row);
    });
  }

  function appendCell(row, text, className) {
    var cell = document.createElement("td");
    if (className) {
      cell.className = className;
    }
    cell.textContent = text;
    row.appendChild(cell);
  }

  function safeDateLabel(value) {
    var date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Unknown" : date.toLocaleString();
  }

  function clearHistory() {
    root.localStorage.removeItem(HISTORY_KEY);
    renderHistory();
    setFeedback("Local history cleared.");
  }

  function drawEmptyChart() {
    var ctx = setupCanvas();
    var size = chartSize();
    var width = size.width;
    var height = size.height;
    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height, { top: 28, right: 54, bottom: 34, left: 54 });
    ctx.fillStyle = "#667085";
    ctx.font = "700 18px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("Start a round to load a hidden chart", width / 2, height / 2);
  }

  function drawChart() {
    var ctx = setupCanvas();
    var size = chartSize();
    var width = size.width;
    var height = size.height;
    var pad = { top: 24, right: 58, bottom: 38, left: 58 };
    var candles = game.scenario.candles.slice(0, game.revealIndex + 1);
    var visibleStart = Math.max(0, candles.length - MAX_VISIBLE_CANDLES);
    var visible = candles.slice(visibleStart);
    var prices = visible.reduce(function collect(list, candle) {
      list.push(candle.high, candle.low);
      return list;
    }, []);
    var min = Math.min.apply(null, prices);
    var max = Math.max.apply(null, prices);
    var range = Math.max(1, max - min);

    min -= range * 0.08;
    max += range * 0.08;

    ctx.clearRect(0, 0, width, height);
    drawGrid(ctx, width, height, pad);
    drawCandles(ctx, visible, width, height, pad, min, max);
    drawEquityLine(ctx, width, height, pad);
    drawTradeMarkers(ctx, visibleStart, visible.length, width, height, pad, min, max);
    drawPriceAxis(ctx, width, height, pad, min, max);
  }

  function setupCanvas() {
    var rect = dom.chart.getBoundingClientRect();
    var ratio = root.devicePixelRatio || 1;
    dom.chart.width = Math.max(1, Math.floor(rect.width * ratio));
    dom.chart.height = Math.max(1, Math.floor(rect.height * ratio));
    var ctx = dom.chart.getContext("2d");
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    return ctx;
  }

  function chartSize() {
    var rect = dom.chart.getBoundingClientRect();
    return {
      width: Math.max(1, rect.width),
      height: Math.max(1, rect.height)
    };
  }

  function drawGrid(ctx, width, height, pad) {
    ctx.strokeStyle = "#e4e9f0";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= 5; i += 1) {
      var y = pad.top + ((height - pad.top - pad.bottom) * i) / 5;
      ctx.moveTo(pad.left, y);
      ctx.lineTo(width - pad.right, y);
    }
    for (var xLine = 0; xLine <= 8; xLine += 1) {
      var x = pad.left + ((width - pad.left - pad.right) * xLine) / 8;
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, height - pad.bottom);
    }
    ctx.stroke();
  }

  function drawCandles(ctx, candles, width, height, pad, min, max) {
    var chartWidth = width - pad.left - pad.right;
    var slot = chartWidth / Math.max(candles.length, 1);
    var bodyWidth = Math.max(4, Math.min(12, slot * 0.58));

    candles.forEach(function eachCandle(candle, index) {
      var x = pad.left + slot * index + slot / 2;
      var openY = yFor(candle.open, min, max, height, pad);
      var closeY = yFor(candle.close, min, max, height, pad);
      var highY = yFor(candle.high, min, max, height, pad);
      var lowY = yFor(candle.low, min, max, height, pad);
      var up = candle.close >= candle.open;

      ctx.strokeStyle = up ? "#0f9f6e" : "#dc3e42";
      ctx.fillStyle = up ? "#0f9f6e" : "#dc3e42";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, highY);
      ctx.lineTo(x, lowY);
      ctx.stroke();
      ctx.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(2, Math.abs(closeY - openY)));
    });
  }

  function drawTradeMarkers(ctx, visibleStart, visibleCount, width, height, pad, min, max) {
    if (!game.portfolio.tradeLog.length) {
      return;
    }

    var chartWidth = width - pad.left - pad.right;
    var slot = chartWidth / Math.max(visibleCount, 1);

    game.portfolio.tradeLog.forEach(function eachTrade(trade) {
      if (trade.candleIndex < visibleStart || trade.candleIndex > game.revealIndex) {
        return;
      }

      var relativeIndex = trade.candleIndex - visibleStart;
      var x = pad.left + slot * relativeIndex + slot / 2;
      var y = yFor(trade.price, min, max, height, pad);
      drawTradeMarker(ctx, x, y, trade.side);
    });
  }

  function drawTradeMarker(ctx, x, y, side) {
    var isBuy = side === "buy";
    var fill = isBuy ? "#2563eb" : "#7c3aed";
    var label = isBuy ? "B" : "S";
    var direction = isBuy ? -1 : 1;

    ctx.save();
    ctx.translate(x, y + direction * 14);
    ctx.fillStyle = fill;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, direction * -10);
    ctx.lineTo(8, direction * 8);
    ctx.lineTo(-8, direction * 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.font = "700 9px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 0, direction * 3);
    ctx.restore();
  }

  function drawEquityLine(ctx, width, height, pad) {
    if (game.portfolio.equityCurve.length < 2) {
      return;
    }

    var visibleStart = Math.max(0, game.revealIndex + 1 - MAX_VISIBLE_CANDLES);
    var points = game.portfolio.equityCurve.filter(function isVisible(point) {
      return point.candleIndex >= visibleStart && point.candleIndex <= game.revealIndex;
    });

    if (points.length < 2) {
      return;
    }

    var equities = points.map(function toEquity(point) { return point.equity; });
    var min = Math.min.apply(null, equities);
    var max = Math.max.apply(null, equities);
    var range = Math.max(1, max - min);
    min -= range * 0.1;
    max += range * 0.1;

    ctx.strokeStyle = "#b7791f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(function eachPoint(point, index) {
      var relativeIndex = point.candleIndex - visibleStart;
      var visibleCount = Math.min(MAX_VISIBLE_CANDLES, game.revealIndex - visibleStart + 1);
      var x = pad.left + ((width - pad.left - pad.right) * relativeIndex) / Math.max(1, visibleCount - 1);
      var y = yFor(point.equity, min, max, height, pad);
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    ctx.stroke();
  }

  function drawPriceAxis(ctx, width, height, pad, min, max) {
    ctx.fillStyle = "#667085";
    ctx.font = "12px sans-serif";
    ctx.textAlign = "left";
    for (var i = 0; i <= 5; i += 1) {
      var value = max - ((max - min) * i) / 5;
      var y = pad.top + ((height - pad.top - pad.bottom) * i) / 5;
      ctx.fillText("$" + value.toFixed(2), width - pad.right + 8, y + 4);
    }
  }

  function yFor(value, min, max, height, pad) {
    var plotHeight = height - pad.top - pad.bottom;
    return pad.top + ((max - value) / (max - min)) * plotHeight;
  }

  function money(value) {
    return Number(value).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    });
  }

  function percent(value) {
    return Number(value).toFixed(2) + "%";
  }

  function formatQuantity(value) {
    return Number(value).toLocaleString("en-US", {
      maximumFractionDigits: 6
    });
  }

  function setFeedback(message) {
    dom.feedback.textContent = message;
  }

})(window);
