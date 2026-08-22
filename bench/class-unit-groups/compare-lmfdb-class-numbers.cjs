#!/usr/bin/env node
"use strict";

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const defaultFixture = path.join(
  root,
  "test/fixtures/number-field-lmfdb-cubic-class-numbers.json",
);

function parseArguments(argv) {
  const options = {
    fixture: defaultFixture,
    sage: process.env.SAGE_ORACLE || "/home/user/sagelite/sage",
    samples: 3,
    limit: null,
    proof: "both",
    timeoutSeconds: 900,
    output: null,
    requireSage: false,
    dryRun: false,
  };
  const values = new Set([
    "--fixture", "--sage", "--samples", "--limit", "--proof",
    "--timeout-seconds", "--output",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--require-sage") options.requireSage = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (values.has(argument)) {
      if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
      const value = argv[(index += 1)];
      const key = {
        "--fixture": "fixture",
        "--sage": "sage",
        "--samples": "samples",
        "--limit": "limit",
        "--proof": "proof",
        "--timeout-seconds": "timeoutSeconds",
        "--output": "output",
      }[argument];
      options[key] = value;
    } else if (argument === "--help") {
      console.log(`Usage: node ${path.relative(root, __filename)} [options]

  --samples N          fresh prepared fields per case and proof mode (default 3)
  --limit N            benchmark the first N pinned records
  --proof MODE         false, true, or both (default both)
  --sage PATH          Sage launcher (default /home/user/sagelite/sage)
  --require-sage       fail instead of recording an unavailable Sage process
  --timeout-seconds N  cap each persistent implementation process (default 900)
  --output PATH        write the full JSON receipt
  --dry-run            validate inputs and print the execution plan only`);
      process.exit(0);
    } else throw new Error(`unknown argument: ${argument}`);
  }
  for (const name of ["samples", "timeoutSeconds"]) {
    options[name] = Number(options[name]);
    if (!Number.isInteger(options[name]) || options[name] < 1) {
      throw new Error(`--${name === "timeoutSeconds" ? "timeout-seconds" : name} must be positive`);
    }
  }
  if (options.limit !== null) {
    options.limit = Number(options.limit);
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new Error("--limit must be positive");
    }
  }
  if (!new Set(["false", "true", "both"]).has(options.proof)) {
    throw new Error("--proof must be false, true, or both");
  }
  return options;
}

function modesFor(proof) {
  return proof === "both" ? [false, true] : [proof === "true"];
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values, fraction) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)];
}

function aggregateRatios(records) {
  const values = records.map((record) => record.ratio).filter(Number.isFinite);
  if (values.length === 0) return null;
  return {
    count: values.length,
    geometric_mean: Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length),
    median: median(values),
    p90: percentile(values, 0.90),
    p95: percentile(values, 0.95),
    worst: Math.max(...values),
  };
}

function pythonLiteral(value) {
  return JSON.stringify(value);
}

function pythonJson(value) {
  return JSON.stringify(JSON.stringify(value));
}

function benchmarkSource(records, samples, modes, implementation) {
  const sage = implementation === "sage";
  const imports = sage
    ? "from sage.all import QQ, PolynomialRing, NumberField\nimport json, sage.version, time"
    : "import json, time";
  const version = sage ? "sage.version.version" : "'Sage.js'";
  return `${imports}
records = json.loads(${pythonJson(records)})
samples = ${samples}
modes = json.loads(${pythonJson(modes)})

def median(values):
    values = sorted(values)
    middle = len(values) // 2
    if len(values) % 2:
        return values[middle]
    return (values[middle - 1] + values[middle]) / 2

answers = []
for case_index in range(len(records)):
    record = records[case_index]
    for proof in modes:
        timings = []
        last_diagnostics = None
        last_proof_status = None
        answer = None
        for sample in range(samples):
            ring = PolynomialRing(QQ, "x")
            x = ring.gen()
            polynomial = ring(0)
            coefficients = record["coefficients"]
            for exponent in range(len(coefficients)):
                polynomial += int(coefficients[exponent]) * x**exponent
            field = NumberField(polynomial, "a" + str(case_index) + "_" + str(sample))
            field.maximal_order()
            started = time.perf_counter_ns()
            answer = int(field.class_number(proof=proof))
            timings.append((time.perf_counter_ns() - started) / 1000000000)
            artifact = getattr(field, "_bounded_cubic_class_number_artifact", None)
            if artifact is not None:
                last_diagnostics = artifact.diagnostics
                last_proof_status = artifact.proof_status
            else:
                engine_cache = getattr(field, "_class_unit_engine_cache", None)
                if engine_cache:
                    computations = list(engine_cache.values())
                    if computations:
                        last_diagnostics = computations[-1].diagnostics
                        last_proof_status = computations[-1].proof_status
        answers.append({
            "label": record["label"],
            "proof": proof,
            "answer": answer,
            "samples_seconds": timings,
            "median_seconds": median(timings),
            "diagnostics": last_diagnostics,
            "proof_status": last_proof_status,
        })
print("CLASS_NUMBER_BENCHMARK|" + json.dumps({
    "implementation": ${pythonLiteral(implementation)},
    "version": ${version},
    "records": answers,
}, sort_keys=True, separators=(",", ":")))
`;
}

function runProcess(command, args, source, timeoutSeconds) {
  const started = process.hrtime.bigint();
  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    input: source,
    maxBuffer: 32 * 1024 * 1024,
    timeout: timeoutSeconds * 1000,
    killSignal: "SIGKILL",
  });
  const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (result.error || result.status !== 0) {
    throw new Error(
      `${command} failed: ${result.error?.message || `exit ${result.status}`}\n${result.stderr}\n${result.stdout}`,
    );
  }
  const line = result.stdout.split(/\r?\n/).findLast((item) =>
    item.startsWith("CLASS_NUMBER_BENCHMARK|")
  );
  if (!line) throw new Error(`${command} emitted no benchmark payload`);
  return {
    ...JSON.parse(line.slice("CLASS_NUMBER_BENCHMARK|".length)),
    process_total_seconds: processSeconds,
    warning_output: result.stderr.trim(),
  };
}

function gitRevision() {
  const commit = childProcess.spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: root, encoding: "utf8",
  });
  const tree = childProcess.spawnSync("git", ["rev-parse", "HEAD^{tree}"], {
    cwd: root, encoding: "utf8",
  });
  const status = childProcess.spawnSync("git", ["status", "--porcelain"], {
    cwd: root, encoding: "utf8",
  });
  if (commit.status !== 0 || tree.status !== 0 || status.status !== 0) return null;
  return {
    commit: commit.stdout.trim(),
    tree: tree.stdout.trim(),
    dirty: status.stdout.trim().length !== 0,
  };
}

function compare(sagejs, sage, expected) {
  const sageByKey = new Map((sage?.records || []).map((record) => [
    `${record.label}|${record.proof}`,
    record,
  ]));
  const expectedByLabel = new Map(expected.map((record) => [
    record.label,
    Number(record.class_number),
  ]));
  const comparisons = [];
  for (const record of sagejs.records) {
    const oracle = sageByKey.get(`${record.label}|${record.proof}`) || null;
    const expectedAnswer = expectedByLabel.get(record.label);
    if (record.answer !== expectedAnswer || (oracle && oracle.answer !== expectedAnswer)) {
      throw new Error(`${record.label} proof=${record.proof}: class-number mismatch`);
    }
    const phases = record.diagnostics?.phase_timings || {};
    const phaseEntries = Object.entries(phases).filter(([name, value]) =>
      name !== "total" && Number.isFinite(value)
    );
    phaseEntries.sort((left, right) => right[1] - left[1]);
    comparisons.push({
      label: record.label,
      proof: record.proof,
      class_number: expectedAnswer,
      sagejs_seconds: record.median_seconds,
      sage_pari_seconds: oracle?.median_seconds ?? null,
      ratio: oracle ? record.median_seconds / oracle.median_seconds : null,
      dominant_sagejs_phase: phaseEntries[0]?.[0] || null,
      dominant_sagejs_phase_seconds: phaseEntries[0]?.[1] || null,
      sagejs_proof_status: record.proof_status,
    });
  }
  return comparisons;
}

function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const fixture = JSON.parse(fs.readFileSync(path.resolve(options.fixture), "utf8"));
  if (fixture.schema !== "sagejs.number-fields/lmfdb-class-number-corpus-v1") {
    throw new Error("unsupported LMFDB class-number fixture");
  }
  const records = fixture.records.slice(0, options.limit || fixture.records.length);
  const modes = modesFor(options.proof);
  if (options.dryRun) {
    const receipt = {
      schema: "sagejs.number-fields/lmfdb-class-number-benchmark-plan-v1",
      records: records.map((record) => record.label),
      samples: options.samples,
      proof_modes: modes,
      sage: path.resolve(options.sage),
    };
    console.log(JSON.stringify(receipt, null, 2));
    return receipt;
  }
  const sagejs = runProcess(
    process.execPath,
    [path.join(root, "bin/sagejs-source.cjs"), "--python", "-"],
    benchmarkSource(records, options.samples, modes, "sagejs"),
    options.timeoutSeconds,
  );
  let sage = null;
  if (fs.existsSync(options.sage)) {
    sage = runProcess(
      path.resolve(options.sage),
      ["-python", "-"],
      benchmarkSource(records, options.samples, modes, "sage"),
      options.timeoutSeconds,
    );
  } else if (options.requireSage) {
    throw new Error(`Sage executable does not exist: ${options.sage}`);
  }
  const comparisons = compare(sagejs, sage, records);
  const receipt = {
    schema: "sagejs.number-fields/lmfdb-class-number-benchmark-v1",
    boundary: "fresh isomorphic field and prepared maximal order; persistent implementation process",
    source_revision: gitRevision(),
    fixture: path.relative(root, path.resolve(options.fixture)),
    samples: options.samples,
    proof_modes: modes,
    sagejs,
    sage_pari: sage,
    comparisons,
    aggregate_ratio: aggregateRatios(comparisons),
  };
  const encoded = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), encoded);
  process.stdout.write(encoded);
  return receipt;
}

if (require.main === module) main();

module.exports = {
  aggregateRatios,
  benchmarkSource,
  compare,
  main,
  median,
  modesFor,
  parseArguments,
  percentile,
};
