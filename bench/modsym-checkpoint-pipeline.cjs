#!/usr/bin/env node
"use strict";

/**
 * Durable, fresh-process weight-2 newform pipeline.
 *
 * Every stage starts a new interpreter and loads the previous stage from
 * disk.  This measures the workflow researchers actually need and makes a
 * long level sweep resumable after preemption.
 */

const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const sagejs = path.join(root, "bin", "sagejs");
const defaultSage = fs.existsSync("/home/user/bin/sagelite")
  ? "/home/user/bin/sagelite"
  : "/opt/cocalc-webdev-python/bin/sage";
const commands = {
  sagejs,
  sage: process.env.SAGELITE_SAGE || defaultSage,
  magma: process.env.MAGMA || "/home/user/bin/magma",
};
const levels = (process.env.SAGEJS_MODSYM_LEVELS || "1000")
  .split(",")
  .map((value) => Number(value.trim()))
  .filter((value) => Number.isSafeInteger(value) && value > 0);
const runtimes = (process.env.SAGEJS_MODSYM_RUNTIMES || "sagejs,sage")
  .split(",")
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);
const checkpointRoot = path.resolve(
  process.env.SAGEJS_MODSYM_CHECKPOINT_DIR ||
  path.join(root, "build", "modsym-checkpoints"),
);
const resume = process.argv.includes("--resume") ||
  process.env.SAGEJS_MODSYM_RESUME === "1";
const clean = process.argv.includes("--clean");

if (levels.length === 0) throw new Error("no positive levels were selected");
for (const runtime of runtimes) {
  if (!(runtime in commands)) {
    throw new Error(`unknown runtime ${runtime}; use sagejs, sage, or magma`);
  }
}

function quoted(value) {
  return JSON.stringify(value);
}

function checkpoint(runtime, level, stage) {
  const directory = path.join(checkpointRoot, runtime, `level-${level}`);
  fs.mkdirSync(directory, { recursive: true });
  const basename = path.join(directory, stage);
  return {
    basename,
    filename: `${basename}.sobj`,
  };
}

function sageProgram(level, stage, input, output, restored) {
  const lines = ["from time import time"];
  const heckePrime = level % 2 === 0 ? 3 : 2;
  if (restored) {
    lines.push("start = time()", `value = load(${quoted(output.filename)})`);
    lines.push("load_elapsed = time() - start");
    if (stage === "ambient") lines.push("fingerprint = str(value.dimension())");
    if (stage === "new") lines.push("fingerprint = str(value.dimension())");
    if (stage === "decompose") {
      lines.push("parts = [A.dimension() for A in value]", "parts.sort()");
      lines.push("fingerprint = ','.join(str(part) for part in parts)");
    }
    if (stage === "hecke") {
      lines.push("fingerprint = str(sum(T.trace() for A, T in value))");
    }
    lines.push(
      `print('RESULT ${stage}', load_elapsed, 0, 0, fingerprint, 'resumed')`,
    );
    return `${lines.join("\n")}\n`;
  }

  let expression;
  if (stage === "ambient") {
    lines.push("load_elapsed = 0");
    expression = `ModularSymbols(${level}, 2, sign=1)`;
  } else {
    lines.push("start = time()", `source = load(${quoted(input.filename)})`);
    lines.push("load_elapsed = time() - start");
    if (stage === "new") expression = "source.new_submodule()";
    if (stage === "decompose") expression = "source.decomposition()";
    if (stage === "hecke") {
      expression = `[(A, A.hecke_matrix(${heckePrime})) for A in source]`;
    }
  }
  lines.push("start = time()", `value = ${expression}`);
  lines.push("operation_elapsed = time() - start");
  if (stage === "ambient" || stage === "new") {
    lines.push("fingerprint = str(value.dimension())");
  } else if (stage === "decompose") {
    lines.push("parts = [A.dimension() for A in value]", "parts.sort()");
    lines.push("fingerprint = ','.join(str(part) for part in parts)");
  } else {
    lines.push("fingerprint = str(sum(T.trace() for A, T in value))");
  }
  lines.push("start = time()", `save(value, ${quoted(output.basename)})`);
  lines.push("save_elapsed = time() - start");
  lines.push(
    `print('RESULT ${stage}', load_elapsed, operation_elapsed, save_elapsed, fingerprint, 'computed')`,
  );
  return `${lines.join("\n")}\n`;
}

function runProgram(runtime, source, label) {
  const directory = fs.mkdtempSync(path.join(checkpointRoot, ".program-"));
  const filename = path.join(directory, "stage.sage");
  fs.writeFileSync(filename, source);
  const result = childProcess.spawnSync(commands[runtime], [filename], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 64 * 1024 * 1024,
  });
  fs.rmSync(directory, { recursive: true, force: true });
  if (result.error?.code === "ENOENT") {
    return { unavailable: `${commands[runtime]} is not installed` };
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout || "");
    process.stderr.write(result.stderr || "");
    const termination = result.signal === null
      ? `status ${result.status}`
      : `signal ${result.signal}`;
    throw new Error(`${label} exited with ${termination}`);
  }
  const match = result.stdout.match(
    /RESULT\s+(\S+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+(\S*)\s+(computed|resumed)/,
  );
  if (!match) throw new Error(`${label} produced no RESULT line:\n${result.stdout}`);
  return {
    stage: match[1],
    loadSeconds: Number(match[2]),
    operationSeconds: Number(match[3]),
    saveSeconds: Number(match[4]),
    fingerprint: match[5],
    status: match[6],
  };
}

function fileMetadata(filename) {
  const contents = fs.readFileSync(filename);
  return {
    bytes: contents.byteLength,
    sha256: crypto.createHash("sha256").update(contents).digest("hex"),
  };
}

function runMagmaComparison(level) {
  const heckePrime = level % 2 === 0 ? 3 : 2;
  const source = [
    "SetSeed(1);",
    "t := Cputime();",
    `M := ModularSymbols(${level}, 2, 1);`,
    "elapsed := Cputime(t);",
    'printf "RESULT ambient 0 %.9o 0 %o computed\\n", elapsed, Dimension(M);',
    "t := Cputime();",
    "C := CuspidalSubspace(M); Nspace := NewSubspace(C);",
    "elapsed := Cputime(t);",
    'printf "RESULT new 0 %.9o 0 %o computed\\n", elapsed, Dimension(Nspace);',
    "t := Cputime(); D := Decomposition(Nspace, 20); elapsed := Cputime(t);",
    "parts := [Dimension(A) : A in D]; Sort(~parts);",
    'fingerprint := Join([IntegerToString(part) : part in parts], ",");',
    'printf "RESULT decompose 0 %.9o 0 %o computed\\n", elapsed, fingerprint;',
    `t := Cputime(); T := HeckeOperator(Nspace, ${heckePrime}); elapsed := Cputime(t);`,
    "fingerprint := Sprint(Trace(T));",
    'printf "RESULT hecke 0 %.9o 0 %o computed\\n", elapsed, fingerprint;',
    "quit;",
    "",
  ].join("\n");
  const result = childProcess.spawnSync(commands.magma, [], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    input: source,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error?.code === "ENOENT") {
    return { unavailable: `${commands.magma} is not installed` };
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    return { unavailable: `Magma exited with status ${result.status}` };
  }
  const records = [];
  for (const match of result.stdout.matchAll(
    /RESULT\s+(\S+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+([0-9.eE+-]+)\s+(\S*)\s+(computed|resumed)/g,
  )) {
    const record = {
      runtime: "magma",
      level,
      stage: match[1],
      loadSeconds: Number(match[2]),
      operationSeconds: Number(match[3]),
      saveSeconds: Number(match[4]),
      fingerprint: match[5],
      status: "compute-only",
      checkpoint: null,
      bytes: null,
      sha256: null,
    };
    records.push(record);
    console.log(
      `${"magma".padEnd(7)} ${String(level).padStart(6)} ${record.stage.padEnd(10)}` +
      ` load ${"-".padStart(8)}   work ${(1000 * record.operationSeconds).toFixed(1).padStart(9)} ms` +
      ` save ${"-".padStart(8)}   ${"-".padStart(8)} KiB compute-only`,
    );
  }
  if (records.length !== 4) {
    return { unavailable: "Magma did not produce all four pipeline results" };
  }
  return { records };
}

function runPipeline(runtime, level) {
  // Magma has a useful operation-level comparison, but its process-wide
  // workspace images are not portable mathematical object files (and older
  // releases can fail to reload package state).  Keep that lane compute-only.
  if (runtime === "magma") return runMagmaComparison(level);
  const stages = ["ambient", "new", "decompose", "hecke"];
  const records = [];
  let input;
  let upstreamChanged = false;
  for (const stage of stages) {
    const output = checkpoint(runtime, level, stage);
    const restored = resume && !upstreamChanged && fs.existsSync(output.filename);
    const source = sageProgram(level, stage, input, output, restored);
    let result;
    try {
      result = runProgram(runtime, source, `${runtime} level ${level} ${stage}`);
    } catch (error) {
      if (error instanceof Error) error.records = records;
      throw error;
    }
    if (result.unavailable) return result;
    const metadata = fileMetadata(output.filename);
    const record = { runtime, level, ...result, checkpoint: output.filename, ...metadata };
    records.push(record);
    if (result.status === "computed") upstreamChanged = true;
    input = output;
    console.log(
      `${runtime.padEnd(7)} ${String(level).padStart(6)} ${stage.padEnd(10)}` +
      ` load ${(1000 * result.loadSeconds).toFixed(1).padStart(8)} ms` +
      ` work ${(1000 * result.operationSeconds).toFixed(1).padStart(9)} ms` +
      ` save ${(1000 * result.saveSeconds).toFixed(1).padStart(8)} ms` +
      ` ${(metadata.bytes / 1024).toFixed(1).padStart(8)} KiB ${result.status}`,
    );
  }
  return { records };
}

if (clean && fs.existsSync(checkpointRoot)) {
  fs.rmSync(checkpointRoot, { recursive: true, force: true });
}
fs.mkdirSync(checkpointRoot, { recursive: true });
const manifest = {
  schema: "https://sagejs.org/benchmarks/modsym-checkpoints/v1",
  createdAt: new Date().toISOString(),
  levels,
  runtimes,
  records: [],
  unavailable: [],
  comparisons: [],
  failures: [],
};

for (const level of levels) {
  for (const runtime of runtimes) {
    let answer;
    try {
      answer = runPipeline(runtime, level);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`${runtime.padEnd(7)} level ${level} failed: ${message}`);
      if (error instanceof Error && Array.isArray(error.records)) {
        manifest.records.push(...error.records);
      }
      manifest.failures.push({ runtime, level, message });
      continue;
    }
    if (answer.unavailable) {
      console.log(`${runtime.padEnd(7)} unavailable: ${answer.unavailable}`);
      manifest.unavailable.push({ runtime, reason: answer.unavailable });
      continue;
    }
    manifest.records.push(...answer.records);
  }
}

const mismatches = [];
for (const level of levels) {
  for (const stage of ["ambient", "new", "decompose", "hecke"]) {
    const records = manifest.records.filter(
      (record) => record.level === level && record.stage === stage,
    );
    if (records.length < 2) continue;
    const expected = records.find((record) => record.runtime === "sagejs") || records[0];
    for (const record of records) {
      const agrees = record.fingerprint === expected.fingerprint;
      manifest.comparisons.push({
        level,
        stage,
        reference: expected.runtime,
        runtime: record.runtime,
        fingerprint: record.fingerprint,
        agrees,
      });
      if (!agrees) mismatches.push({ level, stage, expected, record });
    }
  }
}

const manifestFile = path.join(checkpointRoot, "manifest.json");
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest ${manifestFile}`);
if (mismatches.length !== 0) {
  const mismatch = mismatches[0];
  throw new Error(
    `fingerprint mismatch at level ${mismatch.level} ${mismatch.stage}: ` +
    `${mismatch.expected.runtime}=${mismatch.expected.fingerprint}, ` +
    `${mismatch.record.runtime}=${mismatch.record.fingerprint}`,
  );
}
if (manifest.failures.length !== 0) process.exitCode = 1;
