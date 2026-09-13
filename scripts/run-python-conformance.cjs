"use strict";

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
  sha256, canonical, snapshotSource,
} = require("../tools/python-compat/evidence.cjs");
const {
  statusOrder, classifySagejs,
  validateIntentionalIncompatibilities, applyIntentionalIncompatibilities,
  makeBaselineRecord, compareBaselineRecord,
} = require("../tools/python-compat/output-baseline.cjs");

const {
  execute, inspectReference: inspectOutputReference, runOne: runOutputCase,
  mapConcurrent, legacyEnvironment, makeReport: makeOutputReport,
} = require("../tools/python-compat/legacy-output-runner.cjs");

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
  return validateIntentionalIncompatibilities(document, selected);
}

async function inspectReference(options, environment) {
  return inspectOutputReference(options, environment, { root });
}

async function runOne(test, options, environment) {
  return runOutputCase(test, options, environment, { corpusRoot, sagejs });
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

function makeReport(options) {
  return makeOutputReport({ ...options, sagejs });
}

function makeBaseline(results, reference, excluded, provenance) {
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  return makeBaselineRecord(results, reference, excluded, provenance, source);
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
  // Preserve the legacy format-error precedence before reading SOURCE.json.
  const source = baseline.format === 2
    ? JSON.parse(readFileSync(sourcePath, "utf8")) : undefined;
  return compareBaselineRecord(results, reference, excluded, baseline, provenance, source);
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
  const environment = legacyEnvironment();
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
