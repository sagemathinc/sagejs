import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium as playwrightChromium } from "playwright-core";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const chromium = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));
assert.ok(chromium, "Chromium not found; set SAGEJS_CHROMIUM");

const contentTypes = new Map([
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
  if (pathname === "/proof.html") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Fmpq resource proof</title>");
    return;
  }
  const filename = path.resolve(packageRoot, pathname.slice(1));
  if (!filename.startsWith(`${packageRoot}${path.sep}`) ||
      !fs.existsSync(filename) || fs.statSync(filename).isDirectory()) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, {
    "Content-Type":
      contentTypes.get(path.extname(filename)) ?? "application/octet-stream",
  });
  fs.createReadStream(filename).pipe(response);
});

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();
const browser = await playwrightChromium.launch({
  executablePath: chromium,
  headless: true,
  args: [
    "--no-sandbox",
    "--disable-dev-shm-usage",
    "--disable-gpu",
    "--js-flags=--expose-gc",
  ],
});

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${port}/proof.html`);
  const proof = await page.evaluate(async () => {
    const { instantiateFlintFactor } = await import("/index.mjs");
    const wasm = await fetch("/dist/flint-factor.wasm").then((response) =>
      response.arrayBuffer()
    );
    const flint = await instantiateFlintFactor(wasm);
    const decoder = new TextDecoder();

    function appendInteger(output, value, signed) {
      value = BigInt(value);
      const negative = value < 0n;
      let magnitude = negative ? -value : value;
      const bytes = [];
      while (magnitude !== 0n) {
        bytes.push(Number(magnitude & 255n));
        magnitude >>= 8n;
      }
      let header = bytes.length;
      if (signed && negative) header += 0x80000000;
      output.push(
        header & 255,
        (header >>> 8) & 255,
        (header >>> 16) & 255,
        (header >>> 24) & 255,
        ...bytes,
      );
    }

    function packedRationals(entries) {
      const output = [];
      for (const [numerator, denominator] of entries) {
        appendInteger(output, numerator, true);
        appendInteger(output, denominator, false);
      }
      return Uint8Array.from(output);
    }

    function entry(matrix, row, column) {
      return [
        flint.ffiFmpqMatrixEntryNumerator(matrix, BigInt(row), BigInt(column)),
        flint.ffiFmpqMatrixEntryDenominator(
          matrix,
          BigInt(row),
          BigInt(column),
        ),
      ].map(String);
    }

    function closeTwice(resource, operation) {
      operation(resource);
      operation(resource);
    }

    const ingress = flint.ffiFlintByteRegionFromBytes(packedRationals([
      [1n, 2n],
      [1n, 3n],
      [2n, 1n],
      [-1n, 1n],
    ]));
    const matrix = flint.ffiFmpqMatrixDeserialize(ingress, 2n, 2n);
    closeTwice(ingress, flint.ffiFlintByteRegionClose);
    const copy = flint.ffiFmpqMatrixCopy(matrix);
    const product = flint.ffiFmpqMatrixMul(matrix, copy);
    const reduced = flint.ffiFmpqMatrixRref(matrix);
    const determinant = flint.ffiFmpqMatrixDet(matrix);
    const formatted = flint.ffiFmpqMatrixFormat(product);
    const formattedBytes = flint.ffiFlintByteRegionCopyBytes(formatted);
    closeTwice(formatted, flint.ffiFlintByteRegionClose);
    const serialized = flint.ffiFmpqMatrixSerialize(product);
    const serializedBytes = flint.ffiFlintByteRegionCopyBytes(serialized);
    closeTwice(serialized, flint.ffiFlintByteRegionClose);
    const restoredIngress = flint.ffiFlintByteRegionFromBytes(serializedBytes);
    const restored = flint.ffiFmpqMatrixDeserialize(
      restoredIngress,
      2n,
      2n,
    );
    closeTwice(restoredIngress, flint.ffiFlintByteRegionClose);

    const beforeRejectedWrite = entry(matrix, 0, 0);
    let rejectedWrite = false;
    try {
      flint.ffiFmpqMatrixSetEntry(matrix, 0n, 0n, 7n, 0n);
    } catch (error) {
      rejectedWrite = /invalid rational matrix entry/.test(error.message);
    }
    const incompatible = flint.ffiFmpqMatrixCreate(1n, 1n);
    const liveBeforeRejectedResult =
      flint.__sagejs_wasm_resource_live_count__();
    let rejectedResult = false;
    try {
      flint.ffiFmpqMatrixMul(matrix, incompatible);
    } catch (error) {
      rejectedResult = /dimensions are incompatible/.test(error.message);
    }
    const liveAfterRejectedResult =
      flint.__sagejs_wasm_resource_live_count__();

    const result = {
      resources: flint.__sagejs_ffi_manifest__.resources,
      rows: String(flint.ffiFmpqMatrixNrows(restored)),
      columns: String(flint.ffiFmpqMatrixNcols(restored)),
      product00: entry(product, 0, 0),
      restored11: entry(restored, 1, 1),
      reducedRank: String(flint.ffiFmpqMatrixRank(reduced)),
      determinant: [
        String(flint.ffiFmpqValueNumerator(determinant)),
        String(flint.ffiFmpqValueDenominator(determinant)),
      ],
      formatted: decoder.decode(formattedBytes),
      copiedBytesStable: serializedBytes.byteLength > 0,
      rejectedWrite,
      rejectedWriteAtomic:
        JSON.stringify(entry(matrix, 0, 0)) ===
        JSON.stringify(beforeRejectedWrite),
      rejectedResult,
      rejectedResultAtomic:
        liveBeforeRejectedResult === liveAfterRejectedResult,
    };

    closeTwice(incompatible, flint.ffiFmpqMatrixClose);
    closeTwice(restored, flint.ffiFmpqMatrixClose);
    closeTwice(reduced, flint.ffiFmpqMatrixClose);
    closeTwice(product, flint.ffiFmpqMatrixClose);
    closeTwice(copy, flint.ffiFmpqMatrixClose);
    closeTwice(matrix, flint.ffiFmpqMatrixClose);
    closeTwice(determinant, flint.ffiFmpqValueClose);
    result.liveAfterDeterministicClose = String(
      flint.__sagejs_wasm_resource_live_count__(),
    );

    (() => {
      const temporary = flint.ffiFmpqMatrixCreate(1n, 1n);
      flint.ffiFmpqMatrixCopy(temporary);
      flint.ffiFmpqMatrixDet(temporary);
    })();
    result.liveBeforeFinalization = String(
      flint.__sagejs_wasm_resource_live_count__(),
    );
    for (let attempt = 0;
      attempt < 50 && flint.__sagejs_wasm_resource_live_count__() !== 0n;
      attempt += 1) {
      globalThis.gc();
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    result.liveAfterFinalization = String(
      flint.__sagejs_wasm_resource_live_count__(),
    );
    return result;
  });

  assert.ok(proof.resources.includes("fmpq_matrix"));
  assert.ok(proof.resources.includes("fmpq_value"));
  assert.ok(proof.resources.includes("byte_region"));
  assert.deepEqual(proof, {
    ...proof,
    rows: "2",
    columns: "2",
    product00: ["11", "12"],
    restored11: ["5", "3"],
    reducedRank: "2",
    determinant: ["-7", "6"],
    formatted: "[11/12  -1/6]\n[   -1   5/3]",
    copiedBytesStable: true,
    rejectedWrite: true,
    rejectedWriteAtomic: true,
    rejectedResult: true,
    rejectedResultAtomic: true,
    liveAfterDeterministicClose: "0",
    liveBeforeFinalization: "3",
    liveAfterFinalization: "0",
  });
  process.stdout.write(
    "Generated FmpqMatrix resources passed real Chromium lifecycle proof\n",
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
