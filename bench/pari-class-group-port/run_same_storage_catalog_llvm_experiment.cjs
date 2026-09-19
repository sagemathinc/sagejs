"use strict";

// Compare compact C/GCC, compact C/Clang, and direct Python-AST-to-LLVM
// lowering on the frozen 1,230-prime splitting-degree catalog.

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const HERE = __dirname;
const ROOT = path.resolve(HERE, "../..");
const C_GENERATOR = path.join(HERE, "generate_same_storage_catalog_c.py");
const LLVM_GENERATOR = path.join(HERE, "generate_same_storage_catalog_llvm.py");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const geometricMean = values =>
  Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);

function run(command, args, options = {}) {
  const start = process.hrtime.bigint();
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  const milliseconds = Number(process.hrtime.bigint() - start) / 1e6;
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return { ...result, milliseconds };
}

function writeGenerated(command, args, filename) {
  const result = run(command, args);
  fs.writeFileSync(filename, result.stdout);
  return result.milliseconds;
}

function build(command, args, filename) {
  const result = run(command, args);
  return {
    milliseconds: result.milliseconds,
    bytes: fs.statSync(filename).size,
    sha256: sha256(fs.readFileSync(filename)),
  };
}

function execute(filename, repetitions) {
  const result = run(filename, [String(repetitions)]);
  const lines = result.stdout.trim().split("\n");
  assert.equal(lines.length, 2);
  const timing = JSON.parse(lines[0]);
  return {
    millisecondsPerCatalog: (timing.wallSeconds * 1000) / repetitions,
    threadCpuMillisecondsPerCatalog:
      (timing.threadCpuSeconds * 1000) / repetitions,
    outputSha256: sha256(lines[1]),
  };
}

function version(command) {
  return run(command, ["--version"]).stdout.split("\n", 1)[0];
}

function main() {
  const fixture = path.resolve(process.argv[2]);
  assert(fs.existsSync(fixture), `missing analytic fixture ${fixture}`);
  const output = path.resolve(
    process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-direct-llvm-catalog-")),
  );
  fs.mkdirSync(output, { recursive: true });
  const repetitions = Number(process.argv[4] || 800);
  const pairs = Number(process.argv[5] || 10);
  assert(Number.isSafeInteger(repetitions) && repetitions >= 1);
  assert(Number.isSafeInteger(pairs) && pairs >= 1);

  const cSource = path.join(output, "catalog.c");
  const harness = path.join(output, "harness.c");
  const generation = {
    c: writeGenerated("python3", [C_GENERATOR, ROOT, fixture], cSource),
    harness: writeGenerated(
      "python3",
      [LLVM_GENERATOR, ROOT, fixture, "harness"],
      harness,
    ),
  };
  const variants = [
    { name: "gcc-c", compiler: "gcc", source: cSource, kind: "c" },
    { name: "clang-c", compiler: "clang", source: cSource, kind: "c" },
    { name: "llvm-baseline", compiler: "clang", policy: "baseline", kind: "llvm" },
    { name: "llvm-proved", compiler: "clang", policy: "proved", kind: "llvm" },
    {
      name: "llvm-proved-noalias",
      compiler: "clang",
      policy: "proved-noalias",
      kind: "llvm",
    },
  ];
  const builds = {};
  for (const variant of variants) {
    const executable = path.join(output, variant.name);
    if (variant.kind === "c") {
      builds[variant.name] = build(
        variant.compiler,
        [
          "-w",
          "-O3",
          "-std=c11",
          "-D_POSIX_C_SOURCE=200809L",
          cSource,
          "-o",
          executable,
        ],
        executable,
      );
    } else {
      const ir = path.join(output, `${variant.name}.ll`);
      const object = path.join(output, `${variant.name}.o`);
      generation[variant.name] = writeGenerated(
        "python3",
        [LLVM_GENERATOR, ROOT, fixture, "ir", variant.policy],
        ir,
      );
      const compile = build(
        "clang",
        ["-w", "-O3", "-c", "-x", "ir", ir, "-o", object],
        object,
      );
      const link = build(
        "clang",
        [
          "-w",
          "-O3",
          "-std=c11",
          "-D_POSIX_C_SOURCE=200809L",
          harness,
          object,
          "-o",
          executable,
        ],
        executable,
      );
      builds[variant.name] = {
        ...link,
        compileMilliseconds: compile.milliseconds,
        objectBytes: compile.bytes,
        objectSha256: compile.sha256,
        irBytes: fs.statSync(ir).size,
        irSha256: sha256(fs.readFileSync(ir)),
      };
    }
    variant.executable = executable;
  }

  const first = execute(variants[0].executable, 1);
  for (const variant of variants.slice(1)) {
    assert.equal(execute(variant.executable, 1).outputSha256, first.outputSha256);
  }
  for (let warmup = 0; warmup < 3; warmup += 1) {
    for (const variant of variants) execute(variant.executable, repetitions);
  }
  const rows = [];
  for (let pair = 0; pair < pairs; pair += 1) {
    const shift = pair % variants.length;
    const order = [...variants.slice(shift), ...variants.slice(0, shift)];
    if (pair % 2 !== 0) order.reverse();
    for (const variant of order) {
      rows.push({ pair, name: variant.name, ...execute(variant.executable, repetitions) });
    }
  }
  const summary = {};
  for (const variant of variants) {
    const samples = rows
      .filter(row => row.name === variant.name)
      .map(row => row.millisecondsPerCatalog);
    summary[variant.name] = {
      geometricMeanMilliseconds: geometricMean(samples),
      minimumMilliseconds: Math.min(...samples),
      maximumMilliseconds: Math.max(...samples),
    };
  }
  const gcc = summary["gcc-c"].geometricMeanMilliseconds;
  for (const variant of variants.slice(1)) {
    summary[variant.name].ratioToGcc =
      summary[variant.name].geometricMeanMilliseconds / gcc;
  }
  const report = {
    schema: "sagejs.experiment/direct-llvm-catalog-v1",
    qualifiedTiming: false,
    mathematicalSource: "ordinary Python AST; generated C is not an LLVM input",
    workload: {
      polynomial: [20034, -20018, 0, 1],
      primeCount: 1230,
      activeOutputCount: 7081,
      outputSha256: first.outputSha256,
    },
    protocol: { warmupBatches: 3, alternatingPairs: pairs, repetitions },
    summary,
    rows,
    generation,
    builds,
    hashes: {
      fixture: sha256(fs.readFileSync(fixture)),
      cGenerator: sha256(fs.readFileSync(C_GENERATOR)),
      llvmGenerator: sha256(fs.readFileSync(LLVM_GENERATOR)),
      cSource: sha256(fs.readFileSync(cSource)),
      harness: sha256(fs.readFileSync(harness)),
    },
    toolchain: { gcc: version("gcc"), clang: version("clang") },
    limitations: [
      "Shared-host diagnostic without affinity or idle-host qualification.",
      "The direct LLVM emitter supports only this frozen benchmark sublanguage.",
      "The C harness performs fixture construction, timing, and output printing outside the timed kernel.",
      "This is a splitting-degree catalog, not a whole class-group computation.",
    ],
    outputDirectory: output,
  };
  fs.writeFileSync(path.join(output, "result.json"), JSON.stringify(report, null, 2));
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

main();
