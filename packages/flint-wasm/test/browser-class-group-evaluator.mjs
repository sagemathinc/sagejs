import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, firefox, webkit } from "playwright-core";

import { executablePathFor } from "./browser-wasm-support.mjs";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifact = path.join(packageRoot, "dist", "class-group-core.wasm");
const receipt = path.join(packageRoot, "dist", "class-group-core-receipt.json");

if (!fs.existsSync(artifact) || !fs.existsSync(receipt)) {
  console.log("SKIP browser class-group evaluator: production artifact is not built");
  process.exit(0);
}

const contentTypes = new Map([
  [".mjs", "text/javascript"],
  [".json", "application/json"],
  [".wasm", "application/wasm"],
]);
const server = http.createServer((request, response) => {
  const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  if (pathname === "/") {
    response.writeHead(200, { "content-type": "text/html" }).end("<!doctype html><title>class group</title>");
    return;
  }
  const filename = path.resolve(packageRoot, `.${pathname}`);
  if (!filename.startsWith(`${packageRoot}${path.sep}`) || !fs.existsSync(filename)) {
    response.writeHead(404).end("not found");
    return;
  }
  response.writeHead(200, {
    "content-type": contentTypes.get(path.extname(filename)) ?? "application/octet-stream",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  fs.createReadStream(filename).pipe(response);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;

try {
  for (const [name, browserType] of Object.entries({ chromium, firefox, webkit })) {
    const executablePath = executablePathFor(name, browserType);
    if (!executablePath) {
      console.log(`SKIP ${name}: compatible browser executable is not installed`);
      continue;
    }
    const browser = await browserType.launch({
      executablePath,
      headless: true,
      args: name === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
    });
    try {
      const page = await browser.newPage();
      await page.goto(origin);
      const result = await page.evaluate(async (base) => {
        const { createClassGroupEvaluatorBackend } = await import(`${base}/evaluator.mjs`);
        const backend = await createClassGroupEvaluatorBackend({
          artifact: `${base}/dist/class-group-core.wasm`,
          receipt: `${base}/dist/class-group-core-receipt.json`,
        });
        try {
          const capability = backend.call("capability", {});
          return {
            capability,
            promise: capability instanceof Promise,
            diagnostics: backend.diagnostics(),
          };
        } finally {
          backend.close();
        }
      }, origin);
      assert.equal(result.promise, false, name);
      assert.equal(result.capability.outcome, "available", name);
      assert.match(result.capability.artifactSha256, /^[a-f0-9]{64}$/, name);
      assert.equal(result.diagnostics.maximumMemoryPages, 4096, name);
      assert.equal(result.diagnostics.maximumMemoryBytes, 256 * 1024 * 1024, name);
      const publicResult = await page.evaluate(async (base) => {
        const { createSage } = await import(`${base}/kernel.mjs`);
        const sage = await createSage({ timeout: 120_000 });
        try {
          const answer = await sage.evaluate([
            "R.<x> = QQ[]",
            "K.<a> = NumberField(x^2 + 23)",
            "G = K.class_group(algorithm='rust')",
            "[G.order(), G.invariants(), G.proof_status,",
            " G(G.gen().ideal()).coordinates(), K.class_number(algorithm='rust'),",
            " QuadraticField(-8173415).class_number(algorithm='rust')]",
          ].join("\n"));
          return answer.repr;
        } finally {
          await sage.close();
        }
      }, origin);
      assert.equal(publicResult, "[3, (3,), 'exact-unconditional', (1,), 3, 4378]", name);
      console.log(`PASS ${name}: public unconditional class group and exact ideal map`);
    } finally {
      await browser.close();
    }
  }
} finally {
  await new Promise((resolve) => server.close(resolve));
}
