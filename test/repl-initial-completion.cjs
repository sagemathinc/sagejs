// sagejs-test-tier: unit
// sagejs-test-platform: true
"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { PassThrough } = require("node:stream");

const Repl = require("../dist/tools/repl.js").default;

(async () => {
  let readlineCompleter;
  let mockReadline;

  function createMockReadline(options) {
    readlineCompleter = options.completer;
    mockReadline = new EventEmitter();
    mockReadline.closed = false;
    mockReadline.history = [];
    mockReadline.setPrompt = () => {};
    mockReadline.prompt = () => {};
    mockReadline.write = () => {};
    return mockReadline;
  }

  const controller = await Repl({
    input: new PassThrough(),
    output: new PassThrough(),
    console: {
      log() {},
      warn() {},
      error(error) {
        throw error;
      },
    },
    mockReadline: createMockReadline,
    terminal: false,
    show_js: false,
    histfile: false,
    sage: true,
  });

  assert.equal(typeof readlineCompleter, "function");
  const [items, prefix] = await new Promise((resolve, reject) => {
    readlineCompleter("Hyper", (error, result) => {
      if (error) reject(error);
      else resolve(result);
    });
  });
  assert.equal(prefix, "Hyper");
  assert.ok(
    items.includes("HyperellipticCurve"),
    "fresh Sage completion omitted a runtime-visible global",
  );
  assert.deepEqual(
    readlineCompleter("Hyper"),
    [items, prefix],
    "completion should remain synchronously available after initialization",
  );

  mockReadline.closed = true;
  mockReadline.emit("close");
  await controller.finished();
  console.log("Fresh REPL completion initializes the Sage namespace.");
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
