import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import {
  createBrowserWasmServer,
  executablePathFor,
} from "./browser-wasm-support.mjs";

const executablePath = executablePathFor("chromium", chromium);
assert.ok(executablePath, "Chromium is required for browser dynamic-code tests");

const browser = await chromium.launch({
  executablePath,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

try {
  for (const isolated of [true, false]) {
    const server = await createBrowserWasmServer({
      release: `dynamic-code-${isolated ? "isolated" : "portable"}`,
      crossOriginIsolation: isolated,
    });
    try {
      const context = await browser.newContext({ serviceWorkers: "block" });
      const page = await context.newPage();
      const pageErrors = [];
      page.on("pageerror", (error) =>
        pageErrors.push(String(error.stack ?? error))
      );
      await page.goto(`${server.origin}/browser-wasm-harness.html`, {
        waitUntil: "load",
      });
      await page.waitForFunction(() => window.__sagejsReady !== undefined);
      await page.evaluate(() => window.__sagejsReady);
      assert.equal(
        await page.evaluate(() => globalThis.crossOriginIsolated),
        isolated,
      );

      const evaluate = (source, timeout = 120_000) => page.evaluate(
        ([program, limit]) => window.__sagejsTest.evaluate(program, limit),
        [source, timeout],
      );

      if (isolated) {
        const language = await evaluate(
          "ns = {'a': 6, 'b': 7}\n" +
            "code = compile('a*b + 1', '<dynamic-eval>', 'eval')\n" +
            "print(eval(code, ns))\n" +
            "exec('c = a-b', ns)\n" +
            "print(ns['c'])\n" +
            "α = 2\n" +
            "print(eval('α + 1'))\n" +
            "print(eval('sum(i*i for i in range(5))'))\n" +
            "try:\n" +
            "    compile('def broken(', '<dynamic-syntax>', 'exec')\n" +
            "except SyntaxError:\n" +
            "    print('syntax-error')",
        );
        assert.equal(language.repr, "");
        assert.equal(language.stdout, "43\n-1\n3\n30\nsyntax-error\n");
      }

      const mpmath = await evaluate(
        "from mpmath import mp\n" +
          "mp.dps = 30\n" +
          "x = mp.mpf('1.25')\n" +
          "print(float((x + 2) * 3))\n" +
          "print(float(mp.hyp2f1(1, 2, 3, mp.mpf('0.25'))))",
      );
      assert.equal(mpmath.repr, "");
      const values = mpmath.stdout.trim().split(/\s+/).map(Number);
      assert.equal(values.length, 2);
      assert.ok(Math.abs(values[0] - 9.75) < 1e-14);
      assert.ok(Math.abs(values[1] - 1.2058263184569897) < 1e-14);
      if (!isolated) {
        await assert.rejects(
          evaluate("eval('40 + 2')"),
          /authenticated portable cache.*cross-origin-isolated host/,
        );
      }
      assert.deepEqual(pageErrors, []);
      await context.close();
    } finally {
      await server.close();
    }
  }
} finally {
  await browser.close();
}

console.log(
  "Isolated and portable browser compile/eval/exec and mpmath checks passed",
);
