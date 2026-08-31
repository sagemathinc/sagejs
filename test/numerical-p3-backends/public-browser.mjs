// sagejs-test-tier: specialized

import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import test from "node:test";

import { chromium } from "playwright-core";

const packageRoot = path.resolve(import.meta.dirname, "../../packages/flint-wasm");
const executablePath = [
  process.env.SAGEJS_CHROMIUM,
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
].filter(Boolean).find((candidate) => fs.existsSync(candidate));

test("a real browser routes public least_squares through lazy cminpack", {
  skip: executablePath ? false : "Chromium is not installed",
  timeout: 180_000,
}, async () => {
  const contentTypes = new Map([
    [".html", "text/html; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".json", "application/json"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".wasm", "application/wasm"],
  ]);
  const server = http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://x").pathname);
    const relative = pathname === "/" ? "demo/index.html" : pathname.slice(1);
    const filename = path.resolve(packageRoot, relative);
    if (!filename.startsWith(`${packageRoot}${path.sep}`) || !fs.existsSync(filename)) {
      response.writeHead(404).end("not found");
      return;
    }
    const actual = fs.statSync(filename).isDirectory()
      ? path.join(filename, "index.html")
      : filename;
    response.writeHead(200, {
      "Content-Type": contentTypes.get(path.extname(actual)) ?? "application/octet-stream",
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    });
    fs.createReadStream(actual).pipe(response);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${port}/`);
    const results = await page.evaluate(async () => {
      const { createSage } = await import("/kernel.mjs");
      const session = await createSage({ timeout: 120_000 });
      try {
        const ordinary = await session.evaluate(`
from sagejs.numerics.optimization import minimize_scalar
answer = minimize_scalar(lambda x: (x - 2.0)**2, -5.0, 5.0)
print(answer.backend)
print(answer.success)
`, { timeout: 120_000 });
        const explicit = await session.evaluate(`
from sagejs.numerics.optimization import least_squares
def residual(point):
    x, y = point
    return [10.0 * (y - x*x), 1.0 - x]
answer = least_squares(residual, [-1.2, 1.0], method="cminpack-lmdif")
print(answer.method)
print(answer.backend)
print(answer.success and answer.validation.passed)
print(max(abs(answer.value[0] - 1.0), abs(answer.value[1] - 1.0)) < 1.0e-8)
`, { timeout: 120_000 });
        return { ordinary, explicit };
      } finally {
        await session.close();
      }
    });
    assert.equal(results.ordinary.stderr, "");
    assert.equal(results.ordinary.stdout, "ordinary-python\nTrue\n");
    assert.equal(
      results.ordinary.instrumentation.routes.some(
        ({ capability_id }) =>
          capability_id === "wasm-library:cminpack:least-squares-explicit",
      ),
      false,
      "merely importing optimization must not claim cminpack execution",
    );
    assert.equal(results.explicit.stderr, "");
    assert.equal(
      results.explicit.stdout,
      "cminpack-lmdif\ncminpack-wasm\nTrue\nTrue\n",
    );
    assert.deepEqual(
      results.explicit.instrumentation.routes.filter(
        ({ capability_id }) =>
          capability_id === "wasm-library:cminpack:least-squares-explicit",
      ),
      [{
        capability_id: "wasm-library:cminpack:least-squares-explicit",
        selected_route: "receipt-backed-wasm-artifact",
        execution_target: "wasm-artifact",
        call_count: 1,
        ingress_bytes: 0,
        egress_bytes: 0,
      }],
    );
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
