#!/usr/bin/env node
"use strict";

// Developer-only, network-free cross-CAS oracle harness. None of these
// executables is a Sage.js runtime dependency.

const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const here = __dirname;
const root = path.resolve(here, "../..");
const defaultFixture = path.join(
  root,
  "test/fixtures/number-field-class-unit-high-degree-oracles.json",
);

function usage() {
  console.log(`Usage: node ${path.relative(root, __filename)} [options]

Options:
  --check             compare every available oracle with the committed corpus
  --output PATH       write normalized records and process timings
  --fixture PATH      alternate expected JSON
  --sage PATH         Sage launcher (default: /home/user/sagelite/sage)
  --magma PATH        Magma launcher (default: /home/user/bin/magma)
  --julia PATH        Julia launcher (default: /home/user/upstream/julia-1.10.10/bin/julia)
  --hecke PATH        Hecke project (default: /home/user/upstream/Hecke.jl)
  --julia-depot PATH  task-scoped Julia depot
  --no-sage|--no-magma|--no-hecke
  --require-sage|--require-magma|--require-hecke
  --help`);
}

function parseArguments(argv) {
  const options = {
    check: false,
    output: null,
    fixture: defaultFixture,
    sage: process.env.SAGE_ORACLE || "/home/user/sagelite/sage",
    magma: process.env.MAGMA_ORACLE || "/home/user/bin/magma",
    julia: process.env.JULIA_ORACLE || "/home/user/upstream/julia-1.10.10/bin/julia",
    hecke: process.env.HECKE_ORACLE_PROJECT || "/home/user/upstream/Hecke.jl",
    juliaDepot:
      process.env.JULIA_DEPOT_PATH || "/home/user/upstream/julia-class-unit-depot",
    run: { sage_pari: true, magma: true, hecke: true },
    require: { sage_pari: false, magma: false, hecke: false },
  };
  const values = new Map([
    ["--output", "output"],
    ["--fixture", "fixture"],
    ["--sage", "sage"],
    ["--magma", "magma"],
    ["--julia", "julia"],
    ["--hecke", "hecke"],
    ["--julia-depot", "juliaDepot"],
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    } else if (argument === "--check") options.check = true;
    else if (/^--no-(sage|magma|hecke)$/.test(argument)) {
      const family = argument.slice(5) === "sage" ? "sage_pari" : argument.slice(5);
      options.run[family] = false;
    } else if (/^--require-(sage|magma|hecke)$/.test(argument)) {
      const family = argument.slice(10) === "sage" ? "sage_pari" : argument.slice(10);
      options.require[family] = true;
    } else if (values.has(argument)) {
      if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
      options[values.get(argument)] = argv[(index += 1)];
    } else throw new Error(`unknown argument: ${argument}`);
  }
  return options;
}

function runExternal(executable, args, spawnOptions, timeoutMilliseconds = 900_000) {
  if (process.platform !== "win32" && fs.existsSync("/usr/bin/timeout")) {
    const seconds = Math.ceil(timeoutMilliseconds / 1000);
    const run = childProcess.spawnSync(
      "/usr/bin/timeout",
      ["--signal=TERM", "--kill-after=5s", `${seconds}s`, executable, ...args],
      { ...spawnOptions, timeout: timeoutMilliseconds + 10_000, killSignal: "SIGKILL" },
    );
    if ([124, 137].includes(run.status)) {
      run.error = new Error(`oracle timed out after ${seconds}s`);
    }
    return run;
  }
  return childProcess.spawnSync(executable, args, {
    ...spawnOptions,
    timeout: timeoutMilliseconds,
    killSignal: "SIGKILL",
  });
}

function parseFactors(text) {
  if (!text) return [];
  return text.split(";").map((factor) => factor.split(",").map(Number));
}

function parseOutput(family, output) {
  const records = new Map();
  let versions = [];
  for (const line of output.trim().split(/\r?\n/)) {
    if (!/^(META|FIELD|MODE|PRIME)\|/.test(line)) continue;
    const parts = line.split("|");
    if (parts[0] === "META") {
      versions = parts.slice(1);
      continue;
    }
    const degree = Number(parts[1]);
    if (!records.has(degree)) records.set(degree, { degree, proof_modes: {}, prime_splitting: [] });
    const record = records.get(degree);
    if (parts[0] === "FIELD") {
      record.signature = [Number(parts[2]), Number(parts[3])];
      record.equation_discriminant = parts[4];
      record.field_discriminant = parts[5];
      record.equation_order_index = parts[6];
      record.minkowski_integer_bound = parts[7];
    } else if (parts[0] === "MODE") {
      record.proof_modes[parts[2]] = {
        class_group: {
          invariant_factors: parts[3] ? parts[3].split(",") : [],
          order: parts[4],
        },
        unit_group: {
          invariant_factors: parts[5] ? parts[5].split(",") : [],
          rank: Number(parts[6]),
          torsion_order: parts[7],
        },
        regulator_decimal: parts[8],
        elapsed_seconds: Number(parts[9]),
      };
    } else {
      record.prime_splitting.push({
        rational_prime: Number(parts[2]),
        factors: parseFactors(parts[3]),
      });
    }
  }
  const normalized = [...records.values()].sort((left, right) => left.degree - right.degree);
  if (normalized.length !== 5) throw new Error(`${family}: expected five records`);
  return { versions, records: normalized };
}

function unavailable(executable, reason) {
  return { status: "unavailable", executable, reason, versions: [], records: [] };
}

function runFamily(family, executable, args, options = {}) {
  if (!options.enabled) return unavailable(executable, "disabled");
  if (!fs.existsSync(executable)) return unavailable(executable, "executable does not exist");
  const started = process.hrtime.bigint();
  const run = runExternal(executable, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, ...(options.env || {}) },
    maxBuffer: 64 * 1024 * 1024,
  });
  const elapsed = Number(process.hrtime.bigint() - started) / 1e9;
  if (run.error || run.status !== 0) {
    throw new Error(
      `${family} failed: ${run.error?.message || `exit ${run.status}`}\n${run.stderr || ""}`,
    );
  }
  return {
    status: "ok",
    executable: path.resolve(executable),
    process_total_seconds: elapsed,
    warning_output: (run.stderr || "").trim(),
    ...parseOutput(family, run.stdout),
  };
}

function stableProjection(record) {
  const conditional = record.proof_modes.conditional_grh;
  const unconditional = record.proof_modes.unconditional;
  return {
    degree: record.degree,
    signature: record.signature,
    equation_discriminant: record.equation_discriminant,
    field_discriminant: record.field_discriminant,
    equation_order_index: record.equation_order_index,
    minkowski_integer_bound: record.minkowski_integer_bound,
    class_group: conditional.class_group,
    unit_group: conditional.unit_group,
    unconditional_class_group: unconditional.class_group,
    unconditional_unit_group: unconditional.unit_group,
    prime_splitting: record.prime_splitting,
  };
}

function expectedProjection(entry) {
  return {
    degree: entry.degree,
    signature: entry.signature,
    equation_discriminant: entry.equation_discriminant,
    field_discriminant: entry.field_discriminant,
    equation_order_index: entry.equation_order_index,
    minkowski_integer_bound: entry.minkowski_integer_bound,
    class_group: entry.class_group,
    unit_group: entry.unit_group,
    unconditional_class_group: entry.class_group,
    unconditional_unit_group: entry.unit_group,
    prime_splitting: entry.prime_splitting,
  };
}

function checkResult(family, result, fixture) {
  if (result.status !== "ok") return;
  for (let index = 0; index < fixture.cases.length; index += 1) {
    const expected = fixture.cases[index];
    const actual = result.records[index];
    const left = JSON.stringify(stableProjection(actual));
    const right = JSON.stringify(expectedProjection(expected));
    if (left !== right) throw new Error(`${family}: stable mismatch at degree ${expected.degree}`);
    for (const mode of ["conditional_grh", "unconditional"]) {
      const observed = Number(actual.proof_modes[mode].regulator_decimal);
      const target = Number(expected.regulator_decimal);
      if (!Number.isFinite(observed) || Math.abs(observed - target) > 1e-12 * target) {
        throw new Error(`${family}: regulator mismatch at degree ${expected.degree} (${mode})`);
      }
    }
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const fixture = JSON.parse(fs.readFileSync(path.resolve(options.fixture), "utf8"));
  if (fixture.schema_version !== 1 || fixture.cases.length !== 5) {
    throw new Error("unsupported high-degree oracle fixture");
  }
  const results = {
    schema_version: 1,
    captured_at: new Date().toISOString(),
    fixture: path.resolve(options.fixture),
    oracles: {},
  };
  results.oracles.sage_pari = runFamily(
    "sage_pari",
    options.sage,
    ["-python", path.join(here, "high_degree_sage_oracle.py")],
    { enabled: options.run.sage_pari },
  );
  results.oracles.magma = runFamily(
    "magma",
    options.magma,
    [path.join(here, "high_degree_magma.m")],
    { enabled: options.run.magma },
  );
  results.oracles.hecke = runFamily(
    "hecke",
    options.julia,
    [`--project=${path.resolve(options.hecke)}`, path.join(here, "high_degree_hecke_oracle.jl")],
    { enabled: options.run.hecke, env: { JULIA_DEPOT_PATH: path.resolve(options.juliaDepot) } },
  );
  for (const [family, required] of Object.entries(options.require)) {
    if (required && results.oracles[family].status !== "ok") {
      throw new Error(`${family} is required but unavailable: ${results.oracles[family].reason}`);
    }
  }
  if (options.check) {
    for (const [family, result] of Object.entries(results.oracles)) {
      checkResult(family, result, fixture);
    }
  }
  if (options.output) {
    fs.writeFileSync(path.resolve(options.output), `${JSON.stringify(results, null, 2)}\n`);
  }
  for (const [family, result] of Object.entries(results.oracles)) {
    console.log(`${family}: ${result.status}${result.process_total_seconds ? ` (${result.process_total_seconds.toFixed(3)}s)` : ""}`);
  }
  if (options.check) console.log("stable degree 6-10 corpus: pass");
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
