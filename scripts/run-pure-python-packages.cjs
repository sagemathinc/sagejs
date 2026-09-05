#!/usr/bin/env node
"use strict";

const { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, realpathSync, statSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve, relative, isAbsolute, sep } = require("node:path");
const { executeAssertion } = require("../tools/python-compat/assertion-runner.cjs");
const { canonical, sha256, executionBytes, snapshotSource } = require("../tools/python-compat/evidence.cjs");
const { isolatedEnvironment } = require("./run-python-compat.cjs");
const { currentBuildIdentity, inspectBuildReceipt, outputBindings, outputWitnesses } = require("./build-receipt.cjs");

const { pythonExecutable } = require("../tools/python-executable.cjs");
const { phaseOptions, validatePhaseFixture, invalidatePhaseMeasurements, runPhaseProbe } = require("./python-package-phases.cjs");
const { validatePolicy } = require("../bench/python-compat/classify.cjs");

const root = resolve(__dirname, "..");
const manifestPath = join(root, "upstream-tests/python-packages/manifest.json");
const marker = "__SAGEJS_PACKAGE_PATH__=";
const normalizeName = (name) => name.toLowerCase().replace(/[-_.]+/g, "-");
const oracleIdentitySource = "import json, platform, sys, sysconfig; print(json.dumps(dict(implementation=platform.python_implementation(), implementationName=sys.implementation.name, version=platform.python_version(), fullVersion=sys.version, executable=sys.executable, cacheTag=sys.implementation.cache_tag, freeThreaded=bool(sysconfig.get_config_var('Py_GIL_DISABLED')), gilEnabled=sys._is_gil_enabled())))";

function parseArguments(args, pythonSelection = {}) {
  const options = { only: [], python: pythonExecutable(pythonSelection), json: null, artifactReport: false, list: false,
    timings: false, samples: 7, warmups: 3, iterations: 1000 };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (["--only", "--python", "--json", "--samples", "--warmups", "--iterations"].includes(arg)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`missing value for ${arg}`);
      if (["--samples", "--warmups", "--iterations"].includes(arg)) {
        if (!/^\d+$/.test(value)) throw new Error(`invalid numeric value for ${arg}`);
        options[arg.slice(2)] = Number(value);
      } else if (arg === "--only") options.only.push(value);
      else options[arg.slice(2)] = value;
    } else if (arg === "--timings") options.timings = true;
    else if (arg === "--artifact-report") options.artifactReport = true;
    else if (arg === "--list") options.list = true;
    else if (arg === "--help") options.help = true;
    else throw new Error(`unknown argument ${arg}`);
  }
  phaseOptions(options);
  if (!options.timings && args.some((arg) => ["--samples", "--warmups", "--iterations"].includes(arg))) {
    throw new Error("sample/warmup/iteration controls require --timings");
  }
  return options;
}

function loadManifest(filename = manifestPath) {
  const bytes = readFileSync(filename);
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== 2 || manifest.oracle?.implementation !== "CPython" ||
      !/^3\.14\.\d+$/.test(manifest.oracle.version) || !Array.isArray(manifest.packages) ||
      !manifest.packages.length) throw new Error("invalid package manifest");
  const names = new Set();
  for (const entry of manifest.packages) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.name) || names.has(entry.name) ||
        !/^[A-Za-z_]\w*$/.test(entry.module) || !/^[A-Za-z0-9.]+$/.test(entry.version) ||
        !/^[A-Za-z0-9_.-]+\.whl$/.test(entry.wheel) || !/^[a-f0-9]{64}$/.test(entry.sha256) ||
        typeof entry.source !== "string" || !entry.source.endsWith("\n") ||
        typeof entry.stdout !== "string") throw new Error("invalid package entry");
    if (entry.phases !== undefined) validatePhaseFixture(entry.phases);
    names.add(entry.name);
  }
  return { manifest, sha256: sha256(bytes) };
}

function checkReceipt(entry, receipt) {
  if (typeof receipt.name !== "string" || normalizeName(receipt.name) !== entry.name ||
      receipt.version !== entry.version || receipt.sha256 !== entry.sha256 ||
      receipt.wheel !== entry.wheel) throw new Error(`${entry.name}: installed wheel identity mismatch`);
}

function failureKind(result) {
  if (result.error) return "launch-error";
  if (result.outputLimited) return "output-limit";
  if (result.timedOut) return "timeout";
  if (result.signal || result.status !== 0) return "execution-failure";
  if (executionBytes(result, "stderr").length) return "unexpected-stderr";
  return null;
}

function checkWorkflow(result, entry, target, resolvePath = realpathSync) {
  const failure = failureKind(result);
  if (failure) return { kind: failure };
  const output = executionBytes(result, "stdout");
  const prefix = Buffer.from(entry.stdout + marker);
  if (!output.subarray(0, prefix.length).equals(prefix)) return { kind: "output-mismatch" };
  const suffix = output.subarray(prefix.length);
  const modulePath = suffix.toString("utf8").replace(/\n$/, "");
  if (!suffix.equals(Buffer.from(modulePath + "\n")) || /[\r\n]/.test(modulePath) ||
      !isAbsolute(modulePath)) return { kind: "module-path-mismatch" };
  try {
    const resolved = resolvePath(modulePath);
    const rel = relative(resolvePath(target), resolved);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
      return { kind: "module-path-mismatch" };
    }
    return { kind: "pass", modulePath: resolved };
  } catch { return { kind: "module-path-mismatch" }; }
}

function validateOracleIdentity(execution, oracle, {
  resolvePath = realpathSync, inspectPath = statSync, readBytes = readFileSync,
} = {}) {
  if (failureKind(execution)) throw new Error("CPython identification failed");
  // executionBytes already permits CRLF transport while retaining the original
  // bytes in execution.raw. Reject other CR bytes and malformed UTF-8, rather
  // than parsing a lossy decoded replacement string as identity evidence.
  const bytes = executionBytes(execution, "stdout");
  const output = bytes.toString("utf8");
  if (!bytes.equals(Buffer.from(output)) || bytes.includes(13)) {
    throw new Error("invalid CPython identity transport");
  }
  const reference = JSON.parse(output);
  if (!reference || reference.implementation !== oracle.implementation ||
      reference.implementationName !== "cpython" || reference.version !== oracle.version) {
    throw new Error("CPython identity does not match manifest");
  }
  if (typeof reference.fullVersion !== "string" || !reference.fullVersion.startsWith(`${reference.version} `) ||
      typeof reference.cacheTag !== "string" || !/^cpython-[a-z0-9_]+$/.test(reference.cacheTag) ||
      typeof reference.freeThreaded !== "boolean" || typeof reference.gilEnabled !== "boolean" ||
      (!reference.freeThreaded && !reference.gilEnabled)) {
    throw new Error("incomplete or inconsistent CPython build identity");
  }
  if (typeof reference.executable !== "string" || !isAbsolute(reference.executable)) {
    throw new Error("CPython identity requires an absolute executable");
  }
  const realExecutable = resolvePath(reference.executable);
  if (!isAbsolute(realExecutable) || !inspectPath(realExecutable).isFile()) {
    throw new Error("CPython executable must resolve to a regular file");
  }
  return { ...reference, realExecutable, executableSha256: sha256(readBytes(realExecutable)) };
}

function artifactIdentity() {
  const inputs = currentBuildIdentity(root);
  return { inputs, outputs: outputBindings(root, outputWitnesses(root, inputs)),
    launcherSha256: sha256(readFileSync(join(root, "bin/sagejs-source.cjs"))),
    executableSha256: sha256(readFileSync(process.execPath)), node: process.versions.node,
    v8: process.versions.v8, platform: process.platform, architecture: process.arch };
}

async function runCase(entry, python, target, directory, { execute = executeAssertion, resolvePath = realpathSync } = {}) {
  const program = join(directory, "case.py");
  const source = entry.source + `print(${JSON.stringify(marker)} + __import__(${JSON.stringify(entry.module)}).__file__)\n`;
  const sourceSha256 = sha256(source);
  writeFileSync(program, source);
  const env = { ...isolatedEnvironment(directory), SAGEJS_SITE_PACKAGES: target,
    PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
  const bounds = { cwd: directory, env, timeoutMs: 30000, maxOutputBytes: 1048576 };
  const result = { name: entry.name, version: entry.version, sourceSha256,
    sourceChecks: {}, sourceUnchanged: true,
    paths: { oracle: null, subject: null },
    performance: { status: "unmeasured", note: "Child duration is diagnostic, not comparative timing qualification." },
    executions: { oracle: null, subject: null } };
  // Bind the bytes actually offered to each runtime. In particular, a passing
  // oracle must not replace/remove the shared program before the subject runs.
  function checkSource(phase) {
    let actual = null;
    try { actual = sha256(readFileSync(program)); } catch {}
    result.sourceChecks[phase] = actual;
    if (actual === sourceSha256) return true;
    result.sourceUnchanged = false;
    result.status = "source-changed";
    result.detail = phase;
    return false;
  }
  // -S disables site discovery; insert exactly the reviewed wheel target. Avoid
  // ambient PYTHONPATH, global site-packages and bytecode mutations of the tree.
  const bootstrap = `import sys; sys.path.insert(0, ${JSON.stringify(target)}); exec(compile(open(${JSON.stringify(program)}, encoding='utf-8').read(), ${JSON.stringify(program)}, 'exec'))`;
  if (!checkSource("beforeOracle")) return result;
  const oracle = await execute(python, ["-BS", "-c", bootstrap], bounds);
  result.executions.oracle = oracle;
  if (!checkSource("afterOracle")) return result;
  const oracleCheck = checkWorkflow(oracle, entry, target, resolvePath);
  if (oracleCheck.kind !== "pass") {
    result.status = "oracle-error";
    result.detail = oracleCheck.kind;
    return result;
  }
  result.paths.oracle = oracleCheck.modulePath;
  if (!checkSource("beforeSubject")) return result;
  const subject = await execute(process.execPath,
    ["--max-old-space-size=512", join(root, "bin/sagejs-source.cjs"), "--python", program], bounds);
  result.executions.subject = subject;
  if (!checkSource("afterSubject")) return result;
  const subjectCheck = checkWorkflow(subject, entry, target, resolvePath);
  result.paths.subject = subjectCheck.modulePath ?? null;
  result.status = subjectCheck.kind === "pass" && subjectCheck.modulePath !== oracleCheck.modulePath
    ? "module-path-mismatch" : subjectCheck.kind;
  return result;
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log("Usage: node scripts/run-pure-python-packages.cjs [--only NAME] [--python PATH] [--json FILE] [--list] [--artifact-report] [--timings --samples N --warmups N --iterations N]\nSelected pinned workflows only; artifact reports cannot qualify source or update baselines.");
    return 0;
  }
  const loaded = loadManifest();
  for (const name of options.only) if (!loaded.manifest.packages.some((entry) => entry.name === name)) throw new Error(`unknown package ${name}`);
  const selected = loaded.manifest.packages.filter((entry) => !options.only.length || options.only.includes(entry.name));
  if (options.list) { for (const entry of selected) console.log(`${entry.name}==${entry.version}`); return 0; }
  const before = inspectBuildReceipt(root);
  if (!options.artifactReport && !before.current) throw new Error(`current build required: ${before.reason}`);
  const artifacts = artifactIdentity();
  const scratch = mkdtempSync(join(tmpdir(), "sagejs-pypi-corpus-"));
  const report = { schema: "sagejs.python-package-report/v1", manifest: loaded,
    transport: { encoding: "utf-8", normalization: "crlf-to-lf-bytes", rawEncoding: "base64" },
    artifact: artifacts, build: { before }, reference: null, installation: null, receipts: {}, results: [],
    gate: { qualified: false, artifactOnly: options.artifactReport,
      fullManifest: selected.length === loaded.manifest.packages.length, passed: false, unchanged: false } };
  try {
    const env = { ...isolatedEnvironment(scratch), PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" };
    const identified = await executeAssertion(options.python, ["-BS", "-c", oracleIdentitySource],
    { cwd: scratch, env, timeoutMs: 5000, maxOutputBytes: 16384 });
    report.oracleIdentification = identified;
    const reference = validateOracleIdentity(identified, loaded.manifest.oracle);
    report.reference = reference;
    const target = join(scratch, "packages");
    mkdirSync(target);
    // Install the full pinned dependency closure even when selecting workflows.
    const installation = await executeAssertion(process.execPath,
      [join(root, "bin/sagejs-source.cjs"), "pip", "--target", target, "--no-deps", "install",
        ...loaded.manifest.packages.map((entry) => `${entry.name}==${entry.version}`)],
      { cwd: scratch, env, timeoutMs: 300000, maxOutputBytes: 1048576 });
    report.installation = installation;
    if (failureKind(installation)) throw new Error(`package installation failed: ${failureKind(installation)}`);
    for (const entry of loaded.manifest.packages) {
      const receipt = JSON.parse(readFileSync(join(target, ".sagejs-installed", `${entry.name}.json`), "utf8"));
      checkReceipt(entry, receipt);
      report.receipts[entry.name] = receipt;
    }
    const performancePolicy = options.timings ? validatePolicy(JSON.parse(readFileSync(
      join(root, "bench/python-compat/performance-policy.json"), "utf8"))) : null;
    report.performancePolicy = performancePolicy;
    const tree = snapshotSource(target);
    report.packageTree = tree;
    for (const entry of selected) {
      const directory = join(scratch, entry.name);
      mkdirSync(directory);
      const result = await runCase(entry, reference.executable, target, directory);
      report.results.push(result);
      if (options.timings) result.performance = await runPhaseProbe(entry, {
        root, python: reference.executable, target, directory: join(directory, "performance"),
        options, behavior: result, policy: performancePolicy,
        comparable: !options.artifactReport && before.current,
      }, { checkWorkflow, failureKind });
      console.log(`${result.status}: ${entry.name} ${entry.version}`);
    }
    const identifiedAfter = await executeAssertion(reference.executable, ["-BS", "-c", oracleIdentitySource],
      { cwd: scratch, env, timeoutMs: 5000, maxOutputBytes: 16384 });
    report.oracleIdentificationAfter = identifiedAfter;
    report.referenceAfter = validateOracleIdentity(identifiedAfter, loaded.manifest.oracle);
    report.build.after = inspectBuildReceipt(root);
    report.gate.unchanged = report.results.every((result) => result.sourceUnchanged && result.performance.sourceUnchanged !== false) &&
      loaded.sha256 === loadManifest().sha256 &&
      canonical(artifacts) === canonical(artifactIdentity()) &&
      canonical(reference) === canonical(report.referenceAfter) &&
      tree.sha256 === snapshotSource(target).sha256;
    report.gate.behaviorPassed = report.results.every((entry) => entry.status === "pass");
    report.gate.performancePassed = !options.timings || report.results.every((entry) =>
      entry.performance.status === "measured-provisional" || entry.performance.status === "artifact-observation" ||
      entry.performance.reason === "no-reviewed-phase-fixture");
    report.gate.passed = report.gate.behaviorPassed && report.gate.performancePassed;
    report.gate.qualified = !options.artifactReport && before.current && report.build.after.current &&
      report.gate.unchanged && report.gate.passed;
    for (const result of report.results) {
      if (result.performance.scopes) {
        result.performance.currentSourceQualified = report.gate.qualified;
        if (!report.gate.unchanged || (!options.artifactReport && !report.build.after.current)) {
          invalidatePhaseMeasurements(result.performance, "source-or-artifacts-changed");
        }
      }
    }
    if (!report.gate.unchanged) throw new Error("source, runtime or installed packages changed during execution");
    console.log(`${report.results.filter((entry) => entry.status === "pass").length}/${selected.length} selected pinned workflows pass; ${report.gate.qualified ? "qualified selected scope" : "NOT QUALIFIED"}`);
    return options.artifactReport || report.gate.qualified ? 0 : 1;
  } catch (error) {
    for (const result of report.results) {
      invalidatePhaseMeasurements(result.performance, "incomplete-or-invalid-run");
    }
    report.error = error.message;
    console.error(error.message);
    return 1;
  } finally {
    try { if (options.json) writeFileSync(resolve(options.json), `${JSON.stringify(report, null, 2)}\n`); }
    finally { rmSync(scratch, { recursive: true, force: true }); }
  }
}

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(error.message); process.exitCode = 1;
});
module.exports = { parseArguments, loadManifest, checkReceipt, failureKind, checkWorkflow, oracleIdentitySource, validateOracleIdentity, runCase, main };
