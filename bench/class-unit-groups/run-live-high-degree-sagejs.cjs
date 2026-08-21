#!/usr/bin/env node
"use strict";

// Bounded live Sage.js acceptance runner. The committed external-CAS corpus is
// expected data only; this runner reports live supported, incomplete, timeout,
// and error outcomes distinctly.

const childProcess = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const here = __dirname;
const root = path.resolve(here, "../..");
const defaultFixture = path.join(
  root,
  "test/fixtures/number-field-class-unit-high-degree-oracles.json",
);

const CASE_POLICIES = {
  6: { timeout_seconds: 180, max_relation_attempts: 4096, max_relations: 4096 },
  7: { timeout_seconds: 240, max_relation_attempts: 6144, max_relations: 6144 },
  8: { timeout_seconds: 360, max_relation_attempts: 8192, max_relations: 8192 },
  9: { timeout_seconds: 600, max_relation_attempts: 16384, max_relations: 16384 },
  10: { timeout_seconds: 900, max_relation_attempts: 32768, max_relations: 32768 },
};

const SHARED_LIMITS = {
  max_factor_base_bound: 10000,
  max_factor_base_size: 2048,
  max_candidates_per_ideal: 128,
  max_random_terms: 7,
  max_coefficient_bound: 5,
  max_partial_relations: 4096,
  large_prime_bound_multiplier: 20,
  precision_bits: 128,
  max_precision_bits: 1024,
  max_analytic_prime_bound: 1000000,
  max_memory_bytes: 1024 * 1024 * 1024,
};

function usage() {
  console.log(`Usage: node ${path.relative(root, __filename)} [options]

Options:
  --proof MODE        conditional, unconditional, or both (default: conditional)
  --degrees LIST      comma-separated subset of 6,7,8,9,10
  --fixture PATH      alternate normalized expected corpus
  --executable PATH   Sage.js launcher override
  --timeout-scale N   multiply per-case hard timeouts (default: 1)
  --output PATH       write the complete normalized live receipt
  --dry-run           validate fixture, policies, and job order without computing
  --help              show this text

When MODE is both, all proof=False jobs run before any proof=True job.`);
}

function parseArguments(argv) {
  const options = {
    proof: "conditional",
    degrees: [6, 7, 8, 9, 10],
    fixture: defaultFixture,
    executable: process.env.SAGEJS_TEST_EXECUTABLE || null,
    timeoutScale: 1,
    output: null,
    dryRun: false,
  };
  const values = new Map([
    ["--proof", "proof"],
    ["--degrees", "degrees"],
    ["--fixture", "fixture"],
    ["--executable", "executable"],
    ["--timeout-scale", "timeoutScale"],
    ["--output", "output"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    } else if (argument === "--dry-run") options.dryRun = true;
    else if (values.has(argument)) {
      if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
      options[values.get(argument)] = argv[(index += 1)];
    } else throw new Error(`unknown argument: ${argument}`);
  }
  if (!["conditional", "unconditional", "both"].includes(options.proof)) {
    throw new Error("--proof must be conditional, unconditional, or both");
  }
  if (typeof options.degrees === "string") {
    options.degrees = options.degrees.split(",").map(Number);
  }
  if (
    options.degrees.length === 0 ||
    new Set(options.degrees).size !== options.degrees.length ||
    options.degrees.some((degree) => !Object.hasOwn(CASE_POLICIES, degree))
  ) {
    throw new Error("--degrees must be a unique subset of 6,7,8,9,10");
  }
  options.timeoutScale = Number(options.timeoutScale);
  if (!Number.isFinite(options.timeoutScale) || options.timeoutScale <= 0) {
    throw new Error("--timeout-scale must be positive");
  }
  return options;
}

function invocation(options, sourcePath) {
  if (options.executable) return [path.resolve(options.executable), ["--python", sourcePath]];
  if (process.platform === "win32") {
    return [process.execPath, [path.join(root, "bin", "sagejs-source.cjs"), "--python", sourcePath]];
  }
  return [path.join(root, "bin", "sagejs"), ["--python", sourcePath]];
}

function runExternal(executable, args, spawnOptions, timeoutMilliseconds) {
  if (process.platform !== "win32" && fs.existsSync("/usr/bin/timeout")) {
    const seconds = Math.max(1, Math.ceil(timeoutMilliseconds / 1000));
    const run = childProcess.spawnSync(
      "/usr/bin/timeout",
      ["--signal=TERM", "--kill-after=5s", `${seconds}s`, executable, ...args],
      { ...spawnOptions, timeout: timeoutMilliseconds + 10000, killSignal: "SIGKILL" },
    );
    if ([124, 137].includes(run.status)) run.timedOut = true;
    return run;
  }
  const run = childProcess.spawnSync(executable, args, {
    ...spawnOptions,
    timeout: timeoutMilliseconds,
    killSignal: "SIGKILL",
  });
  run.timedOut = run.error?.code === "ETIMEDOUT";
  return run;
}

function pythonSource(entry, proof, limits) {
  const coefficients = JSON.stringify(entry.polynomial.map(Number));
  const keywordArguments = Object.entries(limits)
    .map(([name, value]) => `${name}=${value}`)
    .join(",\n    ");
  return `
import json
import time

R = PolynomialRing(QQ, "x")
x = R.gen()
coefficients = ${coefficients}
f = sum(coefficients[index] * x**index for index in range(len(coefficients)))
K = NumberField(f, "a${entry.degree}")
started = time.monotonic()
result = K.class_unit_group(
    proof=${proof ? "True" : "False"},
    ${keywordArguments}
)
elapsed = time.monotonic() - started
record = {
    "degree": ${entry.degree},
    "proof": ${proof ? "True" : "False"},
    "complete": result.complete,
    "proof_status": result.proof_status,
    "reason": result.reason,
    "algorithm": result.algorithm,
    "elapsed_seconds": elapsed,
    "stages": [stage.to_dict() for stage in result.stages],
    "diagnostics": result.diagnostics,
}
if result.complete:
    class_group = result.class_group()
    unit_group = result.unit_group()
    regulator = result.regulator()
    record["class_group"] = {
        "invariant_factors": [str(value) for value in class_group.invariants()],
        "order": str(class_group.order()),
    }
    record["unit_group"] = {
        "rank": unit_group.unit_rank,
        "torsion_order": str(unit_group.torsion.order),
        "generator_count": len(result.units()),
    }
    record["regulator"] = {
        "lower": str(regulator.lower),
        "upper": str(regulator.upper),
        "precision_bits": regulator.precision_bits,
        "rigorous": regulator.rigorous,
        "full_rank_certified": regulator.full_rank_certified,
    }
print("SAGEJS_LIVE_CU|" + json.dumps(record, sort_keys=True, separators=(",", ":")))
`;
}

function expectedByDegree(fixture) {
  const expected = new Map();
  for (const entry of fixture.cases) {
    if (expected.has(entry.degree)) throw new Error(`duplicate degree ${entry.degree}`);
    expected.set(entry.degree, entry);
  }
  for (const degree of Object.keys(CASE_POLICIES).map(Number)) {
    if (!expected.has(degree)) throw new Error(`fixture lacks degree ${degree}`);
  }
  return expected;
}

function rationalFromText(text) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:\/(\d+))?$/.exec(text);
  if (!match || (match[3] && match[4])) {
    throw new Error(`non-rational regulator value: ${text}`);
  }
  const sign = match[1] === "-" ? -1n : 1n;
  if (match[4]) return [sign * BigInt(match[2]), BigInt(match[4])];
  const fractional = match[3] || "";
  return [
    sign * BigInt(`${match[2]}${fractional}`),
    10n ** BigInt(fractional.length),
  ];
}

function compareRationals(left, right) {
  const difference = left[0] * right[1] - right[0] * left[1];
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function decimalRoundingCell(text) {
  const match = /^-?\d+(?:\.(\d+))?$/.exec(text);
  if (!match) throw new Error(`non-decimal oracle value: ${text}`);
  const center = rationalFromText(text);
  const radiusDenominator = 2n * 10n ** BigInt((match[1] || "").length);
  return [
    [
      center[0] * radiusDenominator - center[1],
      center[1] * radiusDenominator,
    ],
    [
      center[0] * radiusDenominator + center[1],
      center[1] * radiusDenominator,
    ],
  ];
}

function regulatorOverlapsRoundedDecimal(lower, upper, text) {
  const [cellLower, cellUpper] = decimalRoundingCell(text);
  return (
    compareRationals(lower, cellUpper) <= 0 &&
    compareRationals(cellLower, upper) <= 0
  );
}

function regulatorWidthIsSmall(lower, upper, target) {
  const differenceNumerator = upper[0] * lower[1] - lower[0] * upper[1];
  const differenceDenominator = upper[1] * lower[1];
  if (differenceNumerator < 0n) return false;
  const scale = 1n << 90n;
  if (compareRationals(target, [1n, 1n]) <= 0) {
    return differenceNumerator * scale <= differenceDenominator;
  }
  return (
    differenceNumerator * target[1] * scale <=
    differenceDenominator * target[0]
  );
}

function checkComplete(record, expected, proof) {
  const expectedStatus = proof
    ? "exact-unconditional"
    : "exact-relations-conditional-grh";
  const failures = [];
  if (record.proof_status !== expectedStatus) failures.push("proof_status");
  if (
    JSON.stringify(record.class_group.invariant_factors) !==
      JSON.stringify(expected.class_group.invariant_factors) ||
    record.class_group.order !== expected.class_group.order
  ) {
    failures.push("class_group");
  }
  if (
    record.unit_group.rank !== expected.unit_group.rank ||
    record.unit_group.torsion_order !== expected.unit_group.torsion_order ||
    record.unit_group.generator_count !== expected.unit_group.rank
  ) {
    failures.push("unit_group");
  }
  if (!record.regulator.rigorous || !record.regulator.full_rank_certified) {
    failures.push("regulator_certification");
  } else {
    const lower = rationalFromText(record.regulator.lower);
    const upper = rationalFromText(record.regulator.upper);
    const target = rationalFromText(expected.regulator_decimal);
    if (!regulatorOverlapsRoundedDecimal(lower, upper, expected.regulator_decimal)) {
      failures.push("regulator_containment");
    }
    if (!regulatorWidthIsSmall(lower, upper, target)) {
      failures.push("regulator_width");
    }
  }
  record.acceptance = failures.length === 0 ? "pass" : "mismatch";
  record.mismatches = failures;
}

function policyForDegree(degree, timeoutScale) {
  const casePolicy = CASE_POLICIES[degree];
  const limits = { ...SHARED_LIMITS, ...casePolicy };
  delete limits.timeout_seconds;
  return {
    timeout_seconds: casePolicy.timeout_seconds * timeoutScale,
    limits,
  };
}

function runCase(options, entry, proof) {
  const selectedPolicy = policyForDegree(entry.degree, options.timeoutScale);
  const policy = selectedPolicy.limits;
  const timeoutSeconds = selectedPolicy.timeout_seconds;
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), `sagejs-live-cu-${entry.degree}-`));
  const sourcePath = path.join(directory, "case.py");
  fs.writeFileSync(sourcePath, pythonSource(entry, proof, policy), "utf8");
  const [executable, args] = invocation(options, sourcePath);
  const started = process.hrtime.bigint();
  try {
    const run = runExternal(
      executable,
      args,
      { cwd: root, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      Math.ceil(timeoutSeconds * 1000),
    );
    const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
    const common = {
      degree: entry.degree,
      proof,
      timeout_seconds: timeoutSeconds,
      limits: policy,
      process_total_seconds: processSeconds,
    };
    if (run.timedOut) return { ...common, outcome: "timeout" };
    if (run.error || run.status !== 0) {
      return {
        ...common,
        outcome: "error",
        exit_code: run.status,
        error: run.error?.message || "child exited nonzero",
        stderr: (run.stderr || "").trim(),
      };
    }
    const line = run.stdout
      .trim()
      .split(/\r?\n/)
      .findLast((candidate) => candidate.startsWith("SAGEJS_LIVE_CU|"));
    if (!line) return { ...common, outcome: "error", error: "missing normalized record" };
    const record = { ...common, ...JSON.parse(line.slice("SAGEJS_LIVE_CU|".length)) };
    record.outcome = record.complete ? "live-supported-complete" : "live-incomplete";
    if (record.complete) checkComplete(record, entry, proof);
    return record;
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const fixture = JSON.parse(fs.readFileSync(path.resolve(options.fixture), "utf8"));
  if (fixture.schema_version !== 1) throw new Error("unsupported fixture schema");
  const expected = expectedByDegree(fixture);
  const proofModes =
    options.proof === "both"
      ? [false, true]
      : [options.proof === "unconditional"];
  const jobs = proofModes.flatMap((proof) =>
    options.degrees.map((degree) => ({ proof, entry: expected.get(degree) })),
  );
  const receipt = {
    schema_version: 1,
    source: "live-sagejs",
    expected_source: "offline-independent-external-cas-corpus",
    captured_at: new Date().toISOString(),
    executable:
      options.executable ||
      (process.platform === "win32" ? process.execPath : path.join(root, "bin", "sagejs")),
    dry_run: options.dryRun,
    records: [],
  };
  for (const job of jobs) {
    const record = options.dryRun
      ? {
          degree: job.entry.degree,
          proof: job.proof,
          outcome: "not-run",
          ...policyForDegree(job.entry.degree, options.timeoutScale),
        }
      : runCase(options, job.entry, job.proof);
    receipt.records.push(record);
    console.log(
      `degree ${record.degree} proof=${record.proof}: ${record.outcome}` +
        (record.acceptance ? ` (${record.acceptance})` : ""),
    );
  }
  receipt.summary = Object.fromEntries(
    [...new Set(receipt.records.map((record) => record.outcome))].map((outcome) => [
      outcome,
      receipt.records.filter((record) => record.outcome === outcome).length,
    ]),
  );
  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(receipt, null, 2)}\n`);
  }
  if (
    !options.dryRun &&
    receipt.records.some(
      (record) =>
        record.outcome !== "live-supported-complete" || record.acceptance !== "pass",
    )
  ) {
    process.exitCode = 1;
  }
}

module.exports = {
  checkComplete,
  compareRationals,
  decimalRoundingCell,
  rationalFromText,
  regulatorOverlapsRoundedDecimal,
  regulatorWidthIsSmall,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}
