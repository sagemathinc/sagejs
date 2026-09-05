"use strict";

const { spawn } = require("node:child_process");
const {
  availableParallelism,
} = require("node:os");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} = require("node:fs");
const { join, relative } = require("node:path");
const { inspectBuildReceipt, workspaceFingerprint } = require("./build-receipt.cjs");
const { pythonExecutable } = require("../tools/python-executable.cjs");
const {
  schema: evidenceSchema, sha256, canonical, normalizeOutput, snapshotSource,
  caseEvidence, reviewedEvidence, reviewMatches, compareCaseRecord, executionBytes,
} = require("../tools/python-compat/evidence.cjs");

const root = join(__dirname, "..");
const suiteRoot = join(root, "upstream-tests", "micropython");
const corpusRoot = join(suiteRoot, "basics");
const baselineRoot = join(suiteRoot, "baselines");
const sourcePath = join(suiteRoot, "SOURCE.json");
const intentionalPath = join(
  suiteRoot,
  "INTENTIONAL-INCOMPATIBILITIES.json",
);
// Never qualify a separately installed SEA/native package as this checkout.
const sagejs = join(root, "bin", "sagejs-source.cjs");

const statusOrder = [
  "pass",
  "intentional-incompatibility",
  "output-mismatch",
  "compile-error",
  "missing-module",
  "missing-name",
  "runtime-error",
  "timeout",
  "oracle-error",
  "launch-error",
];
const statusWidth =
  Math.max(...statusOrder.map((status) => status.length)) + 2;

function usage() {
  console.log(`Usage: node scripts/run-python-conformance.cjs [options]

Run the vendored MicroPython language corpus against CPython and Sage.js.
Tests without a MicroPython-specific .exp file or unittest dependency must
produce byte-for-byte identical combined stdout/stderr.

Options:
  --check                 Compare every outcome with the checked-in baseline
  --update-baseline       Replace the baseline with the current outcomes
  --python PATH           Reference CPython (default: SAGEJS_REFERENCE_PYTHON,
                          PYTHON, or the host's standard Python command)
  --jobs N                Concurrent tests (default: host-dependent, at most 8)
  --timeout MS            Per-runtime timeout (default: 5000)
  --only REGEXP           Run only matching corpus-relative paths
  --verbose               Print diagnostics for every non-passing test
  --json PATH             Preserve raw executions and source/artifact identities
  --artifact-report       Read-only diagnosis of existing artifacts, even if
                          the workspace build receipt is stale; never a gate
  --help                  Show this help

With neither --check nor --update-baseline, the command is a read-only report.`);
}

function positiveInteger(flag, text) {
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${flag} requires a positive integer`);
  }
  return value;
}

function parseArguments(argv) {
  const hostParallelism =
    typeof availableParallelism === "function" ? availableParallelism() : 4;
  const options = {
    check: false,
    updateBaseline: false,
    python: pythonExecutable(),
    jobs: Math.max(1, Math.min(8, hostParallelism)),
    timeout: 5000,
    only: null,
    verbose: false,
    json: null,
    artifactReport: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--check") {
      options.check = true;
    } else if (argument === "--update-baseline") {
      options.updateBaseline = true;
    } else if (argument === "--python") {
      options.python = argv[++index] || "";
      if (!options.python) throw new Error("--python requires a path");
    } else if (argument === "--jobs") {
      options.jobs = positiveInteger("--jobs", argv[++index]);
    } else if (argument === "--timeout") {
      options.timeout = positiveInteger("--timeout", argv[++index]);
    } else if (argument === "--only") {
      const pattern = argv[++index];
      if (!pattern) throw new Error("--only requires a regular expression");
      options.only = new RegExp(pattern);
    } else if (argument === "--verbose") {
      options.verbose = true;
    } else if (argument === "--json") {
      options.json = argv[++index];
      if (!options.json) throw new Error("--json requires a path");
    } else if (argument === "--artifact-report") {
      options.artifactReport = true;
    } else if (argument === "--help" || argument === "-h") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  if (options.check && options.updateBaseline) {
    throw new Error("--check and --update-baseline are mutually exclusive");
  }
  if (options.updateBaseline && options.only) {
    throw new Error("--update-baseline cannot be combined with --only");
  }
  if (options.check && options.only) {
    throw new Error("--check cannot be combined with --only");
  }
  if (options.artifactReport && (options.check || options.updateBaseline)) {
    throw new Error("--artifact-report cannot check or update a baseline");
  }
  return options;
}

function requireCurrentBuild(inspector = inspectBuildReceipt) {
  const status = inspector(root);
  if (!status.current) {
    throw new Error(
      `the Sage.js build is stale (${status.reason}); run pnpm build:check`,
    );
  }
  return status;
}

function requireUnchangedWorkspace(before, after = workspaceFingerprint(root)) {
  if (before !== after) throw new Error("validation workspace changed during execution");
}

function execute(command, args, { cwd, env, timeout }) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(command, args, {
        cwd,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      resolve({
        status: null,
        signal: null,
        output: "",
        stdout: "",
        stderr: "",
        raw: { output: "", stdout: "", stderr: "" },
        timedOut: false,
        error: { name: error.name, code: error.code ?? null, message: error.message },
      });
      return;
    }

    const chunks = [];
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const raw = {
        output: Buffer.concat(chunks), stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      };
      resolve({
        ...result,
        error: result.error ? {
          name: result.error.name, code: result.error.code ?? null,
          message: result.error.message,
        } : null,
        output: normalizeOutput(raw.output.toString("utf8")),
        stdout: normalizeOutput(raw.stdout.toString("utf8")),
        stderr: normalizeOutput(raw.stderr.toString("utf8")),
        raw: Object.fromEntries(Object.entries(raw).map(([stream, bytes]) => [stream, bytes.toString("base64")])),
        timedOut,
      });
    };
    child.stdout.on("data", (chunk) => { chunks.push(Buffer.from(chunk)); stdout.push(Buffer.from(chunk)); });
    child.stderr.on("data", (chunk) => { chunks.push(Buffer.from(chunk)); stderr.push(Buffer.from(chunk)); });
    child.on("error", (error) => {
      finish({ status: null, signal: null, error });
    });
    child.on("close", (status, signal) => {
      finish({ status, signal, error: null });
    });
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeout);
  });
}

function firstDiagnosticLine(output) {
  return (
    output
      .split("\n")
      .map((line) => line.trim())
      .find(Boolean) || "(no diagnostic output)"
  );
}

function classifySagejs(result, expected) {
  if (result.error) {
    return {
      status: "launch-error",
      detail: result.error.message,
    };
  }
  if (result.timedOut) {
    return {
      status: "timeout",
      detail: "Sage.js exceeded the per-runtime timeout",
    };
  }
  if (result.status === 0) {
    if (executionBytes(result, "output").equals(executionBytes(expected, "output"))) {
      return { status: "pass", detail: "" };
    }
    return {
      status: "output-mismatch",
      detail: firstOutputDifference(expected.output, result.output),
    };
  }

  const diagnostic = result.output;
  let status = "runtime-error";
  if (/Failed Import: .* module doesn't exist/.test(diagnostic)) {
    status = "missing-module";
  } else if (
    /Unexpected token|invalid syntax|Invalid syntax|Expecting .* found/.test(
      diagnostic,
    )
  ) {
    status = "compile-error";
  } else if (
    /ReferenceError:|(?:^|\s)[A-Za-z_$][\w$]* is not defined/.test(diagnostic)
  ) {
    status = "missing-name";
  }
  return {
    status,
    detail: firstDiagnosticLine(diagnostic),
  };
}

function firstOutputDifference(expected, actual) {
  const expectedLines = expected.split("\n");
  const actualLines = actual.split("\n");
  const count = Math.max(expectedLines.length, actualLines.length);
  for (let index = 0; index < count; index += 1) {
    if (expectedLines[index] !== actualLines[index]) {
      return (
        `line ${index + 1}: expected ${JSON.stringify(expectedLines[index])}, ` +
        `got ${JSON.stringify(actualLines[index])}`
      );
    }
  }
  return "output differs";
}

function discoverTests() {
  const selected = [];
  const excluded = {
    expected: [],
    unittest: [],
  };
  for (const name of readdirSync(corpusRoot).sort()) {
    if (!name.endsWith(".py")) continue;
    const file = join(corpusRoot, name);
    if (existsSync(`${file}.exp`)) {
      excluded.expected.push(name);
      continue;
    }
    const source = readFileSync(file, "utf8");
    if (/(^|\W)unittest(\W|$)/m.test(source)) {
      excluded.unittest.push(name);
      continue;
    }
    selected.push({
      name,
      file,
    });
  }
  return { selected, excluded };
}

function loadIntentionalIncompatibilities(selected) {
  const document = JSON.parse(readFileSync(intentionalPath, "utf8"));
  if (document.format !== 2 || !document.tests) {
    throw new Error(
      "INTENTIONAL-INCOMPATIBILITIES.json must use source/outcome-bound format 2",
    );
  }
  const candidates = new Set(selected.map((test) => test.name));
  for (const [name, entry] of Object.entries(document.tests)) {
    if (!candidates.has(name)) {
      throw new Error(
        `intentional incompatibility ${name} is not a differential candidate`,
      );
    }
    if (
      !entry ||
      !statusOrder.includes(entry.expectedStatus) ||
      ["pass", "intentional-incompatibility", "launch-error", "oracle-error", "timeout"].includes(entry.expectedStatus) ||
      typeof entry.reason !== "string" ||
      !entry.reason || !entry.reference || entry.evidence?.schema !== evidenceSchema ||
      (entry.alternateEvidence !== undefined && !Array.isArray(entry.alternateEvidence))
    ) {
      throw new Error(
        `intentional incompatibility ${name} has an invalid review record`,
      );
    }
    for (const evidence of reviewedEvidence(entry)) {
      if (evidence?.schema !== evidenceSchema ||
          evidence.sourceSha256 !== entry.evidence.sourceSha256 ||
          evidence.normalization !== entry.evidence.normalization ||
          canonical(evidence.oracle) !== canonical(entry.evidence.oracle)) {
        throw new Error(`intentional incompatibility ${name} has an invalid alternate fingerprint`);
      }
    }
  }
  return document.tests;
}

function applyIntentionalIncompatibilities(results, reviewed, reference) {
  return results.map((result) => {
    const entry = reviewed[result.name];
    if (!entry || !reviewMatches(entry, result, reference)) return result;
    return {
      ...result,
      rawStatus: result.status,
      reviewedEvidence: reviewedEvidence(entry),
      status: "intentional-incompatibility",
      detail: `${entry.reason} (observed ${result.status})`,
    };
  });
}

async function inspectReference(options, environment) {
  const result = await execute(
    options.python,
    [
      "-BS",
      "-c",
      "import platform; print(platform.python_implementation()); print(platform.python_version())",
    ],
    {
      cwd: root,
      env: environment,
      timeout: options.timeout,
    },
  );
  if (result.error) {
    throw new Error(
      `reference Python could not start (${options.python}): ${result.error.message}`,
    );
  }
  if (result.timedOut || result.status !== 0) {
    throw new Error(
      `reference Python identification failed: ${firstDiagnosticLine(result.output)}`,
    );
  }
  const [implementation, version] = result.output.trim().split("\n");
  if (implementation !== "CPython" || !version) {
    throw new Error(
      `the reference must be CPython; got ${JSON.stringify(result.output.trim())}`,
    );
  }
  return {
    implementation,
    version,
    majorMinor: version.split(".").slice(0, 2).join("."),
    command: options.python,
  };
}

async function runOne(test, options, environment) {
  const sourceSha256 = sha256(readFileSync(test.file));
  const oracle = await execute(options.python, ["-BS", test.file], {
    cwd: corpusRoot,
    env: environment,
    timeout: options.timeout,
  });
  if (oracle.error) {
    return {
      name: test.name,
      status: "launch-error",
      detail: oracle.error.message,
      evidence: caseEvidence(sourceSha256, oracle, null),
      executions: { oracle, subject: null },
    };
  }
  if (oracle.timedOut) {
    return {
      name: test.name,
      status: "oracle-error",
      detail: "CPython exceeded the per-runtime timeout",
      evidence: caseEvidence(sourceSha256, oracle, null),
      executions: { oracle, subject: null },
    };
  }
  if (oracle.status !== 0) {
    return {
      name: test.name,
      status: "oracle-error",
      detail: firstDiagnosticLine(oracle.output),
      evidence: caseEvidence(sourceSha256, oracle, null),
      executions: { oracle, subject: null },
    };
  }

  const candidate = await execute(
    process.execPath,
    [sagejs, "--python", test.file],
    {
      cwd: corpusRoot,
      env: environment,
      timeout: options.timeout,
    },
  );
  return {
    name: test.name,
    ...classifySagejs(candidate, oracle),
    evidence: caseEvidence(sourceSha256, oracle, candidate),
    executions: { oracle, subject: candidate },
  };
}

async function mapConcurrent(items, concurrency, callback) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await callback(items[index], index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, items.length)) },
      () => worker(),
    ),
  );
  return results;
}

function countStatuses(results) {
  const counts = Object.fromEntries(statusOrder.map((status) => [status, 0]));
  for (const result of results) {
    counts[result.status] = (counts[result.status] || 0) + 1;
  }
  return counts;
}

function printSummary(results, excluded, reference, elapsedMs) {
  const counts = countStatuses(results);
  console.log(
    `Python conformance: ${results.length} tests against ` +
      `${reference.implementation} ${reference.version}`,
  );
  for (const status of statusOrder) {
    if (counts[status]) {
      console.log(
        `  ${status.padEnd(statusWidth)} ` +
          `${String(counts[status]).padStart(4)}`,
      );
    }
  }
  console.log(
    `  excluded          ${String(
      excluded.expected.length + excluded.unittest.length,
    ).padStart(4)} ` +
      `(${excluded.expected.length} upstream expectations, ` +
      `${excluded.unittest.length} unittest)`,
  );
  console.log(`  elapsed           ${(elapsedMs / 1000).toFixed(2)} s`);
}

function printDiagnostics(results) {
  for (const result of results) {
    if (result.status !== "pass") {
      console.log(
        `${result.status.padEnd(statusWidth)} ` +
          `${result.name}: ${result.detail}`,
      );
    }
  }
}

function sourceProvenance() {
  return {
    sourceMetadataSha256: sha256(readFileSync(sourcePath)),
    corpus: snapshotSource(corpusRoot),
    licenseSha256: sha256(readFileSync(join(suiteRoot, "LICENSE"))),
    upstreamReadmeSha256: sha256(readFileSync(join(suiteRoot, "UPSTREAM-TESTS-README.md"))),
    intentionalReviewsSha256: sha256(readFileSync(intentionalPath)),
  };
}

function makeReport({ reference, provenance, excluded, artifacts, build, results, gate, workspaceSha256 }) {
  return {
    schema: "sagejs.python-conformance-report/v1",
    reference, provenance, excluded, workspaceSha256,
    subject: { route: "source", command: process.execPath, args: [sagejs, "--python"] },
    artifact: {
      files: artifacts, node: process.versions.node, v8: process.versions.v8,
      platform: process.platform, arch: process.arch, currentBuild: build.current,
      qualifiedGate: build.current === true && gate.status === "passed",
    },
    gate,
    results,
  };
}

function makeBaseline(results, reference, excluded, provenance) {
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  return {
    format: 2,
    source,
    provenance,
    reference: {
      implementation: reference.implementation,
      version: reference.version,
      majorMinor: reference.majorMinor,
    },
    selection: {
      candidates: results.length,
      excludedExpected: excluded.expected,
      excludedUnittest: excluded.unittest,
    },
    outcomes: Object.fromEntries(
      results.map((result) => [result.name, result.status]),
    ),
    rawStatuses: Object.fromEntries(
      results.map((result) => [result.name, result.rawStatus ?? result.status]),
    ),
    evidence: Object.fromEntries(
      results.map((result) => [result.name, result.reviewedEvidence?.[0] ?? result.evidence]),
    ),
    reviewedEvidence: Object.fromEntries(results
      .filter((result) => result.status === "intentional-incompatibility")
      .map((result) => [result.name, result.reviewedEvidence])),
  };
}

function baselinePathFor(reference) {
  return join(baselineRoot, `${reference.majorMinor}.json`);
}

function compareBaseline(results, reference, excluded, baselinePath, provenance) {
  if (!existsSync(baselinePath)) {
    throw new Error(
      `missing ${relative(root, baselinePath)}; run with --update-baseline`,
    );
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (baseline.format !== 2) {
    throw new Error(`baseline format ${baseline.format} lacks source/outcome fingerprints; use report mode and explicitly review a format-2 migration`);
  }
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  if (JSON.stringify(baseline.source) !== JSON.stringify(source)) {
    throw new Error("baseline source metadata does not match SOURCE.json");
  }
  if (
    baseline.reference.implementation !== reference.implementation ||
    baseline.reference.version !== reference.version
  ) {
    throw new Error(
      `baseline uses ${baseline.reference.implementation} ` +
        `${baseline.reference.version}, but the reference is ` +
        `${reference.implementation} ${reference.version}`,
    );
  }

  const changes = [];
  if (baseline.selection.candidates !== results.length) {
    changes.push("candidate count changed");
  }
  if (canonical(baseline.provenance) !== canonical(provenance)) {
    changes.push("source/fixture/license/review provenance changed");
  }
  const current = new Map(results.map((result) => [result.name, result]));
  for (const [name, expected] of Object.entries(baseline.outcomes)) {
    const actual = current.get(name);
    changes.push(...compareCaseRecord(name, {
      status: expected, rawStatus: baseline.rawStatuses[name], evidence: baseline.evidence[name],
      reviewedEvidence: baseline.reviewedEvidence?.[name],
    }, actual && { ...actual, rawStatus: actual.rawStatus ?? actual.status }));
  }
  for (const [name, actual] of current) {
    if (!(name in baseline.outcomes)) {
      changes.push(`${name}: new test (${actual.status})`);
    }
  }

  const baselineExpected = baseline.selection.excludedExpected || [];
  const baselineUnittest = baseline.selection.excludedUnittest || [];
  if (JSON.stringify(baselineExpected) !== JSON.stringify(excluded.expected)) {
    changes.push("the set of .exp-excluded tests changed");
  }
  if (JSON.stringify(baselineUnittest) !== JSON.stringify(excluded.unittest)) {
    changes.push("the set of unittest-excluded tests changed");
  }
  return changes;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const workspaceSha256 = workspaceFingerprint(root);
  const build = options.artifactReport ? inspectBuildReceipt(root) : requireCurrentBuild();
  if (options.artifactReport) {
    console.log(`Artifact-only diagnostic report; not a current-source gate (${build.reason ?? "build receipt is current"}).`);
  }
  const artifacts = Object.fromEntries([
    "bin/sagejs-source.cjs",
    "dist/compiler/compiler.js", "dist/runtime-cache/runtime-bootstrap-python.js",
  ].map((path) => [path, sha256(readFileSync(join(root, path)))]));
  const provenance = sourceProvenance();
  const environment = {
    ...process.env,
    LC_ALL: "C.UTF-8",
    LANG: "C.UTF-8",
    PYTHONDONTWRITEBYTECODE: "1",
    PYTHONHASHSEED: "0",
    TZ: "UTC",
  };
  const reference = await inspectReference(options, environment);
  const { selected, excluded } = discoverTests();
  const intentional = loadIntentionalIncompatibilities(selected);
  const tests = options.only
    ? selected.filter((test) => options.only.test(test.name))
    : selected;
  if (tests.length === 0) {
    throw new Error("no tests matched");
  }

  const started = Date.now();
  const rawResults = await mapConcurrent(tests, options.jobs, (test) =>
    runOne(test, options, environment),
  );
  const results = applyIntentionalIncompatibilities(
    rawResults,
    intentional,
    reference,
  );
  printSummary(results, excluded, reference, Date.now() - started);
  if (options.verbose) printDiagnostics(results);

  const gate = { status: options.check ? "not-completed" : "not-requested" };
  try {
    requireUnchangedWorkspace(workspaceSha256);
    if (canonical(provenance) !== canonical(sourceProvenance())) {
      throw new Error("corpus source, fixtures, license, reviews, or source metadata changed during execution");
    }
    for (const [path, hash] of Object.entries(artifacts)) {
      if (sha256(readFileSync(join(root, path))) !== hash) throw new Error(`runtime artifact changed during execution: ${path}`);
    }
    if (!options.artifactReport) requireCurrentBuild();

    const launchErrors = rawResults.filter(
      (result) => result.status === "launch-error",
    );
    if (launchErrors.length > 0) {
      printDiagnostics(launchErrors);
      throw new Error("conformance run had infrastructure failures");
    }

    if (options.updateBaseline) {
      mkdirSync(baselineRoot, { recursive: true });
      const baselinePath = baselinePathFor(reference);
      const baseline = makeBaseline(results, reference, excluded, provenance);
      writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
      console.log(`Updated ${relative(root, baselinePath)}`);
    } else if (options.check) {
      const baselinePath = baselinePathFor(reference);
      const changes = compareBaseline(
        results,
        reference,
        excluded,
        baselinePath,
        provenance,
      );
      if (changes.length > 0) {
        gate.status = "failed";
        gate.changes = changes;
        console.error("\nConformance outcomes changed:");
        for (const change of changes) console.error(`  ${change}`);
        console.error("\nReview the changes, then run --update-baseline.");
        process.exitCode = 1;
      } else {
        gate.status = "passed";
        console.log("Baseline matches.");
      }
    }
  } catch (error) {
    gate.status = options.check ? "failed" : "not-requested";
    gate.error = error.message;
    throw error;
  } finally {
    if (options.json) {
      writeFileSync(options.json, `${JSON.stringify(makeReport({
        reference, provenance, excluded, artifacts, build, results, gate, workspaceSha256,
      }), null, 2)}\n`);
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`python conformance: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  requireUnchangedWorkspace,
  requireCurrentBuild, makeBaseline, compareBaseline, sourceProvenance,
  applyIntentionalIncompatibilities, runOne, execute, parseArguments,
  makeReport, discoverTests,
  classifySagejs,
};
