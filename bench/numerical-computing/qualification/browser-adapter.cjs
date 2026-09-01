#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { ADAPTER_PROTOCOL } = require("../../../scripts/numerical-computing/contracts.cjs");
const { canonicalJson } = require("../../../scripts/numerical-computing/common.cjs");
const {
  executableIdentity,
  readBinding,
} = require("../../../scripts/numerical-computing/qualification/browser-executable.cjs");
const nodeAdapter = require("./node-adapter.cjs");

const internals = nodeAdapter.qualificationInternals;
const contentTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".wasm", "application/wasm"],
]);

let artifactRoot = null;
let server = null;
let browser = null;
let page = null;
let subject = null;
let initializedCapabilities = [];
let browserDiagnostics = [];
let lastBrowserExecutable = null;
let activeBrowserExecutableBinding = null;

function diagnostic(message) {
  browserDiagnostics.push(String(message));
  if (browserDiagnostics.length > 32) browserDiagnostics.shift();
}

function authenticateBrowserExecutable(expected) {
  const current = executableIdentity(expected.path, expected.version);
  if (canonicalJson(current) !== canonicalJson(expected)) {
    throw new Error("browser executable changed while matrix qualification executed");
  }
  return current;
}

function browserEngine(contextSubject) {
  if (!["browser", "worker"].includes(contextSubject.kind)) {
    throw new Error(`browser adapter cannot initialize ${contextSubject.kind} subject`);
  }
  if (!["chromium", "firefox", "webkit"].includes(contextSubject.engine)) {
    throw new Error(`browser adapter received unsupported engine ${contextSubject.engine}`);
  }
  if (contextSubject.kind === "worker" && contextSubject.engine !== "chromium") {
    throw new Error("browser-worker qualification is pinned to Chromium");
  }
  return contextSubject.engine;
}

function browserExecutable(type, engine) {
  const configured = process.env[`SAGEJS_${engine.toUpperCase()}_EXECUTABLE`];
  const candidates = [configured];
  try {
    candidates.push(type.executablePath());
  } catch {}
  if (engine === "chromium") {
    candidates.push(
      process.env.SAGEJS_CHROMIUM,
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/google-chrome",
    );
  }
  return candidates.filter(Boolean).find((candidate) => fs.existsSync(candidate)) ?? null;
}

async function launchBrowser(engine, expectedExecutable = null) {
  const playwright = require("playwright-core");
  const type = playwright[engine];
  if (type === undefined) throw new Error(`unsupported Playwright engine ${engine}`);
  const executablePath = expectedExecutable?.path ?? browserExecutable(type, engine);
  if (executablePath === null) {
    throw new Error(`Playwright ${engine} is not installed; install it or set SAGEJS_${engine.toUpperCase()}_EXECUTABLE`);
  }
  const exactExecutablePath = fs.realpathSync(executablePath);
  const launched = await type.launch({
    executablePath: exactExecutablePath,
    headless: true,
    args: engine === "chromium" ? ["--no-sandbox", "--disable-dev-shm-usage"] : [],
  });
  const version = launched.version();
  const executable = executableIdentity(exactExecutablePath, version);
  if (expectedExecutable !== null &&
      canonicalJson(executable) !== canonicalJson(expectedExecutable)) {
    await launched.close();
    throw new Error("launched browser executable differs from its capability binding");
  }
  return {
    browser: launched,
    version,
    executablePath: exactExecutablePath,
    executable,
  };
}

async function listen(root) {
  const next = http.createServer((request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, "http://qualification.invalid").pathname);
      const relative = pathname === "/" ? "qualification.html" : pathname.slice(1);
      if (relative === "qualification.html") {
        response.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cache-Control": "no-store",
        }).end("<!doctype html><meta charset=utf-8><title>Sage.js qualification</title>");
        return;
      }
      const filename = path.resolve(root, relative);
      if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename) ||
          !fs.statSync(filename).isFile()) {
        diagnostic(`HTTP 404 ${relative}`);
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "Content-Type": contentTypes.get(path.extname(filename)) ?? "application/octet-stream",
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
    next.once("error", reject);
    next.listen(0, "127.0.0.1", resolve);
  });
  return next;
}

function address(originServer) {
  const value = originServer.address();
  if (value === null || typeof value === "string") throw new Error("browser qualification server has no TCP address");
  return `http://127.0.0.1:${value.port}`;
}

async function runPython(sample) {
  const source = internals.sourceFor(sample.id, sample.input);
  const started = performance.now();
  const result = await page.evaluate(async ({ source }) => {
    return globalThis.__sagejsQualificationSession.evaluate(source, { timeout: 180_000 });
  }, { source });
  return { raw: internals.parseEvaluation(result), kernelMs: performance.now() - started };
}

async function runRuntimeRecovery(sample) {
  const pending = page.evaluate(async () => {
    try {
      await globalThis.__sagejsQualificationSession.evaluate(
        "while True:\n    pass",
        { timeout: 180_000 },
      );
      return { interrupted: false, name: null };
    } catch (error) {
      return { interrupted: true, name: error?.name ?? null };
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await page.evaluate(async () => globalThis.__sagejsQualificationSession.interrupt());
  const interruption = await pending;
  if (!interruption.interrupted || interruption.name !== "SageSessionInterruptedError") {
    throw new Error(`worker interruption was not observed: ${JSON.stringify(interruption)}`);
  }
  const evaluated = await runPython(sample);
  evaluated.raw.runtime_interrupt_observed = true;
  return evaluated;
}

async function runParserGuards() {
  const started = performance.now();
  const raw = await page.evaluate(async () => {
    const module = await import("/dist/foreign-frontend.mjs");
    const runtime = new Uint8Array(await (await fetch("/dist/web-tree-sitter.wasm")).arrayBuffer());
    const cases = [
      ["matlab", "eig([3 1;1 2])", "MatlabSyntaxError", "eig numerical syntax is not supported"],
      ["matlab", "griddedInterpolant([0 1],[0 1])", "MatlabSyntaxError", "griddedInterpolant numerical syntax is not supported"],
      ["matlab", "ttest2([1 2 3],[2 3 4])", "MatlabSyntaxError", "ttest2 numerical syntax is not supported"],
      ["wolfram", "Fourier[{1,2,3}]", "WolframSyntaxError", "Fourier numerical syntax is not supported"],
      ["wolfram", "Eigensystem[{{3,1},{1,2}}]", "WolframSyntaxError", "Eigensystem numerical syntax is not supported"],
      ["wolfram", "FindMinimum[(x-2)^2,{x,0}]", "WolframSyntaxError", "FindMinimum numerical syntax is not supported"],
    ];
    const frontends = new Map();
    for (const language of ["matlab", "wolfram"]) {
      const grammar = new Uint8Array(
        await (await fetch(`/dist/tree-sitter-${language}.wasm`)).arrayBuffer(),
      );
      module.configureBrowserForeignResources({
        treeSitterRuntime: runtime,
        grammar,
        grammarFilename: `tree-sitter-${language}.wasm`,
      });
      frontends.set(language, await module.createForeignFrontend(language));
    }
    const records = [];
    for (const [language, source, expectedName, expectedMessage] of cases) {
      try {
        frontends.get(language).lower(source, { captureResult: true });
        records.push({ source, rejected: false, name_matches: false, message_matches: false, positioned: false });
      } catch (error) {
        records.push({
          source,
          rejected: true,
          name_matches: error?.name === expectedName,
          message_matches: String(error?.message ?? "").includes(expectedMessage),
          positioned: Number.isInteger(error?.line) && Number.isInteger(error?.column),
        });
      }
    }
    const safe = [
      frontends.get("matlab").lower("integral(@(x) x^2,0,1)", { captureResult: true }).source,
      frontends.get("wolfram").lower("NIntegrate[x^2,{x,0,1}]", { captureResult: true }).source,
    ];
    return { records, safe };
  });
  return { raw, kernelMs: performance.now() - started };
}

async function runMatlabShapes() {
  const started = performance.now();
  const programs = {
    linsolve: "x=linsolve([3 1;1 2],[9;8]); size(x)",
    least_squares: "x=lsqminnorm([1 0;0 1;1 1],[1;2;3]); size(x)",
    singular_values: "x=svd([3 1;1 2]); size(x)",
    fminsearch_row: "x=fminsearch(@(x) (x(1,1)-1)^2+(x(1,2)-2)^2,[1 2]); size(x)",
    fminsearch_column: "x=fminsearch(@(x) (x(1,1)-1)^2+(x(2,1)-2)^2,[1;2]); size(x)",
    fsolve_row: "x=fsolve(@(x) [x(1,1)-1 x(1,2)-2],[1 2]); size(x)",
    fsolve_column: "x=fsolve(@(x) [x(1,1)-1;x(2,1)-2],[1;2]); size(x)",
    lsqnonlin_row: "x=lsqnonlin(@(x) [x(1,1)-1 x(1,2)-2],[1 2]); size(x)",
    lsqnonlin_column: "x=lsqnonlin(@(x) [x(1,1)-1;x(2,1)-2],[1;2]); size(x)",
    convolution_row: "x=conv([1 2],[3 4]); size(x)",
    arrayfun_matrix: "x=arrayfun(@(x) x^2,[1 2;3 4]); size(x)",
  };
  const raw = await page.evaluate(async ({ programs }) => {
    const shapes = {};
    for (const [name, source] of Object.entries(programs)) {
      const result = await globalThis.__sagejsQualificationSession.evaluate(
        `%%matlab\n${source}`,
        { timeout: 180_000 },
      );
      shapes[name] = result.repr;
    }
    return { shapes };
  }, { programs });
  return { raw, kernelMs: performance.now() - started };
}

async function runBrowserMemoryPressure(sample) {
  const bytes = sample.input.bytes;
  if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 128 * 1024 * 1024) {
    throw new Error(`invalid browser memory qualification size ${bytes}`);
  }
  const source = [
    "import json",
    `allocated_bytes = ${bytes}`,
    "data = bytearray(allocated_bytes)",
    "touched_pages = 0",
    "checksum = 0",
    "for offset in range(0, allocated_bytes, 4096):",
    "    value = ((offset // 4096) % 251) + 1",
    "    data[offset] = value",
    "    checksum += data[offset]",
    "    touched_pages += 1",
    `print(${JSON.stringify(internals.marker)} + json.dumps({`,
    '    "allocated_bytes": allocated_bytes,',
    '    "touched_pages": touched_pages,',
    '    "checksum": checksum,',
    '    "worker_executed": True,',
    "}, sort_keys=True))",
  ].join("\n");
  const started = performance.now();
  const result = await page.evaluate(async ({ source }) =>
    globalThis.__sagejsQualificationSession.evaluate(source, { timeout: 180_000 }),
  { source });
  const raw = internals.parseEvaluation(result);
  return {
    outcome: { kind: "success", code: null },
    values: {
      allocated_bytes: raw.allocated_bytes,
      touched_pages: raw.touched_pages,
      worker_executed: raw.worker_executed,
      checksum_nonzero: raw.checksum > 0,
    },
    metrics: {
      phases_ms: { browser_worker_memory_pressure: performance.now() - started },
      counters: { touched_pages: raw.touched_pages },
    },
  };
}

async function runBrowserWorkerReplacement() {
  const started = performance.now();
  const pending = page.evaluate(async () => {
    try {
      await globalThis.__sagejsQualificationSession.evaluate(
        "while True:\n    pass",
        { timeout: 180_000 },
      );
      return { interrupted: false, name: null };
    } catch (error) {
      return { interrupted: true, name: error?.name ?? null };
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  await page.evaluate(async () => globalThis.__sagejsQualificationSession.interrupt());
  const interruption = await pending;
  const source = [
    "import json",
    `print(${JSON.stringify(internals.marker)} + json.dumps({"recovered_value": 1 + 1}))`,
  ].join("\n");
  const result = await page.evaluate(async ({ source }) =>
    globalThis.__sagejsQualificationSession.evaluate(source, { timeout: 180_000 }),
  { source });
  const recovered = internals.parseEvaluation(result);
  return {
    outcome: { kind: "success", code: null },
    values: {
      interrupted: interruption.interrupted,
      interruption_name: interruption.name,
      recovered_value: recovered.recovered_value,
    },
    metrics: {
      phases_ms: { browser_worker_replacement: performance.now() - started },
      counters: { worker_replacements: interruption.interrupted ? 1 : 0 },
    },
  };
}

async function evaluateSample(sample) {
  if (sample.id === "p8-runtime-recovery") return runRuntimeRecovery(sample);
  if (sample.id === "p6-multilingual-parser-fail-closed") return runParserGuards();
  if (sample.id === "p6-matlab-vector-shapes") return runMatlabShapes();
  return runPython(sample);
}

async function close() {
  let failure = null;
  try {
    if (page !== null) {
      await page.evaluate(async () => {
        await globalThis.__sagejsQualificationSession?.close();
        delete globalThis.__sagejsQualificationSession;
        delete globalThis.__sagejsQualificationCminpack;
      }).catch(() => {});
    }
    await browser?.close();
  } catch (error) {
    failure = error;
  } finally {
    if (server !== null) {
      try {
        await new Promise((resolve, reject) =>
          server.close((error) => error ? reject(error) : resolve()));
      } catch (error) {
        failure ??= error;
      }
    }
    if (activeBrowserExecutableBinding !== null) {
      try {
        authenticateBrowserExecutable(activeBrowserExecutableBinding);
      } catch (error) {
        failure ??= error;
      }
    }
    try {
      internals.closeHostOracles();
    } catch (error) {
      failure ??= error;
    }
    artifactRoot = null;
    server = null;
    browser = null;
    page = null;
    subject = null;
    initializedCapabilities = [];
    browserDiagnostics = [];
    activeBrowserExecutableBinding = null;
  }
  if (failure !== null) throw failure;
}

module.exports = {
  protocol: ADAPTER_PROTOCOL,

  async initialize(context) {
    if (browser !== null || server !== null) throw new Error("browser qualification adapter is already initialized");
    const artifact = context.artifacts.find((item) => item.name === "sagejs-browser");
    if (artifact === undefined || !fs.statSync(artifact.path).isDirectory()) {
      throw new Error("the sagejs-browser artifact must be a built flint-wasm package directory");
    }
    const browserDist = context.artifacts.find((item) => item.name === "browser-dist");
    if (browserDist === undefined || !fs.statSync(browserDist.path).isDirectory() ||
        fs.realpathSync(browserDist.path) !== fs.realpathSync(path.join(artifact.path, "dist"))) {
      throw new Error("browser-dist must bind the exact staged browser dist directory");
    }
    const executableArtifact = context.artifacts.find(
      (item) => item.name === "browser-executable-binding",
    );
    if (executableArtifact === undefined || !fs.statSync(executableArtifact.path).isFile()) {
      throw new Error("browser-executable-binding must be bound separately");
    }
    const executableBinding = readBinding(executableArtifact.path, context.subject);
    const scipyOracleArtifact = context.artifacts.find(
      (item) => item.name === "scipy-oracle-binding",
    );
    if (scipyOracleArtifact === undefined || !fs.statSync(scipyOracleArtifact.path).isFile()) {
      throw new Error("scipy-oracle-binding must be bound separately");
    }
    for (const filename of [
      "kernel.mjs",
      "dist/cminpack.wasm",
      "dist/nlopt-methods.wasm",
      "dist/foreign-frontend.mjs",
      "dist/web-tree-sitter.wasm",
      "dist/tree-sitter-matlab.wasm",
      "dist/tree-sitter-wolfram.wasm",
    ]) {
      if (!fs.statSync(path.join(artifact.path, filename)).isFile()) {
        throw new Error(`sagejs-browser lacks ${filename}`);
      }
    }
    for (const [name, relative] of [
      ["cminpack-wasm", "dist/cminpack.wasm"],
      ["nlopt-wasm", "dist/nlopt-methods.wasm"],
    ]) {
      const bound = context.artifacts.find((item) => item.name === name);
      if (bound === undefined || !fs.statSync(bound.path).isFile()) {
        throw new Error(`the ${name} artifact must be bound separately`);
      }
      if (!fs.readFileSync(bound.path).equals(fs.readFileSync(path.join(artifact.path, relative)))) {
        throw new Error(`the bound ${name} differs from the browser runtime resource`);
      }
    }
    try {
      artifactRoot = path.resolve(artifact.path);
      const engine = browserEngine(context.subject);
      server = await listen(artifactRoot);
      const launched = await launchBrowser(engine, executableBinding.executable);
      lastBrowserExecutable = launched.executable;
      activeBrowserExecutableBinding = executableBinding.executable;
      browser = launched.browser;
      page = await browser.newPage();
      page.on("console", (message) => diagnostic(`console ${message.type()}: ${message.text()}`));
      page.on("pageerror", (error) => diagnostic(`pageerror: ${error?.stack ?? error}`));
      await page.goto(address(server), { waitUntil: "domcontentloaded" });
      await page.evaluate(async () => {
        const { createSage } = await import("/kernel.mjs");
        globalThis.__sagejsQualificationSession = await createSage({ timeout: 180_000 });
      });
      const host = internals.initializeHostOracles(scipyOracleArtifact.path, context.root);
      const requirements = internals.capabilityModuleRequirements;
      const moduleNames = [...new Set(Object.values(requirements)
        .filter((name) => !name.startsWith("external:")))].sort();
      const probeSource = [
        "import json",
        `modules = ${JSON.stringify(moduleNames)}`,
        "available = []",
        "for module in modules:",
        "    try:",
        "        __import__(module)",
        "        available.append(module)",
        "    except Exception:",
        "        pass",
        `print(${JSON.stringify(internals.marker)} + json.dumps({"available": available}, sort_keys=True))`,
      ].join("\n");
      const probeResult = await page.evaluate(async ({ source }) =>
        globalThis.__sagejsQualificationSession.evaluate(source, { timeout: 180_000 }),
      { source: probeSource });
      const present = new Set(internals.parseEvaluation(probeResult).available);
      const domainClosure = [
        "sagejs.numerics.approximation",
        "sagejs.numerics.integration",
        "sagejs.numerics.linear_algebra",
        "sagejs.numerics.optimization",
        "sagejs.numerics.ode",
        "sagejs.numerics.spectral",
        "sagejs.numerics.statistics",
      ];
      const requirementSatisfied = (id) => {
        const requirement = requirements[id];
        if (requirement === "external:scipy-python") return host.scipy;
        if (requirement === "external:foreign-frontends") return true;
        if (requirement === "external:cminpack-wasm") return true;
        if (requirement === "external:nlopt-wasm") {
          return present.has("sagejs.numerics.optimization");
        }
        if (requirement === "external:browser-process-tree-memory") return true;
        if (["numerics.teaching.cross_domain", "numerics.lifecycle.repeated"].includes(id)) {
          return domainClosure.every((name) => present.has(name));
        }
        return present.has(requirement);
      };
      initializedCapabilities = context.capabilities
        .filter((item) => item.status === "available" && requirementSatisfied(item.id))
        .map((item) => item.id)
        .sort();
      subject = context.subject.kind === "browser"
        ? { kind: "browser", name: "playwright-browser", version: launched.version, engine }
        : { kind: "worker", name: "sagejs-browser-worker", version: launched.version, engine };
      return { subject, capability_ids: initializedCapabilities };
    } catch (error) {
      const details = browserDiagnostics.length === 0
        ? "no browser diagnostics"
        : browserDiagnostics.join(" | ");
      await close();
      throw new Error(`${error?.message ?? error}; ${details}`, { cause: error });
    }
  },

  async runCase(sample) {
    if (page === null) throw new Error("browser qualification adapter is not initialized");
    if (["p8-browser-memory-baseline", "p8-browser-memory-pressure"].includes(sample.id)) {
      return runBrowserMemoryPressure(sample);
    }
    if (sample.id === "p8-browser-worker-replacement") return runBrowserWorkerReplacement();
    return internals.normalizeEvaluated(sample, await evaluateSample(sample));
  },

  close,

  qualificationState() {
    return {
      initialized: page !== null,
      artifact_root: artifactRoot,
      subject,
      capability_ids: [...initializedCapabilities],
    };
  },

  _testing: Object.freeze({
    browserEngine,
    browserExecutable,
    authenticateBrowserExecutable,
    launchBrowser,
    lastBrowserExecutable: () => lastBrowserExecutable,
  }),
};
