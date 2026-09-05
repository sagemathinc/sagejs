#!/usr/bin/env node
"use strict";

const { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { loadManifest } = require("../tools/python-compat/manifest.cjs");
const { caseEvidence, canonical, sha256 } = require("../tools/python-compat/evidence.cjs");
const { executeAssertion, classifyAssertion } = require("../tools/python-compat/assertion-runner.cjs");
const { currentBuildIdentity, inspectBuildReceipt, outputBindings, outputWitnesses } = require("./build-receipt.cjs");

const root = resolve(__dirname, "..");
const manifestFilename = join(root, "upstream-tests/python-compat/manifest.json");

function parseArguments(args) {
  const options = { only: [], artifactReport: false, python: "python3", json: null, list: false };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (["--only", "--python", "--json"].includes(argument)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`missing value for ${argument}`);
      if (argument === "--only") options.only.push(value);
      else options[argument.slice(2)] = value;
    } else if (argument === "--artifact-report") options.artifactReport = true;
    else if (argument === "--list") options.list = true;
    else if (argument === "--help") options.help = true;
    else throw new Error(`unknown argument ${argument}`);
  }
  return options;
}

function isolatedEnvironment(scratch, ambient = process.env) {
  const environment = {};
  // Keep executable/system-library discovery, never user Python paths, preload
  // flags, tokens, Node options, or the real home. This is hygiene, not a sandbox.
  for (const name of ["PATH", "Path", "SystemRoot", "SYSTEMROOT", "WINDIR", "ComSpec", "PATHEXT"]) {
    if (ambient[name] !== undefined) environment[name] = ambient[name];
  }
  return { ...environment, HOME: scratch, USERPROFILE: scratch,
    APPDATA: scratch, LOCALAPPDATA: scratch, XDG_CACHE_HOME: scratch,
    TMPDIR: scratch, TEMP: scratch, TMP: scratch,
    LANG: "C.UTF-8", LC_ALL: "C.UTF-8", TZ: "UTC", PYTHONHASHSEED: "0",
    PYTHONDONTWRITEBYTECODE: "1" };
}

function artifactIdentity() {
  const identity = currentBuildIdentity(root);
  return {
    inputs: identity,
    executable: { path: process.execPath, sha256: sha256(readFileSync(process.execPath)) },
    sourceLauncherSha256: sha256(readFileSync(join(root, "bin/sagejs-source.cjs"))),
    outputs: outputBindings(root, outputWitnesses(root, identity)),
    node: process.versions.node, v8: process.versions.v8,
    platform: process.platform, architecture: process.arch,
  };
}

async function runCase(entry, python, scratch, { execute = executeAssertion } = {}) {
  const executions = {};
  for (const runtime of ["oracle", "subject"]) {
    const directory = join(scratch, runtime);
    mkdirSync(directory);
    copyFileSync(join(entry.directory, entry.path), join(directory, "case.py"));
    for (const fixture of entry.fixtures) {
      copyFileSync(join(entry.directory, fixture.path), join(directory, fixture.destination));
    }
    const command = runtime === "oracle" ? python : process.execPath;
    const args = runtime === "oracle" ? ["-BS", "case.py"] :
      ["--max-old-space-size=512", join(root, "bin/sagejs-source.cjs"), "--python", "case.py"];
    executions[runtime] = await execute(command, args, {
      cwd: directory, env: isolatedEnvironment(directory), timeoutMs: entry.timeoutMs,
      maxOutputBytes: entry.maxOutputBytes,
    });
    if (runtime === "oracle" && classifyAssertion(executions.oracle, undefined) === "oracle-error") break;
  }
  const classification = classifyAssertion(executions.oracle, executions.subject);
  return { id: entry.id, status: classification, disposition: entry.disposition,
    evidence: caseEvidence(entry.sourceSha256, executions.oracle, executions.subject ?? null),
    performance: { status: "unmeasured", scopes: entry.performanceScopes,
      note: "Execution duration includes process startup and is not comparative performance qualification." },
    executions };
}

async function main(args = process.argv.slice(2)) {
  const options = parseArguments(args);
  if (options.help) {
    console.log("Usage: node scripts/run-python-compat.cjs [--list] [--only ID] [--python PATH] [--json FILE] [--artifact-report]\nDefault execution requires a current build and all selected required cases to pass.\n--artifact-report diagnoses existing artifacts; it cannot qualify a build or update a baseline.");
    return 0;
  }
  const loaded = loadManifest(manifestFilename);
  for (const id of options.only) if (!loaded.cases.some((entry) => entry.id === id)) throw new Error(`unknown case ${id}`);
  const selected = loaded.cases.filter((entry) => options.only.length === 0 || options.only.includes(entry.id));
  if (options.list) {
    for (const entry of selected) console.log(`${entry.id}  ${entry.priority}  ${entry.valueTags.join(", ")}`);
    return 0;
  }
  const beforeBuild = inspectBuildReceipt(root);
  if (!options.artifactReport && !beforeBuild.current) throw new Error(`current build required: ${beforeBuild.reason}; run pnpm build, or use --artifact-report for unqualified diagnosis`);
  const artifacts = artifactIdentity();
  const scratch = mkdtempSync(join(tmpdir(), "sagejs-python-compat-"));
  try {
    const probe = await executeAssertion(options.python, ["-BS", "-c",
      "import json, platform, sys; print(json.dumps(dict(implementation=platform.python_implementation(), version=platform.python_version(), executable=sys.executable)))"], {
      cwd: scratch, env: isolatedEnvironment(scratch), timeoutMs: 5000, maxOutputBytes: 16384,
    });
    if (probe.status !== 0 || probe.error || probe.signal || probe.timedOut || probe.outputLimited || probe.stderr !== "") throw new Error("CPython oracle could not be identified");
    const reference = JSON.parse(probe.stdout);
    if (reference.implementation !== loaded.manifest.oracle.implementation || reference.version !== loaded.manifest.oracle.version) throw new Error(`oracle mismatch: expected ${canonical(loaded.manifest.oracle)}, got ${canonical(reference)}`);
    reference.executableSha256 = sha256(readFileSync(reference.executable));
    console.log(`Python compatibility: ${selected.length} required assertion programs; ${options.artifactReport ? "ARTIFACT DIAGNOSIS (unqualified)" : "current-source gate"}`);
    const results = [];
    for (let index = 0; index < selected.length; index++) {
      const directory = join(scratch, String(index));
      mkdirSync(directory);
      const result = await runCase(selected[index], reference.executable, directory);
      results.push(result);
      console.log(`[${index + 1}/${selected.length}] ${result.status}: ${result.id}`);
    }
    const unchanged = canonical(loaded.provenance) === canonical(loadManifest(manifestFilename).provenance) &&
      canonical(artifacts) === canonical(artifactIdentity()) &&
      reference.executableSha256 === sha256(readFileSync(reference.executable));
    const afterBuild = inspectBuildReceipt(root);
    const passed = results.every((result) => result.status === "pass");
    const qualified = !options.artifactReport && beforeBuild.current && afterBuild.current && unchanged && passed;
    const report = { schema: "sagejs.python-compat-report/v1", reference,
      provenance: loaded.provenance, artifact: artifacts,
      build: { before: beforeBuild, after: afterBuild },
      gate: { qualified, fullManifest: selected.length === loaded.cases.length,
        artifactOnly: options.artifactReport, unchanged, passed }, results };
    if (options.json) writeFileSync(resolve(options.json), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`${results.filter((result) => result.status === "pass").length}/${results.length} pass; ${qualified ? "qualified selected scope" : "NOT QUALIFIED"}`);
    if (!unchanged) throw new Error("source or build outputs changed during execution");
    return options.artifactReport || qualified ? 0 : 1;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (require.main === module) main().then((code) => { process.exitCode = code; }).catch((error) => {
  console.error(error.message); process.exitCode = 1;
});
module.exports = { main, parseArguments, isolatedEnvironment, runCase };
