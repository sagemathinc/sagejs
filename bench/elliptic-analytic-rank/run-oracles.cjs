#!/usr/bin/env node
"use strict";

// Developer-only persistent-process harness. Sage/PARI and Magma are offline
// oracles and are never loaded by Sage.js at runtime or by ordinary CI.

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const here = __dirname;
const repositoryRoot = path.resolve(here, "../..");
const defaultManifest = path.join(
  repositoryRoot,
  "test/data/elliptic-analytic-rank/curves.json",
);
const defaultBaseline = path.join(
  repositoryRoot,
  "test/data/elliptic-analytic-rank/oracle-baseline.json",
);

function usage() {
  console.log(`Usage: node ${path.relative(repositoryRoot, __filename)} [options]

Options:
  --tier NAME                 corpus tier (default: core; use all for everything)
  --samples N                 warmed samples per curve (default: 1)
  --coefficient-cutoff N      Sage anlist probe cutoff (default: 64)
  --sage PATH                 Sage launcher (default: $SAGE_ORACLE or /home/user/sagelite/sage)
  --magma PATH                Magma launcher (default: $MAGMA_ORACLE or /home/user/bin/magma)
  --lcalc PATH                optional standalone lcalc executable (default: $LCALC_ORACLE or lcalc)
  --no-sage                   skip Sage/PARI explicitly
  --no-magma                  skip Magma explicitly
  --no-lcalc                  skip the lcalc capability probe explicitly
  --require-sage              fail instead of recording an unavailable Sage oracle
  --require-magma             fail instead of recording an unavailable Magma oracle
  --manifest PATH             alternate offline manifest
  --output PATH               write the full JSON receipt
  --check                     validate results against manifest and pinned baseline
  --baseline PATH             alternate baseline used by --check
  --help                      show this text

Each selected implementation is started once and evaluates every selected curve
inside that process. No network access is used.`);
}

function parseArguments(argv) {
  const options = {
    tier: "core",
    samples: 1,
    coefficientCutoff: 64,
    sage: process.env.SAGE_ORACLE || "/home/user/sagelite/sage",
    magma: process.env.MAGMA_ORACLE || "/home/user/bin/magma",
    lcalc: process.env.LCALC_ORACLE || "lcalc",
    runSage: true,
    runMagma: true,
    runLcalc: true,
    requireSage: false,
    requireMagma: false,
    manifest: defaultManifest,
    baseline: defaultBaseline,
    output: null,
    check: false,
  };
  const takesValue = new Set([
    "--tier",
    "--samples",
    "--coefficient-cutoff",
    "--sage",
    "--magma",
    "--lcalc",
    "--manifest",
    "--baseline",
    "--output",
  ]);
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") {
      usage();
      process.exit(0);
    }
    if (argument === "--no-sage") options.runSage = false;
    else if (argument === "--no-magma") options.runMagma = false;
    else if (argument === "--no-lcalc") options.runLcalc = false;
    else if (argument === "--require-sage") options.requireSage = true;
    else if (argument === "--require-magma") options.requireMagma = true;
    else if (argument === "--check") options.check = true;
    else if (takesValue.has(argument)) {
      if (index + 1 >= argv.length) throw new Error(`${argument} needs a value`);
      const value = argv[(index += 1)];
      const key = {
        "--tier": "tier",
        "--samples": "samples",
        "--coefficient-cutoff": "coefficientCutoff",
        "--sage": "sage",
        "--magma": "magma",
        "--lcalc": "lcalc",
        "--manifest": "manifest",
        "--baseline": "baseline",
        "--output": "output",
      }[argument];
      options[key] = value;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }
  options.samples = Number(options.samples);
  options.coefficientCutoff = Number(options.coefficientCutoff);
  if (!Number.isInteger(options.samples) || options.samples < 1) {
    throw new Error("--samples must be a positive integer");
  }
  if (!Number.isInteger(options.coefficientCutoff) || options.coefficientCutoff < 1) {
    throw new Error("--coefficient-cutoff must be a positive integer");
  }
  return options;
}

function selectedCurves(manifest, tier) {
  if (tier === "all") return manifest.curves;
  return manifest.curves.filter((curve) => curve.tiers.includes(tier));
}

function validateManifest(manifest) {
  if (manifest.schema_version !== 1 || !Array.isArray(manifest.curves)) {
    throw new Error("unsupported analytic-rank manifest schema");
  }
  const ids = new Set();
  for (const curve of manifest.curves) {
    if (ids.has(curve.id)) throw new Error(`duplicate curve id: ${curve.id}`);
    ids.add(curve.id);
    if (
      !Array.isArray(curve.a_invariants) ||
      curve.a_invariants.length !== 5 ||
      curve.a_invariants.some((value) => !/^-?\d+$/.test(value))
    ) {
      throw new Error(`${curve.id}: a-invariants must be five decimal strings`);
    }
    if (!/^\d+$/.test(curve.conductor)) {
      throw new Error(`${curve.id}: conductor must be a decimal string`);
    }
    if (![1, -1].includes(curve.root_number)) {
      throw new Error(`${curve.id}: root_number must be +1 or -1`);
    }
    const rank = curve.expected_probable_analytic_rank;
    if (!Number.isInteger(rank) || rank < 0) {
      throw new Error(`${curve.id}: expected rank must be nonnegative`);
    }
    if (curve.root_number !== (rank % 2 === 0 ? 1 : -1)) {
      throw new Error(`${curve.id}: rank parity contradicts the root number`);
    }
    const leadingDerivative = Number(curve.expected_leading_derivative);
    if (!Number.isFinite(leadingDerivative) || !(leadingDerivative > 0)) {
      throw new Error(`${curve.id}: leading derivative must be positive and finite`);
    }
    if (!Array.isArray(curve.tiers) || curve.tiers.length === 0) {
      throw new Error(`${curve.id}: at least one corpus tier is required`);
    }
    for (const zeroSum of curve.zero_sum_upper_bounds || []) {
      if (
        !(zeroSum.delta > 0) ||
        !Number.isInteger(zeroSum.bound) ||
        zeroSum.bound < rank ||
        zeroSum.bound % 2 !== rank % 2
      ) {
        throw new Error(`${curve.id}: invalid GRH-conditional zero-sum fixture`);
      }
    }
  }
  const coreRanks = new Set(
    manifest.curves
      .filter((curve) => curve.tiers.includes("core"))
      .map((curve) => curve.expected_probable_analytic_rank),
  );
  for (let rank = 0; rank <= 4; rank += 1) {
    if (!coreRanks.has(rank)) throw new Error(`core corpus lacks rank ${rank}`);
  }
  if (!ids.has("256944c1")) throw new Error("corpus lacks 256944c1 regression");
}

function unavailable(family, executable, reason) {
  return {
    implementation_family: family,
    status: "unavailable",
    executable,
    reason,
    records: [],
  };
}

function resolveExecutable(command) {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return fs.existsSync(command) ? path.resolve(command) : null;
  }
  for (const directory of (process.env.PATH || "").split(path.delimiter)) {
    const candidate = path.join(directory, command);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function probeLcalc(options) {
  if (!options.runLcalc) return unavailable("lcalc", options.lcalc, "disabled");
  const executable = resolveExecutable(options.lcalc);
  if (!executable) {
    return unavailable(
      "lcalc",
      options.lcalc,
      "standalone executable not found; the installed Sage wrapper also delegates to this CLI",
    );
  }
  const probe = childProcess.spawnSync(executable, ["--version"], {
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    implementation_family: "lcalc",
    status: "skipped",
    executable,
    reason:
      "executable found, but no result is accepted until the adapter records and validates coefficient sufficiency",
    probe: {
      exit_code: probe.status,
      output: `${probe.stdout || ""}${probe.stderr || ""}`.trim(),
    },
    records: [],
  };
}

function runSage(options) {
  if (!options.runSage) return unavailable("Sage/PARI", options.sage, "disabled");
  if (!fs.existsSync(options.sage)) {
    return unavailable("Sage/PARI", options.sage, "executable does not exist");
  }
  const args = [
    "-python",
    path.join(here, "sage_oracle.py"),
    "--manifest",
    path.resolve(options.manifest),
    "--tier",
    options.tier,
    "--samples",
    String(options.samples),
    "--coefficient-cutoff",
    String(options.coefficientCutoff),
  ];
  const started = process.hrtime.bigint();
  const run = childProcess.spawnSync(options.sage, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (run.error || run.status !== 0) {
    throw new Error(
      `Sage oracle failed: ${run.error?.message || `exit ${run.status}`}\n${run.stderr}`,
    );
  }
  const lines = run.stdout.trim().split(/\r?\n/);
  const result = JSON.parse(lines.at(-1));
  result.status = "ok";
  result.executable = path.resolve(options.sage);
  result.process_total_seconds = processSeconds;
  result.startup_and_shutdown_overhead_seconds = Math.max(
    0,
    processSeconds - result.internal_total_seconds,
  );
  result.warning_output = run.stderr.trim();
  return result;
}

function magmaProgram(curves, samples, precision) {
  const lines = [
    "SetSeed(1);",
    "SetColumns(1024);",
    "Q := Rationals();",
    "major, minor, patch := GetVersion();",
    'printf "SAGEJS_ELLRANK_META|%o.%o.%o\\n", major, minor, patch;',
    "function MedianValue(values)",
    "  Sort(~values);",
    "  n := #values;",
    "  if IsOdd(n) then return values[(n + 1) div 2]; end if;",
    "  return (values[n div 2] + values[n div 2 + 1]) / 2;",
    "end function;",
  ];
  for (const curve of curves) {
    const ainvs = curve.a_invariants.join(",");
    lines.push(
      `a := [Q | ${ainvs}];`,
      "construction_times := []; analytic_times := []; repeat_times := [];",
      `for sample := 1 to ${samples} do`,
      "  started := Cputime(); E := EllipticCurve(a); Append(~construction_times, Cputime(started));",
      `  started := Cputime(); rank, raw := AnalyticRank(E : Precision := ${precision}); Append(~analytic_times, Cputime(started));`,
      `  started := Cputime(); repeated_rank, repeated_raw := AnalyticRank(E : Precision := ${precision}); Append(~repeat_times, Cputime(started));`,
      '  assert rank eq repeated_rank and Abs(raw - repeated_raw) lt 10^(-12);',
      "end for;",
      "normalized := raw * Factorial(rank);",
      `printf "SAGEJS_ELLRANK_RECORD|${curve.id}|%o|%o|%o|%.17o|%.17o|%.9o|%.9o|%.9o\\n", Conductor(E), RootNumber(E), rank, raw, normalized, MedianValue(construction_times), MedianValue(analytic_times), MedianValue(repeat_times);`,
    );
  }
  lines.push("quit;");
  return `${lines.join("\n")}\n`;
}

function runMagma(options, curves) {
  if (!options.runMagma) return unavailable("Magma", options.magma, "disabled");
  if (!fs.existsSync(options.magma)) {
    return unavailable("Magma", options.magma, "executable does not exist");
  }
  const precision = 15;
  const started = process.hrtime.bigint();
  const run = childProcess.spawnSync(options.magma, ["-b"], {
    cwd: repositoryRoot,
    input: magmaProgram(curves, options.samples, precision),
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
  });
  const processSeconds = Number(process.hrtime.bigint() - started) / 1e9;
  if (run.error || run.status !== 0) {
    throw new Error(
      `Magma oracle failed: ${run.error?.message || `exit ${run.status}`}\n${run.stdout}\n${run.stderr}`,
    );
  }
  let version = "unknown";
  const records = [];
  for (const line of run.stdout.split(/\r?\n/)) {
    if (line.startsWith("SAGEJS_ELLRANK_META|")) {
      version = line.split("|")[1];
    } else if (line.startsWith("SAGEJS_ELLRANK_RECORD|")) {
      const fields = line.split("|");
      records.push({
        id: fields[1],
        status: "ok",
        conductor: fields[2],
        root_number: Number(fields[3]),
        probable_analytic_rank: Number(fields[4]),
        raw_taylor_coefficient: fields[5],
        leading_derivative: fields[6],
        raw_value_convention: "L^(r)(1)/r!",
        leading_value_convention: "L^(r)(1)",
        timing: {
          samples: options.samples,
          curve_construction_median_cpu_seconds: Number(fields[7]),
          fresh_object_analytic_rank_median_cpu_seconds: Number(fields[8]),
          same_object_repeat_median_cpu_seconds: Number(fields[9]),
        },
      });
    }
  }
  if (records.length !== curves.length) {
    throw new Error(
      `Magma emitted ${records.length} records for ${curves.length} curves\n${run.stdout}`,
    );
  }
  return {
    implementation_family: "Magma",
    status: "ok",
    versions: { magma: version },
    settings: {
      intrinsic: "AnalyticRank",
      decimal_precision: precision,
      samples: options.samples,
      tier: options.tier,
    },
    executable: path.resolve(options.magma),
    records,
    process_total_seconds: processSeconds,
    warning_output: run.stderr.trim(),
  };
}

function relativeDifference(actual, expected) {
  return Math.abs(actual - expected) / Math.max(1, Math.abs(expected));
}

function validateFamily(family, curves, failures) {
  if (family.status !== "ok") return;
  const byId = new Map(family.records.map((record) => [record.id, record]));
  for (const curve of curves) {
    const record = byId.get(curve.id);
    if (!record) {
      failures.push(`${family.implementation_family}: missing ${curve.id}`);
      continue;
    }
    if (record.conductor !== curve.conductor) {
      failures.push(`${family.implementation_family}/${curve.id}: conductor mismatch`);
    }
    if (record.root_number !== curve.root_number) {
      failures.push(`${family.implementation_family}/${curve.id}: root number mismatch`);
    }
    if (record.probable_analytic_rank !== curve.expected_probable_analytic_rank) {
      failures.push(`${family.implementation_family}/${curve.id}: probable rank mismatch`);
    }
    if (
      relativeDifference(
        Number(record.leading_derivative),
        Number(curve.expected_leading_derivative),
      ) > 5e-13
    ) {
      failures.push(`${family.implementation_family}/${curve.id}: derivative mismatch`);
    }
    for (const expected of curve.zero_sum_upper_bounds || []) {
      if (family.implementation_family !== "Sage/PARI") continue;
      const actual = record.zero_sum_upper_bounds.find(
        (entry) => entry.delta === expected.delta,
      );
      if (!actual || actual.bound !== expected.bound) {
        failures.push(
          `${family.implementation_family}/${curve.id}: Delta=${expected.delta} zero-sum mismatch`,
        );
      }
    }
  }
}

function stableRecord(record) {
  return {
    id: record.id,
    conductor: record.conductor,
    root_number: record.root_number,
    probable_analytic_rank: record.probable_analytic_rank,
    leading_derivative: record.leading_derivative,
    raw_taylor_coefficient: record.raw_taylor_coefficient,
    leading_value_convention: record.leading_value_convention,
    coefficient_probe: record.coefficient_probe
      ? {
          cutoff: record.coefficient_probe.cutoff,
          length: record.coefficient_probe.length,
          sha256: record.coefficient_probe.sha256,
        }
      : undefined,
    zero_sum_upper_bounds: record.zero_sum_upper_bounds?.length
      ? record.zero_sum_upper_bounds.map(({ delta, bound }) => ({ delta, bound }))
      : undefined,
  };
}

function compareBaseline(current, baseline, failures) {
  if (current.manifest_sha256 !== baseline.manifest_sha256) {
    failures.push("manifest digest differs from pinned baseline");
  }
  for (const family of current.oracles) {
    if (family.status !== "ok") continue;
    const pinned = baseline.oracles.find(
      (candidate) => candidate.implementation_family === family.implementation_family,
    );
    if (!pinned) {
      failures.push(`baseline lacks ${family.implementation_family}`);
      continue;
    }
    if (
      Object.keys(pinned.versions).some(
        (key) => family.versions?.[key] !== pinned.versions[key],
      )
    ) {
      failures.push(`${family.implementation_family}: oracle version differs from baseline`);
    }
    const pinnedById = new Map(pinned.records.map((record) => [record.id, record]));
    for (const record of family.records) {
      const expected = pinnedById.get(record.id);
      if (!expected) {
        failures.push(`baseline lacks ${family.implementation_family}/${record.id}`);
        continue;
      }
      const actualStable = stableRecord(record);
      const expectedStable = stableRecord(expected);
      if (JSON.stringify(actualStable) !== JSON.stringify(expectedStable)) {
        failures.push(`baseline changed for ${family.implementation_family}/${record.id}`);
      }
    }
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const manifestBytes = fs.readFileSync(path.resolve(options.manifest));
  const manifest = JSON.parse(manifestBytes);
  validateManifest(manifest);
  const curves = selectedCurves(manifest, options.tier);
  if (curves.length === 0) throw new Error(`manifest has no tier ${options.tier}`);

  const sage = runSage(options);
  const magma = runMagma(options, curves);
  const lcalc = probeLcalc(options);
  if (options.requireSage && sage.status !== "ok") throw new Error(sage.reason);
  if (options.requireMagma && magma.status !== "ok") throw new Error(magma.reason);

  const receipt = {
    schema_version: 1,
    description: "Offline analytic-rank oracle and timing receipt",
    semantic_warning:
      "Ranks are probable numerical results, not proofs of exact vanishing.",
    manifest_sha256: crypto.createHash("sha256").update(manifestBytes).digest("hex"),
    selected_tier: options.tier,
    selected_curve_ids: curves.map((curve) => curve.id),
    environment: {
      hostname: os.hostname(),
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      cpu: os.cpus()[0]?.model || "unknown",
    },
    timing_note:
      "Medians exclude process startup. process_total_seconds includes startup, all work, and shutdown. Magma uses CPU time internally; Sage uses monotonic wall time.",
    oracles: [sage, magma, lcalc],
  };

  const failures = [];
  validateFamily(sage, curves, failures);
  validateFamily(magma, curves, failures);
  if (options.check) {
    const baseline = JSON.parse(fs.readFileSync(path.resolve(options.baseline), "utf8"));
    compareBaseline(receipt, baseline, failures);
  }
  receipt.validation = { status: failures.length ? "failed" : "passed", failures };

  const encoded = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.output) fs.writeFileSync(path.resolve(options.output), encoded);
  process.stdout.write(encoded);
  if (failures.length) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error.stack || error.message);
  process.exitCode = 1;
}
