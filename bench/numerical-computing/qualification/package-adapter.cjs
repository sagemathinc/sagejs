#!/usr/bin/env node
"use strict";

const path = require("node:path");
const { performance } = require("node:perf_hooks");

const { ADAPTER_PROTOCOL } = require("../../../scripts/numerical-computing/contracts.cjs");
const packageRuntime = require("../../../scripts/package-qualification/runtime.cjs");
const nodeAdapter = require("./node-adapter.cjs");

const internals = nodeAdapter.qualificationInternals;
let runtimeContext = null;
let runPython = null;
let runLanguage = null;
let runNode = null;
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
    return runtimeContext.kind === "fresh-npm-install";
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

function parseShape(result, name) {
  checkProcess(result, `MATLAB shape witness ${name}`);
  const matches = `${result.stdout}\n${result.stderr}`.match(/\(\d+\s*,\s*\d+\)/g);
  if (matches === null || matches.length === 0) {
    throw new Error(`MATLAB shape witness ${name} returned no shape\n${result.stdout}\n${result.stderr}`);
  }
  const shape = matches.at(-1).match(/\((\d+)\s*,\s*(\d+)\)/);
  return `(${shape[1]}, ${shape[2]})`;
}

function runParserGuards() {
  if (runNode !== null) return runInstalledParserGuards();
  const started = performance.now();
  const records = PARSER_GUARDS.map(([language, source, expectedName, expectedMessage]) => {
    const result = runLanguage(runtimeContext, source, language, { timeout: 180_000 });
    const output = `${result.stdout}\n${result.stderr}`;
    return {
      source,
      rejected: result.status !== 0,
      name_matches: output.includes(expectedName),
      message_matches: output.includes(expectedMessage),
      positioned: /(?:line|row)\s+\d+|:\d+:\d+/i.test(output),
    };
  });
  const safePrograms = [
    ["matlab", "integral(@(x) x^2,0,1)"],
    ["wolfram", "NIntegrate[x^2,{x,0,1}]"],
  ];
  const safe = safePrograms.map(([language, source]) => {
    const result = runLanguage(runtimeContext, source, language, { timeout: 180_000 });
    checkProcess(result, `${language} safe parser witness`);
    return result.stdout;
  });
  return { raw: { records, safe }, kernelMs: performance.now() - started };
}

function runInstalledParserGuards() {
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
  const result = checkProcess(runNode(runtimeContext, program, { timeout: 180_000 }),
    "installed parser guard witness");
  return { raw: internals.parseEvaluation(result), kernelMs: performance.now() - started };
}

function runMatlabShapes() {
  const started = performance.now();
  const shapes = {};
  for (const [name, source] of Object.entries(MATLAB_SHAPES)) {
    shapes[name] = parseShape(runLanguage(runtimeContext, source, "matlab", {
      timeout: 180_000,
    }), name);
  }
  return { raw: { shapes }, kernelMs: performance.now() - started };
}

async function evaluate(sample) {
  if (sample.id === "p6-multilingual-parser-fail-closed") return runParserGuards();
  if (sample.id === "p6-matlab-vector-shapes") return runMatlabShapes();
  const started = performance.now();
  const result = runPython(runtimeContext, internals.sourceFor(sample.id, sample.input), {
    timeout: 180_000,
  });
  checkProcess(result, `package qualification case ${sample.id}`);
  return { raw: internals.parseEvaluation(result), kernelMs: performance.now() - started };
}

async function close() {
  if (runtimeContext !== null) runtimeContext.cleanup();
  runtimeContext = null;
  runPython = null;
  runLanguage = null;
  runNode = null;
  initializedCapabilities = [];
  initializedSubject = null;
  internals.closeHostOracles();
}

module.exports = {
  protocol: ADAPTER_PROTOCOL,

  async initialize(context) {
    if (runtimeContext !== null) throw new Error("package qualification adapter is already initialized");
    if (context.subject.kind === "npm") {
      runtimeContext = packageRuntime.prepareFreshInstall({
        target: packageRuntime.targetForHost(),
        rootArchive: artifact(context, "npm-root-tarball"),
        platformArchive: artifact(context, "npm-platform-tarball"),
        installStdio: "pipe",
      });
      runPython = packageRuntime.runInstalledSourcePython;
      runLanguage = packageRuntime.runInstalledSourceLanguage;
      runNode = packageRuntime.runInstalledNode;
      initializedSubject = {
        kind: "npm", name: "@sagemath/sagejs", version: runtimeContext.version, engine: null,
      };
    } else if (context.subject.kind === "sea") {
      runtimeContext = packageRuntime.prepareRelocatedSea({
        target: packageRuntime.targetForHost(),
        executable: artifact(context, "sea-executable"),
      });
      runPython = packageRuntime.runRelocatedSeaPython;
      runLanguage = packageRuntime.runRelocatedSeaLanguage;
      runNode = null;
      const version = checkProcess(
        packageRuntime.runRelocatedSeaLanguage(runtimeContext, "version()", "sage"),
        "SEA version probe",
      ).stdout.match(/v(\d+\.\d+\.\d+)/)?.[1];
      if (version === undefined) throw new Error("SEA version probe returned no semantic version");
      initializedSubject = { kind: "sea", name: "sagejs", version, engine: null };
    } else {
      throw new Error(`package adapter refuses subject kind ${context.subject.kind}`);
    }
    try {
      const host = internals.initializeHostOracles();
      const probe = checkProcess(runPython(runtimeContext, moduleProbeSource()), "package module probe");
      const present = new Set(internals.parseEvaluation(probe).available);
      initializedCapabilities = context.capabilities
        .filter((item) => item.status === "available" && requirementSatisfied(item.id, present, host))
        .map((item) => item.id)
        .sort();
      return { subject: initializedSubject, capability_ids: initializedCapabilities };
    } catch (error) {
      await close();
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
};
