"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

var root = path.resolve(__dirname, "..");
var html = fs.readFileSync(path.join(root, "index.html"), "utf8");
var app = fs.readFileSync(path.join(root, "src", "app.js"), "utf8");

["src/gameLogic.js", "src/scenarios.js", "src/app.js", "styles.css"].forEach(function assertReferenced(asset) {
  assert.ok(html.indexOf(asset) !== -1, asset + " is referenced by index.html");
  assert.ok(fs.existsSync(path.join(root, asset)), asset + " exists");
});

var idMatches = app.match(/getElementById\("([^"]+)"\)/g) || [];
idMatches.forEach(function assertDomId(match) {
  var id = match.match(/"([^"]+)"/)[1];
  assert.ok(html.indexOf("id=\"" + id + "\"") !== -1, "Missing DOM id: " + id);
});

assert.ok(html.indexOf("Start Round") !== -1, "Start action is present");
assert.ok(html.indexOf("Buy") !== -1, "Buy action is present");
assert.ok(html.indexOf("Sell") !== -1, "Sell action is present");
assert.ok(html.indexOf("<dt>BTC</dt>") !== -1, "Portfolio uses BTC units");
assert.ok(html.indexOf("buy-marker") !== -1, "Buy marker legend is present");
assert.ok(html.indexOf("sell-marker") !== -1, "Sell marker legend is present");
assert.ok(html.indexOf("Recent Results") !== -1, "History panel is present");
assert.ok(app.indexOf("function drawTradeMarkers") !== -1, "Trade marker drawing is implemented");
assert.ok(app.indexOf("function drawTradeMarker") !== -1, "Trade marker glyph drawing is implemented");
assert.ok(app.indexOf("function runDemoRound") !== -1, "Demo mode renders sample trades for screenshots");

var renderHistoryBody = app.slice(app.indexOf("function renderHistory()"), app.indexOf("function appendCell"));
assert.ok(renderHistoryBody.indexOf("innerHTML") === -1, "History rendering does not use innerHTML");
assert.ok(renderHistoryBody.indexOf("textContent") !== -1, "History rendering writes text content");

console.log("static tests passed");
