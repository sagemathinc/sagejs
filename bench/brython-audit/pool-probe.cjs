const fs = require("fs"),
  http = require("http"),
  path = require("path");
const root = process.env.SAGEJS_AUDIT_ROOT;
const base = process.env.SAGEJS_AUDIT_BROWSER;
const output = process.env.AUDIT_OUTPUT;
if (!output) throw Error("Set AUDIT_OUTPUT to a new directory");
fs.mkdirSync(output);
if (!root || !base)
  throw Error("Set SAGEJS_AUDIT_ROOT and SAGEJS_AUDIT_BROWSER");
const { chromium } = require(root + "/node_modules/playwright-core");
const source = `import time\nimport json\ndef probe():\n    for i in range(100000):\n        a = 1.0\n    assert a == 1.0\nresult = []\nfor iteration in range(7):\n    start = time.perf_counter()\n    probe()\n    result.append(time.perf_counter() - start)\nprint(json.dumps(result))\n`;
let pooled = false;
const server = http.createServer((req, res) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    return res.end("<title>pool experiment</title>");
  }
  const p = path.resolve(base, "." + req.url.split("?")[0]);
  if (!p.startsWith(base + "/") || !fs.existsSync(p)) {
    res.statusCode = 404;
    return res.end();
  }
  res.setHeader(
    "Content-Type",
    p.endsWith(".wasm")
      ? "application/wasm"
      : p.endsWith(".json")
        ? "application/json"
        : "text/javascript",
  );
  if (p.endsWith("/compiler-worker.mjs") && pooled) {
    return res.end(
      fs
        .readFileSync(p, "utf8")
        .replace(
          "python_attributes: true,",
          'python_attributes: true, pool_numeric_literals: true, numeric_literal_pool_prefix: "audit_pool_" + (globalThis.auditPoolId = (globalThis.auditPoolId || 0) + 1) + "_",',
        ),
    );
  }
  fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  const results = [];
  try {
    for (const flag of [false, true, true, false]) {
      pooled = flag;
      const page = await browser.newPage();
      await page.goto("http://127.0.0.1:" + server.address().port);
      const samples = await page.evaluate(async (source) => {
        const { SageSession } = await import("/kernel.mjs");
        const s = new SageSession({ mode: "python" });
        try {
          await s.ready();
          return JSON.parse((await s.evaluate(source)).stdout);
        } finally {
          await s.close();
        }
      }, source);
      results.push({ pooled: flag, samples });
      await page.close();
      console.log(flag, samples);
    }
    fs.writeFileSync(
      output + "/pool-report.json",
      JSON.stringify(
        {
          scope:
            "Experimental HTTP-served compiler option only; no production source mutation; 100000 float assignments, first two samples warmup",
          source,
          results,
        },
        null,
        2,
      ),
      { flag: "wx" },
    );
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  server.close();
});
