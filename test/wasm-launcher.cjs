// sagejs-test-tier: unit
"use strict";

const assert = require("node:assert/strict");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { join } = require("node:path");
const test = require("node:test");

const {
  runWasmCli,
  wasmArguments,
} = require("../bin/wasm-launcher.cjs");

const execFileAsync = promisify(execFile);

test("the Wasm execution mode is an explicit leading option", () => {
  assert.deepEqual(wasmArguments(["--wasm", "-c", "2 + 3"]), ["-c", "2 + 3"]);
  assert.equal(wasmArguments(["-c", "--wasm"]), undefined);
  assert.equal(wasmArguments([]), undefined);
});

test("the Wasm launcher forwards arguments without loading a native backend", async () => {
  let received;
  const status = await runWasmCli({
    argv: ["--wasm", "--timeout", "25", "-c", "factor(2026)"],
    loadCli: async () => ({
      async runCli(options) {
        received = options.argv;
      },
    }),
  });
  assert.equal(status, 0);
  assert.deepEqual(received, ["--timeout", "25", "-c", "factor(2026)"]);
});

test("the Wasm launcher preserves timeout and ordinary failure status", async () => {
  const errorOutput = { value: "", write(text) { this.value += text; } };
  const timeout = new Error("timed out");
  timeout.name = "SageSessionTimeoutError";
  assert.equal(await runWasmCli({
    argv: ["--wasm", "-c", "while True: pass"],
    errorOutput,
    loadCli: async () => ({ async runCli() { throw timeout; } }),
  }), 124);
  assert.match(errorOutput.value, /SageSessionTimeoutError: timed out/);

  errorOutput.value = "";
  assert.equal(await runWasmCli({
    argv: ["--wasm", "--broken"],
    errorOutput,
    loadCli: async () => ({ async runCli() { throw new Error("broken"); } }),
  }), 1);
  assert.match(errorOutput.value, /Error: broken/);
});

test("the public sagejs command exposes the receipt-backed Wasm CLI", async () => {
  const root = join(__dirname, "..");
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [join(root, "bin", "sagejs"), "--wasm", "--help"],
    { cwd: root, env: { ...process.env, SAGEJS_USE_SOURCE: "0" } },
  );
  assert.equal(stderr, "");
  assert.match(stdout, /sagejs --wasm \[OPTIONS\]/);
  assert.match(stdout, /receipt-authenticated WebAssembly artifact/);
});
