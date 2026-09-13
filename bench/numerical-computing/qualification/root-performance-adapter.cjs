#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { performance } = require("node:perf_hooks");
const { Worker } = require("node:worker_threads");

const { ADAPTER_PROTOCOL } = require("../../../scripts/numerical-computing/contracts.cjs");
const packageRuntime = require("../../../scripts/package-qualification/runtime.cjs");
const {
  readBinding: readBrowserExecutableBinding,
} = require("../../../scripts/numerical-computing/qualification/browser-executable.cjs");
const browserSupport = require("./browser-adapter.cjs")._testing;
const productInternals = require("./node-adapter.cjs").qualificationInternals;

const CAPABILITY = "numerics.root.scalar.performance";
const MARKER = "__SAGEJS_ROOT_PERFORMANCE__";
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

let subject = null;
let session = null;
let packageContext = null;
let packageRunnerName = null;
let browser = null;
let browserPage = null;
let browserServer = null;
let browserExecutable = null;

const PACKAGE_RUNTIME_PATH = require.resolve(
  "../../../scripts/package-qualification/runtime.cjs",
);
const PACKAGE_WORKER_SOURCE = String.raw`
"use strict";
const { parentPort, workerData } = require("node:worker_threads");
try {
  const runtime = require(workerData.runtimePath);
  const result = runtime[workerData.runner](workerData.context, workerData.source, {
    timeout: workerData.timeout,
  });
  parentPort.postMessage({ ok: true, result });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    error: {
      name: error?.name ?? "Error",
      message: String(error?.message ?? error),
      stack: error?.stack ?? null,
    },
  });
}
`;

function workerRuntimeContext(context) {
  const fields = [
    "kind", "target", "targetConfig", "directory", "installedRoot",
    "platformRoot", "version", "ownedDirectory", "executable",
  ];
  return Object.fromEntries(fields
    .filter((name) => context[name] !== undefined)
    .map((name) => [name, context[name]]));
}

function runPackageAsync(runner, context, source, timeout = 180_000) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(PACKAGE_WORKER_SOURCE, {
      eval: true,
      workerData: {
        runtimePath: PACKAGE_RUNTIME_PATH,
        runner,
        context: workerRuntimeContext(context),
        source,
        timeout,
      },
    });
    let message = null;
    let terminalError = null;
    const timer = setTimeout(() => {
      terminalError ??= new Error("package root benchmark worker timed out");
      void worker.terminate();
    }, timeout + 5_000);
    timer.unref?.();
    worker.on("message", (next) => {
      if (message !== null) {
        terminalError ??= new Error("package root benchmark worker emitted duplicate results");
        void worker.terminate();
        return;
      }
      message = next;
    });
    worker.once("error", (error) => { terminalError ??= error; });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (terminalError !== null) return reject(terminalError);
      if (code !== 0) return reject(new Error(`package root benchmark worker exited ${code}`));
      if (message?.ok === true) return resolve(message.result);
      const failure = new Error(
        message?.error?.message ?? "package root benchmark worker returned no result",
      );
      failure.name = message?.error?.name ?? "Error";
      if (message?.error?.stack) failure.stack = message.error.stack;
      return reject(failure);
    });
  });
}

function artifact(context, name) {
  const found = context.artifacts.find((item) => item.name === name);
  if (found === undefined) throw new Error(`missing bound ${name} artifact`);
  return found.path;
}

function checkProcess(result, label) {
  if (result.error) throw result.error;
  if (result.status !== 0 || result.signal !== null) {
    throw new Error(
      `${label} failed (${result.status ?? result.signal})\n${result.stdout}\n${result.stderr}`,
    );
  }
  return result;
}

function parseEvaluation(result) {
  const parsed = productInternals.parseEvaluation(result);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("root benchmark returned no object record");
  }
  return parsed;
}

function benchmarkSource(input, sampleIndex) {
  const modeOrder = sampleIndex % 2 === 0
    ? ["none", "iterations"]
    : ["iterations", "none"];
  return [
    "import json",
    "import math",
    "import time",
    `input_record = json.loads(${JSON.stringify(JSON.stringify(input))})`,
    `mode_order = ${JSON.stringify(modeOrder)}`,
    "calls = [0]",
    "def callback(x):",
    "    calls[0] += 1",
    "    sink = 0.0",
    "    for index in range(input_record['callback_work']):",
    "        scale = float(index + 1)",
    "        sink += math.sin(x + scale) * math.cos(x - scale)",
    "    return x*x - 2.0 + 0.0*sink",
    "def derivative(x):",
    "    return 2.0*x",
    "from sagejs.numerics import find_root",
    "records = {}",
    "for trace_mode in mode_order:",
    "    roots = []",
    "    statuses = []",
    "    methods = []",
    "    backends = []",
    "    iteration_events = []",
    "    evaluations = []",
    "    started = time.perf_counter()",
    "    for repeat in range(input_record['repetitions']):",
    "        method = input_record['method']",
    "        if method == 'secant':",
    "            answer = find_root(callback, x0=1.0, x1=2.0, method=method, trace=trace_mode)",
    "        elif method == 'newton':",
    "            answer = find_root(callback, x0=1.0, derivative=derivative, method=method, trace=trace_mode)",
    "        else:",
    "            answer = find_root(callback, 1.0, 2.0, method=method, trace=trace_mode)",
    "        roots.append(answer.value)",
    "        statuses.append(answer.success)",
    "        methods.append(answer.method)",
    "        backends.append(answer.backend)",
    "        iteration_events.append(sum(1 for event in answer.trace.events if event.kind == 'iteration'))",
    "        evaluations.append(answer.evaluations)",
    "    elapsed_ms = 1000.0 * (time.perf_counter() - started)",
    "    records[trace_mode] = {",
    "        'roots': roots,",
    "        'statuses': statuses,",
    "        'methods': methods,",
    "        'backends': backends,",
    "        'iteration_events': iteration_events,",
    "        'evaluations': evaluations,",
    "        'elapsed_ms': elapsed_ms,",
    "    }",
    `print(${JSON.stringify(MARKER)} + json.dumps({'records': records, 'callback_calls': calls[0]}, sort_keys=True))`,
  ].join("\n");
}

function parseMarkedEvaluation(result) {
  const streams = Array.isArray(result) ? result : [
    { name: "stdout", text: String(result?.stdout ?? "") },
    { name: "stderr", text: String(result?.stderr ?? "") },
  ];
  const lines = streams.flatMap((item) => String(item?.text ?? "").split(/\r?\n/));
  const line = lines.findLast((item) => item.startsWith(MARKER));
  if (line === undefined) {
    throw new Error("root benchmark runtime emitted no marked result");
  }
  return JSON.parse(line.slice(MARKER.length));
}

async function listen(root) {
  const server = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://qualification.invalid").pathname,
      );
      const relative = pathname === "/" ? "qualification.html" : pathname.slice(1);
      if (relative === "qualification.html") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cache-Control": "no-store",
        }).end("<!doctype html><meta charset=utf-8><title>Root qualification</title>");
        return;
      }
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(`${root}${path.sep}`) || !fs.statSync(filename).isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": CONTENT_TYPES.get(path.extname(filename)) ?? "application/octet-stream",
        "Cross-Origin-Opener-Policy": "same-origin",
        "Cross-Origin-Embedder-Policy": "require-corp",
        "Cache-Control": "no-store",
      });
      fs.createReadStream(filename).pipe(response);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

function serverOrigin(server) {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("browser benchmark server has no TCP address");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function initializeNode(context) {
  const dist = artifact(context, "sagejs-dist");
  const kernel = path.join(dist, "tools", "kernel.js");
  if (!fs.statSync(kernel).isFile()) throw new Error("sagejs-dist lacks tools/kernel.js");
  const { createSage } = require(kernel);
  session = await createSage({ mode: "python" });
  subject = { kind: "node", name: "node", version: process.version, engine: null };
}

async function initializePackage(context) {
  if (context.subject.kind === "npm") {
    packageContext = packageRuntime.prepareFreshInstall({
      target: packageRuntime.targetForHost(),
      rootArchive: artifact(context, "npm-root-tarball"),
      platformArchive: artifact(context, "npm-platform-tarball"),
      installStdio: "pipe",
    });
    packageRunnerName = "runInstalledSourcePython";
    subject = {
      kind: "npm",
      name: "@sagemath/sagejs",
      version: packageContext.version,
      engine: null,
    };
    return;
  }
  packageContext = packageRuntime.prepareRelocatedSea({
    target: packageRuntime.targetForHost(),
    executable: artifact(context, "sea-executable"),
  });
  packageRunnerName = "runRelocatedSeaPython";
  const versionResult = checkProcess(
    packageRuntime.runProcess(packageContext.executable, ["--version"], { timeout: 30_000 }),
    "SEA version probe",
  );
  const version = `${versionResult.stdout}\n${versionResult.stderr}`
    .match(/(?:sagejs\s+|v)(\d+\.\d+\.\d+)/i)?.[1];
  if (version === undefined) throw new Error("SEA version probe returned no semantic version");
  subject = { kind: "sea", name: "sagejs", version, engine: null };
}

async function initializeBrowser(context) {
  const packageRoot = artifact(context, "sagejs-browser");
  const dist = artifact(context, "browser-dist");
  if (fs.realpathSync(dist) !== fs.realpathSync(path.join(packageRoot, "dist"))) {
    throw new Error("browser-dist must be the exact bound Sage.js browser distribution");
  }
  const binding = readBrowserExecutableBinding(
    artifact(context, "browser-executable-binding"),
    context.subject,
  );
  browserExecutable = binding.executable;
  browserServer = await listen(packageRoot);
  const launched = await browserSupport.launchBrowser(
    context.subject.engine,
    browserExecutable,
  );
  browser = launched.browser;
  browserPage = await browser.newPage();
  await browserPage.goto(serverOrigin(browserServer), { waitUntil: "domcontentloaded" });
  await browserPage.evaluate(async () => {
    const { createSage } = await import("/kernel.mjs");
    globalThis.__sagejsRootBenchmark = await createSage({ mode: "python", timeout: 180_000 });
  });
  subject = context.subject.kind === "browser"
    ? {
      kind: "browser",
      name: "playwright-browser",
      version: launched.version,
      engine: context.subject.engine,
    }
    : {
      kind: "worker",
      name: "sagejs-browser-worker",
      version: launched.version,
      engine: context.subject.engine,
    };
}

async function evaluateSource(source) {
  if (session !== null) return session.evaluate(source);
  if (packageContext !== null && packageRunnerName !== null) {
    return checkProcess(
      await runPackageAsync(packageRunnerName, packageContext, source),
      "package root benchmark",
    );
  }
  if (browserPage !== null) {
    return browserPage.evaluate(
      ({ source }) => globalThis.__sagejsRootBenchmark.evaluate(source, { timeout: 180_000 }),
      { source },
    );
  }
  throw new Error("root performance adapter is not initialized");
}

async function close() {
  let failure = null;
  try {
    await session?.close();
  } catch (error) {
    failure = error;
  }
  try {
    packageContext?.cleanup();
  } catch (error) {
    failure ??= error;
  }
  try {
    if (browserPage !== null) {
      await browserPage.evaluate(async () => globalThis.__sagejsRootBenchmark.close());
    }
    await browser?.close();
  } catch (error) {
    failure ??= error;
  }
  try {
    if (browserServer !== null) {
      await new Promise((resolve, reject) =>
        browserServer.close((error) => error ? reject(error) : resolve()));
    }
  } catch (error) {
    failure ??= error;
  }
  try {
    if (browserExecutable !== null) {
      browserSupport.authenticateBrowserExecutable(browserExecutable);
    }
  } catch (error) {
    failure ??= error;
  }
  subject = null;
  session = null;
  packageContext = null;
  packageRunnerName = null;
  browser = null;
  browserPage = null;
  browserServer = null;
  browserExecutable = null;
  if (failure !== null) throw failure;
}

function normalize(raw, input, elapsedMs) {
  const expectedRoot = Math.SQRT2;
  const modes = raw.records;
  const allRoots = [...modes.none.roots, ...modes.iterations.roots];
  const allSuccess = [...modes.none.statuses, ...modes.iterations.statuses]
    .every((value) => value === true);
  const identityMatches = [modes.none, modes.iterations].every((record) =>
    record.methods.every((value) => value === input.method) &&
    record.backends.every((value) => value === "ordinary-python"));
  const traceModesObserved = modes.none.iteration_events.every((value) => value === 0) &&
    modes.iterations.iteration_events.every((value) => value > 0);
  return {
    outcome: { kind: "success", code: null },
    values: {
      all_success: allSuccess,
      callback_cost_tiers_executed: [input.callback_tier],
      callback_tier: input.callback_tier,
      identity_matches: identityMatches,
      max_residual: Math.max(...allRoots.map((value) => Math.abs(value * value - 2))),
      max_root_error: Math.max(...allRoots.map((value) => Math.abs(value - expectedRoot))),
      methods_executed: [...new Set([
        ...modes.none.methods,
        ...modes.iterations.methods,
      ])].sort(),
      repetitions: input.repetitions,
      trace_policies_executed: ["none", "iterations"],
      trace_modes_observed: traceModesObserved,
    },
    metrics: {
      phases_ms: {
        runtime_evaluation: elapsedMs,
        traced_solve: modes.iterations.elapsed_ms / input.repetitions,
        untraced_solve: modes.none.elapsed_ms / input.repetitions,
      },
      counters: {
        callback_calls: raw.callback_calls,
        solves: input.repetitions * 2,
      },
    },
  };
}

module.exports = {
  protocol: ADAPTER_PROTOCOL,

  async initialize(context) {
    if (subject !== null) throw new Error("root performance adapter is already initialized");
    try {
      if (context.subject.kind === "node") await initializeNode(context);
      else if (["npm", "sea"].includes(context.subject.kind)) await initializePackage(context);
      else if (["browser", "worker"].includes(context.subject.kind)) {
        await initializeBrowser(context);
      } else {
        throw new Error(`unsupported root benchmark subject ${context.subject.kind}`);
      }
      const probe = parseEvaluation(await evaluateSource([
        "import json",
        "from sagejs.numerics import find_root",
        `print(${JSON.stringify(productInternals.marker)}` +
          " + json.dumps({'available': callable(find_root)}, sort_keys=True))",
      ].join("\n")));
      if (probe.available !== true) throw new Error("scalar root API is unavailable");
      return { subject, capability_ids: [CAPABILITY] };
    } catch (error) {
      try {
        await close();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "root adapter initialization failed");
      }
      throw error;
    }
  },

  async runCase(sample) {
    const started = performance.now();
    const evaluated = await evaluateSource(benchmarkSource(sample.input, sample.sample_index));
    return normalize(parseMarkedEvaluation(evaluated), sample.input, performance.now() - started);
  },

  close,

  qualificationState() {
    return {
      initialized: subject !== null,
      subject,
      capability_ids: subject === null ? [] : [CAPABILITY],
    };
  },

  _testing: Object.freeze({
    benchmarkSource,
    normalize,
    parseMarkedEvaluation,
    runPackageAsync,
    workerRuntimeContext,
  }),
};
