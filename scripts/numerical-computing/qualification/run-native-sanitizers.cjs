#!/usr/bin/env node
"use strict";

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  canonicalJson,
  contentId,
  digestPath,
  platformIdentity,
  readJson,
  repositoryIdentity,
  sha256,
} = require("../common.cjs");
const { writeImmutableJson } = require("../receipt.cjs");

const root = path.resolve(__dirname, "..", "..", "..");
const SCHEMA = "sagejs.numerical-native-sanitizer-evidence/v1";
const LOG_LIMIT = 8 * 1024 * 1024;
const COMPONENTS = Object.freeze(["cminpack", "nlopt"]);
const COLLECTOR = "scripts/numerical-computing/qualification/run-native-sanitizers.cjs";
const SANITIZERS = Object.freeze({
  address: {
    flag: "-fsanitize=address",
    environment: { ASAN_OPTIONS: "detect_leaks=1:halt_on_error=1" },
  },
  undefined: {
    flag: "-fsanitize=undefined",
    environment: { UBSAN_OPTIONS: "halt_on_error=1:print_stacktrace=1" },
  },
  leak: {
    flag: "-fsanitize=leak",
    environment: { LSAN_OPTIONS: "exitcode=23" },
  },
});

function usage() {
  return [
    "Usage: node scripts/numerical-computing/qualification/run-native-sanitizers.cjs \\",
    "  --output PATH [--compiler PATH] [--component all|cminpack|nlopt] [--allow-dirty]",
    "",
    "Runs source-bound native component harnesses under ASAN, UBSAN, and LSAN.",
    "This is native C component evidence, not a claim that Wasm ran under a native sanitizer.",
    "Build both locked Wasm backends first so their source-closure reports and extracted", 
    "upstream sources are available. The output path is immutable.",
    "",
  ].join("\n");
}

function parseArguments(argv) {
  const options = {
    output: null,
    compiler: "cc",
    components: [...COMPONENTS],
    requireClean: true,
    help: false,
  };
  for (let index = 0; index < argv.length; ++index) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      options.help = true;
    } else if (argument === "--allow-dirty") {
      options.requireClean = false;
    } else if (["--output", "--compiler", "--component"].includes(argument)) {
      const value = argv[++index];
      if (value === undefined || value.length === 0) throw new Error(`${argument} requires a value`);
      if (argument === "--output") options.output = value;
      if (argument === "--compiler") options.compiler = value;
      if (argument === "--component") {
        if (value === "all") options.components = [...COMPONENTS];
        else if (COMPONENTS.includes(value)) options.components = [value];
        else throw new Error(`unsupported component ${value}`);
      }
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  if (!options.help && options.output === null) throw new Error("--output is required");
  return options;
}

function fileDigest(filename) {
  const bytes = fs.readFileSync(filename);
  return { sha256: sha256(bytes), bytes: bytes.length };
}

function assertSameJson(label, actual, expected) {
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} does not match the source lock`);
  }
}

function assertDigest(filename, expected, label) {
  const actual = fileDigest(filename);
  if (actual.sha256 !== expected) {
    throw new Error(`${label} digest mismatch: expected ${expected}, got ${actual.sha256}`);
  }
  return actual;
}

function cminpackRecipe() {
  const packageRoot = path.join(root, "packages/flint-wasm/numerical");
  const lockPath = path.join(packageRoot, "sources/cminpack-lock.json");
  const reportPath = path.join(packageRoot, "build/build-report.json");
  const lock = readJson(lockPath);
  const report = readJson(reportPath);
  assertSameJson("cminpack build report source", report.source, lock.cminpack);
  const sourceRoot = path.join(packageRoot, "build/source", `cminpack-${lock.cminpack.revision}`);
  const sources = [
    "src/dpmpar.c", "src/enorm.c", "src/fdjac2.c", "src/lmdif.c",
    "src/lmder.c", "src/lmpar.c", "src/qrfac.c", "src/qrsolv.c",
  ];
  const closure = new Map(report.source_closure.inputs.map((item) => [item.path, item]));
  for (const relative of ["include/cminpack.h", "src/minpackP.h", ...sources]) {
    const expected = closure.get(`<cminpack>/${relative}`);
    if (expected === undefined) throw new Error(`cminpack report omits ${relative}`);
    assertDigest(path.join(sourceRoot, relative), expected.sha256, `cminpack ${relative}`);
  }
  const harness = "bench/numerical-computing/qualification/native-sanitizers/cminpack-component-harness.c";
  const artifactPath = path.join(packageRoot, report.artifact.path);
  assertDigest(artifactPath, report.artifact.sha256, "cminpack Wasm artifact");
  return {
    id: "cminpack",
    revision: lock.cminpack.revision,
    lock: digestPath(root, path.relative(root, lockPath), "cminpack lock"),
    build_report: digestPath(root, path.relative(root, reportPath), "cminpack build report"),
    source_closure_sha256: report.source_closure.sha256,
    harness: digestPath(root, harness, "cminpack sanitizer harness"),
    artifact: {
      ...digestPath(root, path.relative(root, artifactPath), "cminpack Wasm artifact"),
      content_sha256: report.artifact.sha256,
    },
    sourceRoot,
    includeDirectories: [path.join(sourceRoot, "include"), path.join(sourceRoot, "src")],
    definitions: ["-DCMINPACK_NO_DLL"],
    sources: sources.map((item) => path.join(sourceRoot, item)),
    scope: {
      native_component: "locked cminpack lmdif/lmder source selected by the Sage.js Wasm build",
      workloads: ["successful-lmdif", "successful-lmder", "callback-stop", "repeated-lifecycle-512"],
      excludes: ["Wasm-linear-memory-boundary", "host-callback-runtime", "artifact-authentication"],
      paired_gate: "test/numerical-p3-backends/abi-fuzz.test.mjs and test/numerical-p3-backends/lm-wasm.test.mjs",
    },
  };
}

function nloptRecipe() {
  const packageRoot = path.join(root, "src/lib/sagejs/numerics/optimization/backends/nlopt");
  const lockPath = path.join(packageRoot, "source-lock.json");
  const reportPath = path.join(packageRoot, "build/build-report.json");
  const lock = readJson(lockPath);
  const report = readJson(reportPath);
  assertSameJson("NLopt build report source", report.source, lock.nlopt);
  const sourceRoot = path.join(packageRoot, "build/source", `nlopt-${lock.nlopt.revision}`);
  const sources = [...report.source_closure.compiled_sources];
  const allowedSources = new Set([
    "src/algs/neldermead/nldrmd.c",
    "src/algs/cobyla/cobyla.c",
    "src/util/stop.c",
    "src/util/redblack.c",
    "src/util/rescale.c",
  ]);
  for (const source of sources) {
    if (!allowedSources.has(source)) throw new Error(`NLopt report selects unexpected ${source}`);
  }
  for (const required of ["src/algs/neldermead/nldrmd.c", "src/util/stop.c"]) {
    if (!sources.includes(required)) throw new Error(`NLopt report omits required ${required}`);
  }
  const hasCobyla = sources.includes("src/algs/cobyla/cobyla.c");
  const closure = new Map(report.source_closure.files.map((item) => [item.path, item]));
  const upstreamInputs = [
    "src/api/nlopt.h", "src/algs/neldermead/neldermead.h",
    "src/util/nlopt-util.h",
    ...sources,
  ];
  if (hasCobyla) upstreamInputs.push("src/algs/cobyla/cobyla.h");
  if (sources.includes("src/util/redblack.c")) upstreamInputs.push("src/util/redblack.h");
  for (const relative of upstreamInputs) {
    const expected = closure.get(relative);
    if (expected === undefined) throw new Error(`NLopt report omits ${relative}`);
    assertDigest(path.join(sourceRoot, relative), expected.sha256, `NLopt ${relative}`);
  }
  const configPath = path.join(packageRoot, "build/config/nlopt_config.h");
  const configEntry = closure.get("generated/nlopt_config.h");
  if (configEntry === undefined) throw new Error("NLopt report omits generated/nlopt_config.h");
  assertDigest(configPath, configEntry.sha256, "NLopt generated config");
  const harness = "bench/numerical-computing/qualification/native-sanitizers/nlopt-component-harness.c";
  const artifactPath = path.join(packageRoot, "build", report.artifact.filename);
  assertDigest(artifactPath, report.artifact.sha256, "NLopt Wasm artifact");
  return {
    id: "nlopt",
    revision: lock.nlopt.revision,
    lock: digestPath(root, path.relative(root, lockPath), "NLopt lock"),
    build_report: digestPath(root, path.relative(root, reportPath), "NLopt build report"),
    source_closure_sha256: report.source_closure.sha256,
    harness: digestPath(root, harness, "NLopt sanitizer harness"),
    artifact: {
      ...digestPath(root, path.relative(root, artifactPath), "NLopt Wasm artifact"),
      content_sha256: report.artifact.sha256,
    },
    sourceRoot,
    includeDirectories: [
      path.dirname(configPath), path.join(sourceRoot, "src/api"),
      path.join(sourceRoot, "src/util"), path.join(sourceRoot, "src/algs/neldermead"),
      path.join(sourceRoot, "src/algs/cobyla"),
    ],
    definitions: [`-DSAGEJS_NLOPT_HAVE_COBYLA=${hasCobyla ? 1 : 0}`],
    sources: sources.map((item) => path.join(sourceRoot, item)),
    scope: {
      native_component: hasCobyla
        ? "locked NLopt Nelder-Mead and COBYLA C source selected by the Sage.js Wasm build"
        : "locked NLopt Nelder-Mead C source selected by the Sage.js Wasm build; COBYLA is excluded",
      workloads: [
        "successful-nelder-mead", "forced-stop", "repeated-lifecycle-512",
        ...(hasCobyla ? ["successful-constrained-cobyla"] : []),
      ],
      excludes: ["Wasm-linear-memory-boundary", "host-callback-runtime", "artifact-authentication"],
      paired_gate: "test/numerical-p3-nlopt/abi-fuzz.test.mjs and test/numerical-p3-nlopt/backend.test.mjs",
    },
  };
}

function resolveCompiler(command) {
  const locate = spawnSync("which", [command], { encoding: "utf8", timeout: 10_000 });
  if (locate.error) throw locate.error;
  if (locate.status !== 0) throw new Error(`compiler not found: ${command}`);
  const located = locate.stdout.trim();
  const resolved = fs.realpathSync(located);
  const version = spawnSync(resolved, ["--version"], {
    encoding: "utf8", timeout: 10_000, maxBuffer: LOG_LIMIT,
  });
  if (version.error) throw version.error;
  if (version.status !== 0) throw new Error(`${resolved} --version failed`);
  return {
    command,
    path: resolved,
    ...fileDigest(resolved),
    version: version.stdout.trim(),
  };
}

function normalizedToken(value, temporaryRoot) {
  return value
    .replaceAll(root, "<repository>")
    .replaceAll(temporaryRoot, "<temporary>");
}

function runProcess(command, args, { environment = {}, timeout = 120_000 } = {}) {
  const started = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...environment },
    maxBuffer: LOG_LIMIT,
    timeout,
  });
  const elapsed_ms = Number(process.hrtime.bigint() - started) / 1e6;
  return {
    status: result.status,
    signal: result.signal,
    error: result.error === undefined ? null : String(result.error.message ?? result.error),
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    elapsed_ms,
  };
}

function runSanitizer(compiler, recipe, sanitizer, temporaryRoot) {
  const specification = SANITIZERS[sanitizer];
  const executable = path.join(temporaryRoot, `${recipe.id}-${sanitizer}`);
  const common = [
    "-std=c11", "-O1", "-g", "-fno-omit-frame-pointer", "-fno-common",
    "-Wall", "-Wextra", specification.flag,
  ];
  const compileArgs = [
    ...common,
    ...recipe.definitions,
    ...recipe.includeDirectories.flatMap((directory) => ["-I", directory]),
    path.join(root, recipe.harness.path),
    ...recipe.sources,
    "-lm", "-o", executable,
  ];
  const compile = runProcess(compiler.path, compileArgs);
  let execute = null;
  let executable_sha256 = null;
  if (compile.status === 0 && compile.error === null) {
    executable_sha256 = fileDigest(executable).sha256;
    execute = runProcess(executable, [], { environment: specification.environment });
  }
  const passed = compile.status === 0 && compile.error === null && execute !== null &&
    execute.status === 0 && execute.signal === null && execute.error === null;
  return {
    sanitizer,
    status: passed ? "passed" : "failed",
    compiler_flags: common,
    environment: specification.environment,
    compile: {
      command: normalizedToken(compiler.path, temporaryRoot),
      arguments: compileArgs.map((item) => normalizedToken(item, temporaryRoot)),
      ...compile,
    },
    executable_sha256,
    execute: execute === null ? null : {
      command: normalizedToken(executable, temporaryRoot),
      arguments: [],
      ...execute,
    },
  };
}

function componentEvidence(compiler, recipe, temporaryRoot) {
  const runs = Object.keys(SANITIZERS).map((sanitizer) =>
    runSanitizer(compiler, recipe, sanitizer, temporaryRoot));
  return {
    id: recipe.id,
    status: runs.every((item) => item.status === "passed") ? "passed" : "failed",
    revision: recipe.revision,
    lock: recipe.lock,
    build_report: recipe.build_report,
    source_closure_sha256: recipe.source_closure_sha256,
    harness: recipe.harness,
    artifact: recipe.artifact,
    source_files: recipe.sources.map((filename) => ({
      path: normalizedToken(filename, temporaryRoot),
      ...fileDigest(filename),
    })),
    scope: recipe.scope,
    runs,
  };
}

function buildEvidence(options) {
  if (process.platform !== "linux" || process.arch !== "x64") {
    throw new Error(`native sanitizer evidence requires linux-x64, got ${process.platform}-${process.arch}`);
  }
  const repository = repositoryIdentity(root);
  if (options.requireClean && !repository.clean) {
    throw new Error("repository must be clean; --allow-dirty is development-only and cannot qualify a release");
  }
  const compiler = resolveCompiler(options.compiler);
  const recipes = {
    cminpack: cminpackRecipe,
    nlopt: nloptRecipe,
  };
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-numerical-sanitizers-"));
  try {
    const components = options.components.map((id) =>
      componentEvidence(compiler, recipes[id](), temporaryRoot));
    const core = {
      schema: SCHEMA,
      generated_at: new Date().toISOString(),
      status: components.every((item) => item.status === "passed") ? "passed" : "failed",
      repository,
      platform: platformIdentity(),
      collector: digestPath(root, COLLECTOR, "native sanitizer collector"),
      compiler,
      scope: {
        claim: "native-source-component-sanitizer-evidence",
        wasm_sanitized: false,
        qualification_rule: "pair with exact-candidate Wasm ABI, corruption, allocation, callback, cancellation, and lifecycle gates",
      },
      components,
    };
    return { ...core, id: contentId(core) };
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }
  const evidence = buildEvidence(options);
  writeImmutableJson(options.output, evidence);
  process.stdout.write(`${evidence.status}: ${evidence.id} -> ${path.resolve(options.output)}\n`);
  return evidence.status === "passed" ? 0 : 1;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  COMPONENTS,
  SANITIZERS,
  SCHEMA,
  buildEvidence,
  cminpackRecipe,
  main,
  nloptRecipe,
  parseArguments,
  usage,
};
