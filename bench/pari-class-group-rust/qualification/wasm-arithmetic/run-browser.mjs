import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium, firefox, webkit } from "playwright-core";
import { executablePathFor } from "../../../../packages/flint-wasm/test/browser-wasm-support.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const repository = path.resolve(root, "../../../..");
const artifact = path.join(root, "target/wasm32-wasip1/release/sagejs_rust_wasm_arithmetic_probe.wasm");
const browserTypes = { chromium, firefox, webkit };
const sampleCount = Number(process.env.SAGEJS_WASM_ARITHMETIC_SAMPLES ?? 15);
assert.ok(Number.isSafeInteger(sampleCount) && sampleCount >= 3 && sampleCount <= 100);

function statistics(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((value) => Math.abs(value - median)).sort((left, right) => left - right);
  return {
    samples: values,
    median,
    min: sorted[0],
    max: sorted.at(-1),
    mad: deviations[Math.floor(deviations.length / 2)],
  };
}

const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  const routes = new Map([
    ["/probe.wasm", artifact],
    ["/wasi-runtime.mjs", path.join(repository, "packages/flint-wasm/src/wasi-runtime.mjs")],
    ["/wasi-filesystem.mjs", path.join(repository, "packages/flint-wasm/src/wasi-filesystem.mjs")],
    ["/wasi-constants.mjs", path.join(repository, "packages/flint-wasm/src/wasi-constants.mjs")],
  ]);
  if (pathname === "/") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Sage.js Rust GMP Wasm probe</title>");
    return;
  }
  const filename = routes.get(pathname);
  if (!filename) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type": pathname.endsWith(".wasm") ? "application/wasm" : "text/javascript; charset=utf-8",
  });
  fs.createReadStream(filename).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

const observations = [];
try {
  for (const [engine, browserType] of Object.entries(browserTypes)) {
    const executablePath = executablePathFor(engine, browserType);
    assert.ok(executablePath, `${engine} is unavailable`);
    const browser = await browserType.launch({
      executablePath,
      headless: true,
      args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    });
    try {
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}/`);
      const result = await page.evaluate(async (samples) => {
        const { createWasiHost } = await import("/wasi-runtime.mjs");
        const compileStarted = performance.now();
        const module = await WebAssembly.compileStreaming(fetch("/probe.wasm"));
        const compileMs = performance.now() - compileStarted;
        const results = [];
        for (let sample = 0; sample < samples; sample += 1) {
          let stderr = "";
          const wasi = createWasiHost({ stderr: (text) => { stderr += text; } });
          let instance;
          const imports = {
            ...wasi.imports,
            environ_get: () => 0,
            environ_sizes_get: (countPointer, bytesPointer) => {
              const view = new DataView(instance.exports.memory.buffer);
              view.setUint32(countPointer, 0, true);
              view.setUint32(bytesPointer, 0, true);
              return 0;
            },
          };
          const instantiateStarted = performance.now();
          instance = await WebAssembly.instantiate(module, {
            wasi_snapshot_preview1: imports,
          });
          wasi.initialize(instance);
          const instantiateMs = performance.now() - instantiateStarted;
          const memoryPagesBefore = instance.exports.memory.buffer.byteLength / 65_536;
          const computeStarted = performance.now();
          const status = instance.exports.sagejs_probe_status();
          const computeMs = performance.now() - computeStarted;
          const memoryPagesAfter = instance.exports.memory.buffer.byteLength / 65_536;
          const pointer = instance.exports.sagejs_probe_result_ptr();
          const length = instance.exports.sagejs_probe_result_len();
          const payload = new TextDecoder().decode(
            new Uint8Array(instance.exports.memory.buffer, pointer, length),
          );
          wasi.dispose();
          results.push({
            status,
            stderr,
            payload,
            instantiateMs,
            computeMs,
            memoryPagesBefore,
            memoryPagesAfter,
          });
        }
        return {
          compileMs,
          userAgent: navigator.userAgent,
          crossOriginIsolated: globalThis.crossOriginIsolated,
          sharedArrayBuffer: typeof SharedArrayBuffer === "function",
          results,
        };
      }, sampleCount);
      const hashes = [];
      for (const sample of result.results) {
        assert.equal(sample.status, 0, sample.stderr);
        JSON.parse(sample.payload);
        const hash = crypto.createHash("sha256").update(sample.payload).digest("hex");
        assert.equal(hash, "973f49930a209bd05f97d723416d155e8ac432bb120998e19248877b33f22eb2");
        hashes.push(hash);
      }
      assert.equal(new Set(hashes).size, 1);
      observations.push({
        engine,
        version: browser.version(),
        executablePath,
        userAgent: result.userAgent,
        crossOriginIsolated: result.crossOriginIsolated,
        sharedArrayBuffer: result.sharedArrayBuffer,
        sampleCount,
        compileMs: result.compileMs,
        instantiateMs: statistics(result.results.map((sample) => sample.instantiateMs)),
        computeMs: statistics(result.results.map((sample) => sample.computeMs)),
        memoryPagesBefore: [...new Set(result.results.map((sample) => sample.memoryPagesBefore))],
        memoryPagesAfter: [...new Set(result.results.map((sample) => sample.memoryPagesAfter))],
        resultBytes: result.results[0].payload.length,
        sha256: hashes[0],
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}

process.stdout.write(`${JSON.stringify({
  runtime: "actual-browsers-sagejs-wasi-host",
  wasmBytes: fs.statSync(artifact).size,
  observations,
})}\n`);
