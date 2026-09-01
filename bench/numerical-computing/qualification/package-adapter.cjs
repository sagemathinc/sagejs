#!/usr/bin/env node
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { performance } = require("node:perf_hooks");
const { Worker } = require("node:worker_threads");

const { ADAPTER_PROTOCOL } = require("../../../scripts/numerical-computing/contracts.cjs");
const packageRuntime = require("../../../scripts/package-qualification/runtime.cjs");
const nodeAdapter = require("./node-adapter.cjs");

const internals = nodeAdapter.qualificationInternals;
let runtimeContext = null;
let runPython = null;
let runLanguage = null;
let runNode = null;
let runPythonName = null;
let runLanguageName = null;
let runNodeName = null;
let initializedCapabilities = [];
let initializedSubject = null;

const PARSER_GUARDS = Object.freeze([
  ["matlab", "eig([3 1;1 2])", "MatlabSyntaxError", "eig numerical syntax is not supported"],
  ["matlab", "griddedInterpolant([0 1],[0 1])", "MatlabSyntaxError", "griddedInterpolant numerical syntax is not supported"],
  ["matlab", "ttest2([1 2 3],[2 3 4])", "MatlabSyntaxError", "ttest2 numerical syntax is not supported"],
  ["wolfram", "Fourier[{1,2,3}]", "WolframSyntaxError", "Fourier numerical syntax is not supported"],
  ["wolfram", "Eigensystem[{{3,1},{1,2}}]", "WolframSyntaxError", "Eigensystem numerical syntax is not supported"],
  ["wolfram", "FindMinimum[(x-2)^2,{x,0}]", "WolframSyntaxError", "FindMinimum numerical syntax is not supported"],
]);

const MATLAB_SHAPES = Object.freeze({
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
});

const PACKAGE_RUNTIME_PATH = require.resolve("../../../scripts/package-qualification/runtime.cjs");
const PACKAGE_WORKER_SOURCE = String.raw`
"use strict";
const { parentPort, workerData } = require("node:worker_threads");
try {
  const runtime = require(workerData.runtimePath);
  const result = runtime[workerData.runner](workerData.context, ...workerData.args);
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

function runQualificationWorker(source, workerData, {
  resultTimeoutMs = 240_000,
  postMessageExitTimeoutMs = 2_000,
} = {}) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(source, {
      eval: true,
      workerData,
    });
    let settled = false;
    let message = null;
    let terminalError = null;
    let exitTimer = null;
    const resultTimer = setTimeout(() => {
      terminalError ??= new Error("package qualification worker timed out before a clean exit");
      void worker.terminate();
    }, resultTimeoutMs);
    resultTimer.unref?.();
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(resultTimer);
      if (exitTimer !== null) clearTimeout(exitTimer);
      callback(value);
    };
    worker.on("message", (next) => {
      if (message !== null) {
        terminalError ??= new Error("package qualification worker emitted duplicate results");
        void worker.terminate();
        return;
      }
      message = next;
      exitTimer = setTimeout(() => {
        terminalError ??= new Error(
          "package qualification worker retained live handles after emitting a result",
        );
        void worker.terminate();
      }, postMessageExitTimeoutMs);
      exitTimer.unref?.();
    });
    worker.once("error", (error) => {
      terminalError ??= error;
    });
    worker.once("exit", (code) => {
      if (terminalError !== null) return finish(reject, terminalError);
      if (code !== 0) {
        return finish(reject, new Error(`package qualification worker exited with status ${code}`));
      }
      if (message === null) {
        return finish(reject, new Error("package qualification worker exited without a result"));
      }
      if (message?.ok === true) return finish(resolve, message.result);
      const failure = new Error(message?.error?.message ?? "package qualification worker failed");
      failure.name = message?.error?.name ?? "Error";
      if (message?.error?.stack) failure.stack = message.error.stack;
      return finish(reject, failure);
    });
  });
}

function runPackageAsync(runner, context, ...args) {
  if (runner === null) throw new Error("package qualification runner is unavailable");
  return runQualificationWorker(PACKAGE_WORKER_SOURCE, {
    runtimePath: PACKAGE_RUNTIME_PATH,
    runner,
    context: workerRuntimeContext(context),
    args,
  });
}

function artifact(context, name) {
  const found = context.artifacts.find((item) => item.name === name);
  if (found === undefined) throw new Error(`missing bound ${name} artifact`);
  return found.path;
}

function checkProcess(result, description) {
  if (result.status !== 0) {
    throw new Error(`${description} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
  return result;
}

function assertSameFile(left, right, description) {
  const expected = fs.readFileSync(left);
  const actual = fs.readFileSync(right);
  if (!expected.equals(actual)) {
    throw new Error(`${description} differs from the bound source-current artifact`);
  }
}

function fileIdentity(filename) {
  const bytes = fs.readFileSync(filename);
  return {
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  };
}

function validateSeaResourceDigests(result, expected) {
  checkProcess(result, "SEA embedded numerical resource digest probe");
  if (String(result.stderr ?? "").length !== 0) {
    throw new Error("SEA embedded numerical resource digest probe wrote to stderr");
  }
  const lines = String(result.stdout ?? "").trim().split(/\r?\n/);
  if (lines.length !== 1) {
    throw new Error("SEA embedded numerical resource digest probe must emit one JSON line");
  }
  let value;
  try {
    value = JSON.parse(lines[0]);
  } catch {
    throw new Error("SEA embedded numerical resource digest probe emitted malformed JSON");
  }
  const exactKeys = (record, keys, label) => {
    if (record === null || typeof record !== "object" || Array.isArray(record) ||
        Object.keys(record).sort().join("\0") !== [...keys].sort().join("\0")) {
      throw new Error(`${label} has an invalid schema`);
    }
  };
  exactKeys(value, ["schema", "schema_version", "platform", "resources"], "SEA resource record");
  exactKeys(value.platform, ["os", "arch"], "SEA resource platform");
  if (value.schema !== "sagejs.sea-qualification-resource-digests/v1" ||
      value.schema_version !== 1 || value.platform.os !== process.platform ||
      value.platform.arch !== process.arch || !Array.isArray(value.resources) ||
      value.resources.length !== 2) {
    throw new Error("SEA embedded numerical resource digest probe has an invalid identity");
  }
  const resources = new Map();
  for (const resource of value.resources) {
    exactKeys(resource, ["name", "sha256", "bytes"], "SEA resource");
    if (resources.has(resource.name)) throw new Error(`duplicate SEA resource ${resource.name}`);
    resources.set(resource.name, resource);
  }
  for (const [name, identity] of Object.entries(expected)) {
    const actual = resources.get(name);
    if (actual?.sha256 !== identity.sha256 || actual?.bytes !== identity.bytes) {
      throw new Error(`SEA embedded ${name} differs from the bound source-current artifact`);
    }
    resources.delete(name);
  }
  if (resources.size !== 0) throw new Error("SEA resource probe returned unexpected resources");
  return value;
}

function moduleProbeSource() {
  const requirements = internals.capabilityModuleRequirements;
  const modules = [...new Set(Object.values(requirements)
    .filter((name) => !name.startsWith("external:")))].sort();
  return [
    "import json",
    `modules = ${JSON.stringify(modules)}`,
    "available = []",
    "for module in modules:",
    "    try:",
    "        __import__(module)",
    "        available.append(module)",
    "    except Exception:",
    "        pass",
    `print(${JSON.stringify(internals.marker)} + json.dumps({"available": available}, sort_keys=True))`,
  ].join("\n");
}

function requirementSatisfied(id, present, host) {
  const requirement = internals.capabilityModuleRequirements[id];
  if (requirement === "external:scipy-python") return host.scipy;
  if (requirement === "external:foreign-frontends") {
    return foreignFrontendsAvailable(runtimeContext?.kind, runLanguage);
  }
  if (requirement === "external:cminpack-wasm" || requirement === "external:nlopt-wasm") {
    return present.has("sagejs.numerics.optimization");
  }
  if (["numerics.teaching.cross_domain", "numerics.lifecycle.repeated"].includes(id)) {
    return [
      "sagejs.numerics.approximation", "sagejs.numerics.integration",
      "sagejs.numerics.linear_algebra", "sagejs.numerics.optimization",
      "sagejs.numerics.ode", "sagejs.numerics.spectral", "sagejs.numerics.statistics",
    ].every((name) => present.has(name));
  }
  return present.has(requirement);
}

function foreignFrontendsAvailable(kind, languageRunner) {
  return ["fresh-npm-install", "relocated-sea"].includes(kind) &&
    typeof languageRunner === "function";
}

function parseShape(result, name) {
  checkProcess(result, `MATLAB shape witness ${name}`);
  const matches = `${result.stdout}\n${result.stderr}`.match(/\(\d+\s*,\s*\d+\)/g);
  if (matches === null || matches.length === 0) {
    throw new Error(`MATLAB shape witness ${name} returned no shape\n${result.stdout}\n${result.stderr}`);
  }
  const shape = matches.at(-1).match(/\((\d+)\s*,\s*(\d+)\)/);
  return `(${shape[1]}, ${shape[2]})`;
}

async function runParserGuards() {
  if (runNode !== null) return runInstalledParserGuards();
  const started = performance.now();
  const records = [];
  for (const [language, source, expectedName, expectedMessage] of PARSER_GUARDS) {
    const result = await runPackageAsync(
      runLanguageName, runtimeContext, source, language, { timeout: 180_000 },
    );
    const output = `${result.stdout}\n${result.stderr}`;
    records.push({
      source,
      rejected: result.status !== 0,
      name_matches: output.includes(expectedName),
      message_matches: output.includes(expectedMessage),
      positioned: /(?:line|row)\s+\d+|:\d+:\d+/i.test(output),
    });
  }
  const safePrograms = [
    ["matlab", "integral(@(x) x^2,0,1)"],
    ["wolfram", "NIntegrate[x^2,{x,0,1}]"],
  ];
  const safe = [];
  for (const [language, source] of safePrograms) {
    const result = await runPackageAsync(
      runLanguageName, runtimeContext, source, language, { timeout: 180_000 },
    );
    checkProcess(result, `${language} safe parser witness`);
    safe.push(result.stdout);
  }
  return { raw: { records, safe }, kernelMs: performance.now() - started };
}

async function runInstalledParserGuards() {
  const started = performance.now();
  const program = String.raw`
"use strict";
const path = require("node:path");
const root = process.env.SAGEJS_QUALIFICATION_INSTALLED_ROOT;
const marker = ${JSON.stringify(internals.marker)};
const cases = ${JSON.stringify(PARSER_GUARDS)};
(async () => {
  const { createForeignFrontend } = require(path.join(root, "dist", "tools", "foreign", "index.js"));
  const frontends = new Map();
  for (const language of ["matlab", "wolfram"]) {
    frontends.set(language, await createForeignFrontend(language));
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
  process.stdout.write(marker + JSON.stringify({ records, safe }) + "\n");
})().catch((error) => { console.error(error?.stack ?? error); process.exitCode = 1; });
`;
  const result = checkProcess(await runPackageAsync(
    runNodeName, runtimeContext, program, { timeout: 180_000 },
  ),
    "installed parser guard witness");
  return { raw: internals.parseEvaluation(result), kernelMs: performance.now() - started };
}

async function runMatlabShapes() {
  const started = performance.now();
  const shapes = {};
  for (const [name, source] of Object.entries(MATLAB_SHAPES)) {
    shapes[name] = parseShape(await runPackageAsync(
      runLanguageName, runtimeContext, source, "matlab", { timeout: 180_000 },
    ), name);
  }
  return { raw: { shapes }, kernelMs: performance.now() - started };
}

async function evaluate(sample) {
  if (sample.id === "p6-multilingual-parser-fail-closed") return runParserGuards();
  if (sample.id === "p6-matlab-vector-shapes") return runMatlabShapes();
  const started = performance.now();
  const result = await runPackageAsync(
    runPythonName,
    runtimeContext,
    internals.sourceFor(sample.id, sample.input),
    { timeout: 180_000 },
  );
  checkProcess(result, `package qualification case ${sample.id}`);
  return { raw: internals.parseEvaluation(result), kernelMs: performance.now() - started };
}

async function close() {
  let failure = null;
  try {
    if (runtimeContext !== null) runtimeContext.cleanup();
  } catch (error) {
    failure = error;
  }
  try {
    internals.closeHostOracles();
  } catch (error) {
    failure ??= error;
  }
  runtimeContext = null;
  runPython = null;
  runLanguage = null;
  runNode = null;
  runPythonName = null;
  runLanguageName = null;
  runNodeName = null;
  initializedCapabilities = [];
  initializedSubject = null;
  if (failure !== null) throw failure;
}

module.exports = {
  protocol: ADAPTER_PROTOCOL,

  async initialize(context) {
    if (runtimeContext !== null) throw new Error("package qualification adapter is already initialized");
    const scipyOracleArtifact = context.artifacts.find(
      (item) => item.name === "scipy-oracle-binding",
    );
    if (scipyOracleArtifact === undefined || !fs.statSync(scipyOracleArtifact.path).isFile()) {
      throw new Error("scipy-oracle-binding must be bound separately");
    }
    try {
      if (context.subject.kind === "npm") {
        runtimeContext = packageRuntime.prepareFreshInstall({
        target: packageRuntime.targetForHost(),
        rootArchive: artifact(context, "npm-root-tarball"),
        platformArchive: artifact(context, "npm-platform-tarball"),
        installStdio: "pipe",
        });
        assertSameFile(
          artifact(context, "cminpack-wasm"),
          path.join(runtimeContext.installedRoot, "dist", "numerical", "cminpack.wasm"),
          "fresh npm cminpack resource",
        );
        assertSameFile(
          artifact(context, "nlopt-wasm"),
          path.join(runtimeContext.installedRoot, "dist", "numerical", "nlopt-methods.wasm"),
          "fresh npm NLopt resource",
        );
        runPython = packageRuntime.runInstalledSourcePython;
        runLanguage = packageRuntime.runInstalledSourceLanguage;
        runNode = packageRuntime.runInstalledNode;
        runPythonName = "runInstalledSourcePython";
        runLanguageName = "runInstalledSourceLanguage";
        runNodeName = "runInstalledNode";
        initializedSubject = {
          kind: "npm", name: "@sagemath/sagejs", version: runtimeContext.version, engine: null,
        };
      } else if (context.subject.kind === "sea") {
        const expectedResources = {
          "numerical/cminpack.wasm": fileIdentity(artifact(context, "cminpack-wasm")),
          "numerical/nlopt-methods.wasm": fileIdentity(artifact(context, "nlopt-wasm")),
        };
        runtimeContext = packageRuntime.prepareRelocatedSea({
          target: packageRuntime.targetForHost(),
          executable: artifact(context, "sea-executable"),
        });
        runPython = packageRuntime.runRelocatedSeaPython;
        runLanguage = packageRuntime.runRelocatedSeaLanguage;
        runNode = null;
        runPythonName = "runRelocatedSeaPython";
        runLanguageName = "runRelocatedSeaLanguage";
        runNodeName = null;
        const versionResult = checkProcess(
          packageRuntime.runProcess(runtimeContext.executable, ["--version"], { timeout: 30_000 }),
          "SEA version probe",
        );
        const version = `${versionResult.stdout}\n${versionResult.stderr}`
          .match(/(?:sagejs\s+|v)(\d+\.\d+\.\d+)/i)?.[1];
        if (version === undefined) throw new Error("SEA version probe returned no semantic version");
        validateSeaResourceDigests(
          packageRuntime.runProcess(
            runtimeContext.executable,
            ["--qualification-resource-digests"],
            { timeout: 30_000 },
          ),
          expectedResources,
        );
        initializedSubject = { kind: "sea", name: "sagejs", version, engine: null };
      } else {
        throw new Error(`package adapter refuses subject kind ${context.subject.kind}`);
      }
      const host = internals.initializeHostOracles(scipyOracleArtifact.path, context.root);
      const probe = checkProcess(runPython(runtimeContext, moduleProbeSource()), "package module probe");
      const present = new Set(internals.parseEvaluation(probe).available);
      initializedCapabilities = context.capabilities
        .filter((item) => item.status === "available" && requirementSatisfied(item.id, present, host))
        .map((item) => item.id)
        .sort();
      return { subject: initializedSubject, capability_ids: initializedCapabilities };
    } catch (error) {
      try {
        await close();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "package qualification initialization and cleanup both failed",
        );
      }
      throw error;
    }
  },

  async runCase(sample) {
    if (runtimeContext === null) throw new Error("package qualification adapter is not initialized");
    return internals.normalizeEvaluated(sample, await evaluate(sample));
  },

  close,

  qualificationState() {
    return {
      initialized: runtimeContext !== null,
      subject: initializedSubject,
      target: runtimeContext?.target ?? null,
      capability_ids: [...initializedCapabilities],
    };
  },

  _testing: {
    foreignFrontendsAvailable,
    runQualificationWorker,
    validateSeaResourceDigests,
  },
};
