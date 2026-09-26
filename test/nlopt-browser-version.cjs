// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { dirname, join } = require("node:path");
const test = require("node:test");

const selection = require("../src/lib/sagejs/numerics/optimization/backends/nlopt/qualification/selection-v1.json");
const browsers = require(join(dirname(require.resolve("playwright-core")), "browsers.json")).browsers;

test("NLopt browser qualification pins the installed Playwright Chromium", () => {
  const chromium = browsers.find((browser) => browser.name === "chromium");
  assert.ok(chromium, "Playwright must declare Chromium");
  assert.equal(selection.browser_evidence.engine, "chromium");
  assert.equal(selection.browser_evidence.version, chromium.browserVersion);
});
