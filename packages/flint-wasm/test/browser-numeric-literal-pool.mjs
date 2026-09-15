// sagejs-test-tier: specialized
// Qualification against an existing built browser runtime, with only the
// compiler, frontend and compiler worker replaced by the candidate artifacts.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const built = process.env.SAGEJS_AUDIT_BROWSER;
const frontend = process.env.SAGEJS_AUDIT_FRONTEND;
if (!built || !frontend)
  throw Error(
    "Set SAGEJS_AUDIT_BROWSER and SAGEJS_AUDIT_FRONTEND to built artifacts",
  );
let pooled = false;
const workerSource = fs.readFileSync(
  path.join(root, "packages/flint-wasm/compiler-worker.mjs"),
  "utf8",
);
const server = http.createServer((req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  const url = new URL(req.url, "http://localhost").pathname;
  if (url === "/") {
    res.setHeader("Content-Type", "text/html");
    return res.end("<title>Literal pool qualification</title>");
  }
  res.setHeader(
    "Content-Type",
    url.endsWith(".wasm")
      ? "application/wasm"
      : url.endsWith(".json")
        ? "application/json"
        : "text/javascript",
  );
  if (url === "/compiler-worker.mjs")
    return res.end(
      pooled
        ? workerSource
        : workerSource.replace(
            "pool_numeric_literals: !includeBaselib",
            "pool_numeric_literals: false",
          ),
    );
  const override = ["/compiler.js", "/dist/compiler.js"].includes(url)
    ? path.join(root, "dist/compiler/compiler.js")
    : ["/compiler-frontend.mjs", "/dist/compiler-frontend.mjs"].includes(url)
      ? frontend
      : null;
  const target = override ?? path.resolve(built, "." + url);
  if (
    (!override && !target.startsWith(path.resolve(built) + path.sep)) ||
    !fs.existsSync(target)
  ) {
    res.statusCode = 404;
    return res.end();
  }
  fs.createReadStream(target).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const results = [];
try {
  for (const mode of ["python", "sage"])
    for (const policy of [false, true]) {
      pooled = policy;
      const page = await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.address().port}`);
      const result = await page.evaluate(async (mode) => {
        const { SageSession } = await import("/kernel.mjs");
        const session = new SageSession({ mode });
        try {
          await session.ready();
          await session.evaluate(`
def saved():
    return 1.25, 9007199254740993
seen = []
def record(value):
    seen.append(value)
    return value
def explicit(Integer, Number, RealNumber):
    return Integer("2"), Number("3"), RealNumber("4")
assert explicit(record, record, record) == ("2", "3", "4"), "explicit first"
assert explicit(record, record, record) == ("2", "3", "4"), "explicit second"
assert seen == ["2", "3", "4", "2", "3", "4"], "explicit effects"
`);
          await session.evaluate("replacement = 8.5\n");
          let rejected = false;
          try {
            await session.evaluate(
              "temporary = 7.75\nraise ValueError('intentional')\n",
            );
          } catch {
            rejected = true;
          }
          if (!rejected) throw Error("expected failure did not reject");
          await session.evaluate(`
assert saved() == (1.25, 9007199254740993), "saved constants"
assert 0x20000000000001 - 9007199254740992 == 1, "exact hex"
from math import sqrt
assert sqrt(2.25) == 1.5, "sqrt"
`);
          const measured = await session.evaluate(`
import time
import json
def assignment():
    for i in range(100000):
        a = 1.25
    assert a == 1.25, "assignment"
def observable():
    values = [1.25 for i in range(10000)]
    assert len(values) == 10000, "list length"
    assert sum(values) == 12500, "list sum"
samples = []
for probe in [assignment, observable]:
    times = []
    for repeat in range(5):
        start = time.perf_counter()
        probe()
        times.append(time.perf_counter() - start)
    samples.append(times)
print(json.dumps(samples))
`);
          await session.reset();
          const afterReset = await session.evaluate(
            "assert 2.5 * 4 == 10\nprint('reset-ok')\n",
          );
          if (afterReset.stdout.trim() !== "reset-ok")
            throw Error("reset failed");
          return JSON.parse(measured.stdout);
        } finally {
          await session.close();
        }
      }, mode);
      assert.equal(result.length, 2);
      for (const samples of result)
        assert.ok(
          samples.length === 5 &&
            samples.every((value) => Number.isFinite(value) && value >= 0),
        );
      results.push({ mode, pooled: policy, seconds: result });
      await page.close();
      console.log(JSON.stringify(results.at(-1)));
    }
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
