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

const root = join(__dirname, "..");
const suiteRoot = join(root, "upstream-tests", "micropython");
const corpusRoot = join(suiteRoot, "basics");
const baselineRoot = join(suiteRoot, "baselines");
const sourcePath = join(suiteRoot, "SOURCE.json");
const sagejs = join(root, "bin", "sagejs");

const statusOrder = [
  "pass",
  "output-mismatch",
  "compile-error",
  "missing-module",
  "missing-name",
  "runtime-error",
  "timeout",
  "oracle-error",
  "launch-error",
];

function usage() {
  console.log(`Usage: node scripts/run-python-conformance.cjs [options]

Run the vendored MicroPython language corpus against CPython and Sage.js.
Tests without a MicroPython-specific .exp file or unittest dependency must
produce byte-for-byte identical combined stdout/stderr.

Options:
  --check                 Compare every outcome with the checked-in baseline
  --update-baseline       Replace the baseline with the current outcomes
  --python PATH           Reference CPython (default: SAGEJS_REFERENCE_PYTHON
                          or python3)
  --jobs N                Concurrent tests (default: host-dependent, at most 8)
  --timeout MS            Per-runtime timeout (default: 5000)
  --only REGEXP           Run only matching corpus-relative paths
  --verbose               Print diagnostics for every non-passing test
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
    python: process.env.SAGEJS_REFERENCE_PYTHON || "python3",
    jobs: Math.max(1, Math.min(8, hostParallelism)),
    timeout: 5000,
    only: null,
    verbose: false,
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
  return options;
}

function normalizeOutput(output) {
  return output.replace(/\r\n/g, "\n");
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
        timedOut: false,
        error,
      });
      return;
    }

    const chunks = [];
    let timedOut = false;
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        ...result,
        output: normalizeOutput(Buffer.concat(chunks).toString("utf8")),
        timedOut,
      });
    };
    child.stdout.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
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

function classifySagejs(result, expectedOutput) {
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
    if (result.output === expectedOutput) {
      return { status: "pass", detail: "" };
    }
    return {
      status: "output-mismatch",
      detail: firstOutputDifference(expectedOutput, result.output),
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
    };
  }
  if (oracle.timedOut) {
    return {
      name: test.name,
      status: "oracle-error",
      detail: "CPython exceeded the per-runtime timeout",
    };
  }
  if (oracle.status !== 0) {
    return {
      name: test.name,
      status: "oracle-error",
      detail: firstDiagnosticLine(oracle.output),
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
    ...classifySagejs(candidate, oracle.output),
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
      console.log(`  ${status.padEnd(17)} ${String(counts[status]).padStart(4)}`);
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
      console.log(`${result.status.padEnd(17)} ${result.name}: ${result.detail}`);
    }
  }
}

function makeBaseline(results, reference, excluded) {
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  return {
    format: 1,
    source,
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
  };
}

function baselinePathFor(reference) {
  return join(baselineRoot, `${reference.majorMinor}.json`);
}

function compareBaseline(results, reference, excluded, baselinePath) {
  if (!existsSync(baselinePath)) {
    throw new Error(
      `missing ${relative(root, baselinePath)}; run with --update-baseline`,
    );
  }
  const baseline = JSON.parse(readFileSync(baselinePath, "utf8"));
  if (baseline.format !== 1) {
    throw new Error(`unsupported baseline format ${baseline.format}`);
  }
  const source = JSON.parse(readFileSync(sourcePath, "utf8"));
  if (JSON.stringify(baseline.source) !== JSON.stringify(source)) {
    throw new Error("baseline source metadata does not match SOURCE.json");
  }
  if (
    baseline.reference.implementation !== reference.implementation ||
    baseline.reference.majorMinor !== reference.majorMinor
  ) {
    throw new Error(
      `baseline uses ${baseline.reference.implementation} ` +
        `${baseline.reference.majorMinor}, but the reference is ` +
        `${reference.implementation} ${reference.majorMinor}`,
    );
  }

  const changes = [];
  const current = new Map(results.map((result) => [result.name, result.status]));
  for (const [name, expected] of Object.entries(baseline.outcomes)) {
    const actual = current.get(name);
    if (actual === undefined) {
      changes.push(`${name}: missing (baseline ${expected})`);
    } else if (actual !== expected) {
      changes.push(`${name}: ${expected} -> ${actual}`);
    }
  }
  for (const [name, actual] of current) {
    if (!(name in baseline.outcomes)) {
      changes.push(`${name}: new test (${actual})`);
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
  const tests = options.only
    ? selected.filter((test) => options.only.test(test.name))
    : selected;
  if (tests.length === 0) {
    throw new Error("no tests matched");
  }

  const started = Date.now();
  const results = await mapConcurrent(tests, options.jobs, (test) =>
    runOne(test, options, environment),
  );
  printSummary(results, excluded, reference, Date.now() - started);
  if (options.verbose) printDiagnostics(results);

  const launchErrors = results.filter(
    (result) => result.status === "launch-error",
  );
  if (launchErrors.length > 0) {
    printDiagnostics(launchErrors);
    throw new Error("conformance run had infrastructure failures");
  }

  if (options.updateBaseline) {
    mkdirSync(baselineRoot, { recursive: true });
    const baselinePath = baselinePathFor(reference);
    const baseline = makeBaseline(results, reference, excluded);
    writeFileSync(baselinePath, `${JSON.stringify(baseline, null, 2)}\n`);
    console.log(`Updated ${relative(root, baselinePath)}`);
  } else if (options.check) {
    const baselinePath = baselinePathFor(reference);
    const changes = compareBaseline(
      results,
      reference,
      excluded,
      baselinePath,
    );
    if (changes.length > 0) {
      console.error("\nConformance outcomes changed:");
      for (const change of changes) console.error(`  ${change}`);
      console.error("\nReview the changes, then run --update-baseline.");
      process.exitCode = 1;
    } else {
      console.log("Baseline matches.");
    }
  }
}

main().catch((error) => {
  console.error(`python conformance: ${error.message}`);
  process.exitCode = 1;
});
