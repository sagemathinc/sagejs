const fs = require("fs"),
  path = require("path"),
  http = require("http"),
  cp = require("child_process"),
  crypto = require("crypto");
const root = process.env.SAGEJS_AUDIT_ROOT;
const browserRoot = process.env.SAGEJS_AUDIT_BROWSER;
const upstream =
  process.env.BRYTHON_AUDIT_ROOT &&
  path.join(process.env.BRYTHON_AUDIT_ROOT, "www");
const output = process.env.AUDIT_OUTPUT;
if (!root || !browserRoot || !upstream || !output)
  throw Error(
    "Set SAGEJS_AUDIT_ROOT, SAGEJS_AUDIT_BROWSER, BRYTHON_AUDIT_ROOT and AUDIT_OUTPUT (new directory)",
  );
fs.mkdirSync(output);
const divisor = Number(process.env.AUDIT_DIVISOR || 10);
if (![1, 10].includes(divisor)) throw Error("AUDIT_DIVISOR must be 1 or 10");
const { chromium } = require(root + "/node_modules/playwright-core");
const checks = {
  assignment: "a == 1",
  augm_assign: "a == 100000",
  augm_assign_and_append: "len(t) == 10000",
  assignment_float: "a == 1.0",
  build_dict: "a == {0: 0, 'a': 'a'}",
  add_dict: "len(d) == 10000",
  set_dict_item: "a[0] == 99999",
  build_list: "a == [1, 2, 3]",
  set_list_item: "a[0] == 99999",
  list_slice: "a == [1, 2, 3]",
  function_call: "f(123) == 123",
  function_call_complex: "f(123,5,6,a=8) == 123",
  call_instance_method: "a.f() is None",
  set_instance_attribute: "a.x == 9999",
};
const cases = JSON.parse(fs.readFileSync(__dirname + "/cases.json"))
  .filter(
    (c) =>
      !process.env.AUDIT_ONLY ||
      process.env.AUDIT_ONLY.split(",").includes(c.name),
  )
  .map((c) => {
    const original = c.original;
    if (crypto.createHash("sha256").update(original).digest("hex") !== c.sha256)
      throw Error("fixture hash mismatch");
    const body = original
      .split("JS_CODE")[0]
      .trim()
      .replace(
        /range\((1000000|100000|10000)\)/g,
        (_, n) => "range(" + Number(n) / divisor + ")",
      )
      .replace(/while i < 100000:/g, "while i < " + 100000 / divisor + ":");
    let check = checks[c.name] || null;
    if (divisor === 1 && check)
      check = check.replace(/\b(99999|9999|100000|10000)\b/g, (n) =>
        String(
          { 99999: 999999, 9999: 99999, 100000: 1000000, 10000: 100000 }[n],
        ),
      );
    return { ...c, body, check };
  });
const program =
  cases
    .map(
      (c) =>
        `def audit_${c.index}():\n${c.body
          .split("\n")
          .map((l) => "    " + l)
          .join(
            "\n",
          )}\n${c.check ? "    assert " + c.check + "\n" : ""}    return 1\n`,
    )
    .join("\n") +
  `\nimport time\nimport json\naudit_results = []\n` +
  cases
    .map(
      (c) =>
        `try:\n    audit_samples = []\n    for audit_round in range(5):\n        audit_start = time.perf_counter()\n        audit_answer = audit_${c.index}()\n        audit_elapsed = time.perf_counter() - audit_start\n        assert audit_answer == 1\n        audit_samples.append(audit_elapsed)\n    audit_results.append({'name': '${c.name}', 'seconds': audit_samples})\nexcept Exception as audit_error:\n    audit_results.append({'name': '${c.name}', 'error': str(audit_error)})\n`,
    )
    .join("\n") +
  `\nprint(json.dumps(audit_results))\n`;
const executedProgram = process.env.AUDIT_SOURCE
  ? fs.readFileSync(process.env.AUDIT_SOURCE, "utf8")
  : program;
fs.writeFileSync(output + "/source.py", executedProgram, { flag: "wx" });
fs.writeFileSync(output + "/cases.json", JSON.stringify(cases, null, 2), {
  flag: "wx",
});
const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://x").pathname;
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  if (u === "/") {
    res.setHeader("Content-Type", "text/html");
    return res.end(
      '<script src="/b/src/brython.js"></script><script src="/b/src/brython_stdlib.js"></script>',
    );
  }
  const base = u.startsWith("/b/") ? upstream : browserRoot;
  const p = path.resolve(base, "." + u.slice(2));
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
  fs.createReadStream(p).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: ["--no-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + server.address().port);
    const metadata = await page.evaluate(() => ({
      ua: navigator.userAgent,
      brython: __BRYTHON__.implementation,
    }));
    const results = {
      metadata,
      node: process.version,
      python: cp
        .execFileSync("python3", ["--version"], { encoding: "utf8" })
        .trim(),
      divisor,
      scope:
        "local same-host reconnaissance; function-wrapped bodies; first sample cold, second warmup, final three warm; not published-page reproduction",
      runs: {},
    };
    const t = performance.now();
    results.runs.cpython = JSON.parse(
      cp.execFileSync("python3", [output + "/source.py"], {
        encoding: "utf8",
        timeout: 240000,
      }),
    );
    results.cpythonProcessMs = performance.now() - t;
    console.log("cpython done");
    results.runs.brython = await page.evaluate(async (source) => {
      brython({ debug: 0 });
      const js = __BRYTHON__.python_to_js(
        source +
          "\nfrom browser import window\nwindow.audit_result = json.dumps(audit_results)\n",
        "audit",
      );
      const start = performance.now();
      eval(js);
      return {
        data: JSON.parse(window.audit_result),
        executionMs: performance.now() - start,
        generated: js,
      };
    }, executedProgram);
    console.log("brython done");
    fs.writeFileSync(
      output + "/brython-generated.js",
      results.runs.brython.generated,
    );
    delete results.runs.brython.generated;
    const { createSage } = require(root + "/dist/tools/kernel.js");
    const session = await createSage({
      mode: "python",
      tracebackCapture: process.env.AUDIT_CAPTURE || "native",
    });
    try {
      const r = await session.evaluate(executedProgram, {
        filename: "audit.py",
      });
      results.runs.sagejsNode = JSON.parse(r.stdout);
    } finally {
      await session.close();
    }
    console.log("sagejs Node done");
    results.runs.sagejsBrowser = await page.evaluate(
      async ({ source, tracebackCapture }) => {
        const { SageSession } = await import("/s/kernel.mjs");
        const s = new SageSession({
          mode: "python",
          tracebackCapture,
          worker: new URL("/s/kernel-worker.mjs", location.href),
        });
        try {
          await s.ready();
          const r = await s.evaluate(source, { filename: "audit.py" });
          return JSON.parse(r.stdout);
        } finally {
          await s.close();
        }
      },
      {
        source: executedProgram,
        tracebackCapture: process.env.AUDIT_CAPTURE || "native",
      },
    );
    console.log("sagejs browser done");
    results.capture = process.env.AUDIT_CAPTURE || "native";
    results.customSource = process.env.AUDIT_SOURCE || null;
    results.sourceSha256 = crypto
      .createHash("sha256")
      .update(executedProgram)
      .digest("hex");
    results.cpu = require("os").cpus()[0].model;
    results.brythonCommit = cp
      .execFileSync(
        "git",
        ["-C", process.env.BRYTHON_AUDIT_ROOT, "rev-parse", "HEAD"],
        { encoding: "utf8" },
      )
      .trim();
    results.brythonRuntimeSha256 = crypto
      .createHash("sha256")
      .update(fs.readFileSync(upstream + "/src/brython.js"))
      .digest("hex");
    fs.writeFileSync(
      output + "/report.json",
      JSON.stringify(results, null, 2),
      { flag: "wx" },
    );
    for (const rows of [
      results.runs.cpython,
      results.runs.brython.data,
      results.runs.sagejsNode,
      results.runs.sagejsBrowser,
    ])
      if (rows.some((r) => r.error))
        throw Error("Benchmark correctness failed; see report.json");
  } finally {
    await browser.close();
    await new Promise((r) => server.close(r));
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
  server.close();
});
