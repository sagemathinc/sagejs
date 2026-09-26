"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { compileKernel } = require("../../tools/native-kernel/compiler.cjs");

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex");
const milliseconds = start => Number(process.hrtime.bigint() - start) / 1e6;
const geometricMean = values =>
  Math.exp(values.reduce((sum, value) => sum + Math.log(value), 0) / values.length);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    timeout: 600_000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result;
}

function normalizedOutput(args) {
  const state = args[20].toArray().slice(0, 4).map(Number);
  return {
    state,
    patternOffsets: args[13].toArray().slice(0, state[1]).map(Number),
    patternCounts: args[14].toArray().slice(0, state[1]).map(Number),
    patternDegrees: args[15].toArray().slice(0, state[2]).map(Number),
    patternMultiplicities: args[16].toArray().slice(0, state[2]).map(Number),
    fullOffsets: args[17].toArray().slice(0, state[1]).map(Number),
    fullCounts: args[18].toArray().slice(0, state[1]).map(Number),
    fullDegrees: args[19].toArray().slice(0, state[3]).map(Number),
  };
}

function expectedOutput(expected) {
  const args = expected.args;
  const state = args[20].slice(0, 4).map(Number);
  return {
    state,
    patternOffsets: args[13].slice(0, state[1]).map(Number),
    patternCounts: args[14].slice(0, state[1]).map(Number),
    patternDegrees: args[15].slice(0, state[2]).map(Number),
    patternMultiplicities: args[16].slice(0, state[2]).map(Number),
    fullOffsets: args[17].slice(0, state[1]).map(Number),
    fullCounts: args[18].slice(0, state[1]).map(Number),
    fullDegrees: args[19].slice(0, state[3]).map(Number),
  };
}

async function main() {
  const boundedFixturePath = path.resolve(process.argv[2]);
  const analyticFixturePath = path.resolve(process.argv[3]);
  const backend = process.argv[4] || "tagged";
  const nativeRepetitions = Number(process.argv[5] || 16);
  const controlRepetitions = Number(process.argv[6] || 600);
  assert(["gmp", "tagged"].includes(backend));
  assert(Number.isSafeInteger(nativeRepetitions) && nativeRepetitions > 0);
  assert(Number.isSafeInteger(controlRepetitions) && controlRepetitions > 0);

  const boundedFixtureBytes = fs.readFileSync(boundedFixturePath);
  const boundedEvidence = JSON.parse(boundedFixtureBytes);
  const packet = boundedEvidence.packets[0];
  const expected = expectedOutput(boundedEvidence.expected[0]);
  const expectedHash = sha256(JSON.stringify(expected));
  assert.deepEqual(expected.state, [0, 1230, 1833, 2270]);

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "sagejs-same-storage-catalog-"));
  const generatorPath = path.join(__dirname, "generate_same_storage_catalog_c.py");
  const sourcePath = path.join(directory, "same_storage_catalog.c");
  const executablePath = path.join(directory, "same_storage_catalog");
  const generated = run("python3", [generatorPath, path.resolve(__dirname, "../.."), analyticFixturePath]);
  fs.writeFileSync(sourcePath, generated.stdout);
  const compiler = process.env.CC || "cc";
  const compilerArguments = [
    "-O3",
    "-std=c11",
    "-D_POSIX_C_SOURCE=200809L",
    sourcePath,
    "-o",
    executablePath,
  ];
  run(compiler, compilerArguments);

  function runControl(repetitions) {
    const result = run(executablePath, [String(repetitions)]);
    const lines = result.stdout.trim().split("\n");
    assert.equal(lines.length, 2);
    const timing = JSON.parse(lines[0]);
    const output = JSON.parse(lines[1]);
    assert.deepEqual(output, expected);
    assert.equal(sha256(JSON.stringify(output)), expectedHash);
    return {
      wallMilliseconds: (timing.wallSeconds * 1000) / repetitions,
      threadCpuMilliseconds: (timing.threadCpuSeconds * 1000) / repetitions,
      batchWallSeconds: timing.wallSeconds,
      batchThreadCpuSeconds: timing.threadCpuSeconds,
    };
  }
  runControl(1);

  const built = await compileKernel({
    sourcePath: path.join(__dirname, "bounded_prime_degree_catalog.py"),
  });
  const bounded = require(built.modulePath).bounded_pari_prime_degree_catalog;
  const nativeArguments = packet.map((entry, index) => {
    if (!Array.isArray(entry)) return BigInt(entry);
    if (index === 6) return bounded.createUInt64Buffer(entry.map(BigInt));
    return bounded.createIntegerBuffer(entry.length, 16, entry.map(BigInt));
  });
  function runNative(repetitions) {
    const cpuStart = process.cpuUsage();
    const wallStart = process.hrtime.bigint();
    for (let iteration = 0; iteration < repetitions; iteration += 1) {
      assert.equal(Number(bounded[backend](...nativeArguments)), 0);
    }
    const wall = milliseconds(wallStart);
    const cpu = process.cpuUsage(cpuStart);
    const output = normalizedOutput(nativeArguments);
    assert.deepEqual(output, expected);
    assert.equal(sha256(JSON.stringify(output)), expectedHash);
    return {
      wallMilliseconds: wall / repetitions,
      processCpuMilliseconds: (cpu.user + cpu.system) / (1000 * repetitions),
      batchWallSeconds: wall / 1000,
      batchProcessCpuSeconds: (cpu.user + cpu.system) / 1e6,
    };
  }

  for (let warmup = 0; warmup < 3; warmup += 1) {
    runNative(nativeRepetitions);
    runControl(controlRepetitions);
  }
  const native = [];
  const control = [];
  for (let pair = 0; pair < 7; pair += 1) {
    if (pair % 2 === 0) {
      native.push(runNative(nativeRepetitions));
      control.push(runControl(controlRepetitions));
    } else {
      control.push(runControl(controlRepetitions));
      native.push(runNative(nativeRepetitions));
    }
  }
  assert(native.every(value => value.batchWallSeconds >= 1));
  assert(control.every(value => value.batchWallSeconds >= 1));
  const ratios = native.map(
    (value, index) => value.wallMilliseconds / control[index].wallMilliseconds,
  );

  const translatedFiles = [
    "f2x_small.py",
    "f2x_small_factor.py",
    "flx_small_factor.py",
    "bounded_flx_small.py",
    "bounded_flx_small_power.py",
    "bounded_flx_small_factor.py",
    "bounded_get_fs_small.py",
    "bounded_prime_degree_catalog.py",
  ];
  const report = {
    schema: "sagejs.benchmark/same-storage-prime-degree-catalog-v1",
    qualifiedTiming: false,
    workload: {
      polynomial: packet[0],
      primeCount: Number(packet[4]),
      expectedState: expected.state,
      outputHash: expectedHash,
    },
    boundary: {
      native:
        "bounded translated catalog through the Sage.js native addon; UInt64Buffer residues but exact IntegerBuffer signed control, offsets, metadata and output",
      control:
        "the same translated Python function graph mechanically specialized by a benchmark-local AST emitter to uint64_t residues and int64_t signed control, metadata, offsets and output",
    },
    protocol: {
      backend,
      warmupBatches: 3,
      alternatingPairs: 7,
      nativeRepetitionsPerBatch: nativeRepetitions,
      controlRepetitionsPerBatch: controlRepetitions,
      compilationPackingStartupSerializationAndCheckingExcluded: true,
      workspaceAndOutputBuffersReusedAcrossIterations: true,
    },
    native,
    control,
    nativeToControlWallRatios: ratios,
    geometricMeanNativeToControlWallRatio: geometricMean(ratios),
    coverage: {
      wholeCatalogCallGraph: true,
      eagerFrozenPrimeOrder: true,
      includesP2AndOddPrimePaths: true,
      includesGroupedAndExpandedFlatOutputPublication: true,
      exceptionRepresentationChangedToProcessFailure: true,
      fixedWorkloadAdmissionMakesSignedInt64ControlValid: true,
      productionCompilerOrBackend: false,
    },
    limitations: [
      "Shared-host diagnostic; affinity and host-idle qualification are not established.",
      "The control is mechanically specialized benchmark C, not a production compiler implementation.",
      "This isolates a fixed admitted workload and does not claim general int64 overflow analysis.",
      "This is the splitting-degree catalog boundary, not a whole class-group computation.",
    ],
    files: { boundedFixturePath, analyticFixturePath, generatorPath, sourcePath, executablePath },
    hashes: {
      boundedFixture: sha256(boundedFixtureBytes),
      analyticFixture: sha256(fs.readFileSync(analyticFixturePath)),
      generator: sha256(fs.readFileSync(generatorPath)),
      generatedSource: sha256(fs.readFileSync(sourcePath)),
      executable: sha256(fs.readFileSync(executablePath)),
      boundedCore: sha256(fs.readFileSync(built.coreSourcePath)),
      translatedSources: Object.fromEntries(
        translatedFiles.map(filename => [filename, sha256(fs.readFileSync(path.join(__dirname, filename)))]),
      ),
    },
    build: {
      compiler,
      compilerVersion: run(compiler, ["--version"]).stdout.split("\n")[0],
      compilerArguments,
    },
    host: { date: new Date().toISOString(), hostname: os.hostname(), platform: process.platform, arch: process.arch },
    directory,
  };
  fs.writeFileSync(path.join(directory, "result.json"), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
