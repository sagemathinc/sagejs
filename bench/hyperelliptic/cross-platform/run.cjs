#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} = require("node:fs");
const {
  arch,
  cpus,
  freemem,
  hostname,
  platform,
  release,
  totalmem,
  tmpdir,
  type,
} = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const root = resolve(
  process.env.SAGEJS_ROOT ?? resolve(__dirname, "..", "..", ".."),
);
const kummerSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kummer_native.py",
);
const cantorSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kernels.py",
);
const relevantSources = [
  "src/lib/sagejs/hyperelliptic_curves/frobenius.py",
  "src/lib/sagejs/hyperelliptic_curves/jacobian_kummer_native.py",
  "src/lib/sagejs/hyperelliptic_curves/genus2_kummer_formulas.py",
  "src/lib/sagejs/hyperelliptic_curves/jacobian.py",
  "src/lib/sagejs/hyperelliptic_curves/jacobian_native.py",
  "src/lib/sagejs/hyperelliptic_curves/jacobian_kernels.py",
  "packages/flint/src/hyperelliptic/smalljac.c",
  "packages/flint/src/addon.h",
];
const algorithmEnvironment = [
  "SAGEJS_NATIVE_MODE",
  "SAGEJS_NATIVE_DISABLE",
  "SAGEJS_NATIVE_REQUIRED",
  "SAGEJS_NATIVE_AUTOLOAD",
  "SAGEJS_NATIVE_CACHE_DIR",
  "OMP_NUM_THREADS",
  "OPENBLAS_NUM_THREADS",
  "MKL_NUM_THREADS",
  "VECLIB_MAXIMUM_THREADS",
  "NUMEXPR_NUM_THREADS",
];

function parsePositiveInteger(text, label) {
  const value = Number(text);
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function options(argv) {
  const result = {
    cacheRoot: join(tmpdir(), "sagejs-hyperelliptic-cross-platform-cache"),
    kummerBatch: 4096,
    cantorScalarRepeat: 1,
    cantorScalarItems: 64,
    limits: [10_000, 100_000],
    output: undefined,
    repeat: 5,
    workerMode: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cache-root") {
      result.cacheRoot = resolve(argv[++index]);
    } else if (argument === "--cantor-scalar-repeat") {
      result.cantorScalarRepeat = parsePositiveInteger(argv[++index], argument);
    } else if (argument === "--cantor-scalar-items") {
      result.cantorScalarItems = parsePositiveInteger(argv[++index], argument);
    } else if (argument === "--kummer-batch") {
      result.kummerBatch = parsePositiveInteger(argv[++index], argument);
    } else if (argument === "--limits") {
      result.limits = argv[++index]
        .split(",")
        .map((value) => parsePositiveInteger(value, argument));
    } else if (argument === "--output") {
      result.output = resolve(argv[++index]);
    } else if (argument === "--repeat") {
      result.repeat = parsePositiveInteger(argv[++index], argument);
    } else if (argument === "--worker-mode") {
      result.workerMode = argv[++index];
    } else {
      throw new Error(`unknown argument ${argument}`);
    }
  }
  if (result.limits.some((value) => value < 3 || value >= 2 ** 32)) {
    throw new RangeError("local-factor limits must be in [3, 2^32)");
  }
  if (
    result.workerMode !== undefined &&
    !["dynamic", "native"].includes(result.workerMode)
  ) {
    throw new Error("--worker-mode must be dynamic or native");
  }
  return result;
}

function command(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
    ...options,
  });
  return {
    command: [command, ...args],
    exit_code: result.status,
    signal: result.signal,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
    error: result.error?.message,
  };
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileDigest(path) {
  const absolute = join(root, path);
  return existsSync(absolute) ? sha256(readFileSync(absolute)) : null;
}

function compiledReceipt(compiled) {
  const manifestPath = join(compiled.outputPath, "manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  return {
    cache_key: manifest.cacheKey,
    cached: compiled.cached,
    source_hash: manifest.sourceHash,
    native_abi: manifest.nativeAbi,
    host_isolation: manifest.hostIsolation,
    source_bounds_checked: manifest.sourceBoundsChecked,
    module_path: compiled.modulePath,
    manifest_sha256: sha256(readFileSync(manifestPath)),
    core_source_sha256: existsSync(compiled.coreSourcePath)
      ? sha256(readFileSync(compiled.coreSourcePath))
      : null,
  };
}

function typedDigest(batch) {
  const hash = createHash("sha256");
  for (const values of [
    batch.primes,
    batch.good,
    batch.coefficientCounts,
    batch.coefficients,
    batch.rowStatus,
  ]) {
    hash.update(Buffer.from(values.buffer, values.byteOffset, values.byteLength));
  }
  return hash.digest("hex");
}

function statistics(samples) {
  assert(samples.length > 0);
  const ordered = [...samples].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  const median = ordered.length % 2
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
  const deviations = samples.map((value) => Math.abs(value - median));
  const sortedDeviations = deviations.sort((left, right) => left - right);
  const mad = sortedDeviations.length % 2
    ? sortedDeviations[middle]
    : (sortedDeviations[middle - 1] + sortedDeviations[middle]) / 2;
  return {
    count: samples.length,
    min: ordered[0],
    median,
    max: ordered.at(-1),
    mad,
  };
}

function sample(callback) {
  const cpu = process.cpuUsage();
  const start = performance.now();
  const value = callback();
  const elapsed = performance.now() - start;
  const used = process.cpuUsage(cpu);
  return {
    value,
    wall_ms: elapsed,
    cpu_user_ms: used.user / 1000,
    cpu_system_ms: used.system / 1000,
    rss_bytes: process.memoryUsage().rss,
  };
}

async function sampleAsync(callback) {
  const cpu = process.cpuUsage();
  const start = performance.now();
  const value = await callback();
  const elapsed = performance.now() - start;
  const used = process.cpuUsage(cpu);
  return {
    value,
    wall_ms: elapsed,
    cpu_user_ms: used.user / 1000,
    cpu_system_ms: used.system / 1000,
    rss_bytes: process.memoryUsage().rss,
  };
}

function summarise(samples) {
  const result = {
    wall_ms: statistics(samples.map((entry) => entry.wall_ms)),
    cpu_user_ms: statistics(samples.map((entry) => entry.cpu_user_ms)),
    cpu_system_ms: statistics(samples.map((entry) => entry.cpu_system_ms)),
    peak_rss_bytes: Math.max(...samples.map((entry) => entry.rss_bytes)),
  };
  if (samples.every((entry) => Number.isFinite(entry.arithmetic_ms))) {
    result.arithmetic_ms = statistics(
      samples.map((entry) => entry.arithmetic_ms),
    );
  }
  return result;
}

function parseTimedSageTuple(representation) {
  const match = /^\(([-+0-9.eE]+), (.*)\)$/.exec(representation);
  if (match === null) {
    throw new Error(`invalid timed Sage tuple ${representation}`);
  }
  return {
    arithmetic_ms: Number(match[1]),
    exact_checksum: `(${match[2]})`,
  };
}

async function sageEvaluation(session, source, timeout = 3_600_000) {
  const answer = await session.evaluate(source, { timeout });
  return answer.repr;
}

async function workerMain(config) {
  const { createSage } = require(join(root, "dist", "tools", "kernel.js"));
  const addonPath = join(
    root,
    "packages",
    "flint",
    "build",
    "Release",
    "sagejs_flint.node",
  );
  if (!existsSync(addonPath)) {
    throw new Error(
      `missing ${addonPath}; build @sagemath/sagejs-flint before running`,
    );
  }
  const addon = require(addonPath);
  const workerStarted = performance.now();
  const session = await createSage();
  const sessionReadyMs = performance.now() - workerStarted;
  const receipt = {
    mode: config.workerMode,
    runtime_native_mode: process.env.SAGEJS_NATIVE_MODE,
    session_ready_ms: sessionReadyMs,
    process_start_rss_bytes: process.memoryUsage().rss,
    local_factors: [],
    kummer: undefined,
    cantor: undefined,
  };
  try {
    const curveSetup = await sampleAsync(() =>
      sageEvaluation(
        session,
        "import time; R=PolynomialRing(QQ,'x'); x=R.gen(); C=HyperellipticCurve(x^5+x+1)",
      ),
    );
    receipt.curve_object_cold = {
      wall_ms: curveSetup.wall_ms,
      cpu_user_ms: curveSetup.cpu_user_ms,
      cpu_system_ms: curveSetup.cpu_system_ms,
      rss_bytes: curveSetup.rss_bytes,
    };
    receipt.process_cold_first_answer_ms = process.uptime() * 1000;
    addon.smalljacLpolyBatch("x^5+x+1", 3n, 101n);
    await sageEvaluation(
      session,
      [
        "from sagejs.hyperelliptic_curves.frobenius import rational_local_coefficient_chunks",
        "list(rational_local_coefficient_chunks(C,3,101,'smalljac',64))",
      ].join("\n"),
    );

    for (const limit of config.limits) {
      const packedSamples = [];
      let packedDigest;
      let packedRows;
      for (let repetition = 0; repetition < config.repeat; repetition += 1) {
        const measured = sample(() =>
          addon.smalljacLpolyBatch("x^5+x+1", 3n, BigInt(limit)),
        );
        const digest = typedDigest(measured.value);
        if (packedDigest === undefined) packedDigest = digest;
        assert.equal(digest, packedDigest);
        packedRows = measured.value.rowCount;
        packedSamples.push({
          wall_ms: measured.wall_ms,
          cpu_user_ms: measured.cpu_user_ms,
          cpu_system_ms: measured.cpu_system_ms,
          rss_bytes: measured.rss_bytes,
        });
      }

      const exactRows = await sageEvaluation(
        session,
        [
          "rows=[]",
          `for chunk in rational_local_coefficient_chunks(C,3,${limit},'smalljac',4096):`,
          "    rows.extend([(p,tuple(coefficients),backend) for p,coefficients,backend in chunk])",
          "rows",
        ].join("\n"),
      );
      const coefficientDigest = sha256(exactRows);
      const coefficientSamples = [];
      for (let repetition = 0; repetition < config.repeat; repetition += 1) {
        const measured = await sampleAsync(() =>
          sageEvaluation(
            session,
            [
              "count=0; prime_sum=0; c1_sum=0; c2_sum=0",
              "started=time.perf_counter()",
              `for chunk in rational_local_coefficient_chunks(C,3,${limit},'smalljac',4096):`,
              "    for p,coefficients,backend in chunk:",
              "        count+=1; prime_sum+=p",
              "        c1_sum+=coefficients[1]; c2_sum+=coefficients[2]",
              "arithmetic_ms=1000*(time.perf_counter()-started)",
              "(arithmetic_ms,count,prime_sum,c1_sum,c2_sum)",
            ].join("\n"),
          ),
        );
        const parsed = parseTimedSageTuple(measured.value);
        coefficientSamples.push({
          wall_ms: measured.wall_ms,
          cpu_user_ms: measured.cpu_user_ms,
          cpu_system_ms: measured.cpu_system_ms,
          rss_bytes: measured.rss_bytes,
          ...parsed,
        });
      }
      assert(
        coefficientSamples.every(
          (entry) =>
            entry.exact_checksum === coefficientSamples[0].exact_checksum,
        ),
      );
      receipt.local_factors.push({
        curve: "y^2=x^5+x+1",
        start: 3,
        stop: limit,
        packed_backend: "smalljac-native-addon",
        packed_rows: packedRows,
        packed_exact_sha256: packedDigest,
        packed: summarise(packedSamples),
        coefficient_rows_exact_sha256: coefficientDigest,
        coefficient_exact_checksum: coefficientSamples[0].exact_checksum,
        coefficients: summarise(coefficientSamples),
      });
    }

    const kummerSetup = await sampleAsync(() =>
      sageEvaluation(
        session,
        [
          "from sagejs.hyperelliptic_curves.jacobian_kummer_native import Genus2PrimeKummerContext,genus2_kummer_double_batch",
          "from sagejs.native import is_compiled,execution_mode",
          "p=4294967291",
          "context=Genus2PrimeKummerContext(p,[1,2,3,4,5,1],[2,0,3])",
          "state=1729; points=[]",
          `for row in range(${config.kummerBatch}):`,
          "    point=[]",
          "    for column in range(4):",
          "        state=(1664525*state+1013904223)%p",
          "        point.append(state)",
          "    points.append(point)",
          "(is_compiled(genus2_kummer_double_batch),execution_mode(genus2_kummer_double_batch),len(points),context.model_fingerprint)",
        ].join("\n"),
      ),
    );
    const capability = kummerSetup.value;
    if (config.workerMode === "native") {
      assert.match(capability, /^\(True, 'native/);
    } else {
      assert.match(capability, /^\(False, 'dynamic'/);
    }
    await sageEvaluation(
      session,
      "kummer_result,kummer_statuses=context.double_batch(points); len(kummer_result)",
    );
    const kummerSamples = [];
    for (let repetition = 0; repetition < config.repeat; repetition += 1) {
      const measured = await sampleAsync(() =>
        sageEvaluation(
          session,
          [
            "started=time.perf_counter()",
            "kummer_result,kummer_statuses=context.double_batch(points)",
            "arithmetic_ms=1000*(time.perf_counter()-started)",
            "(arithmetic_ms,len(kummer_result),sum(kummer_statuses),sum(sum(row) for row in kummer_result))",
          ].join("\n"),
        ),
      );
      const parsed = parseTimedSageTuple(measured.value);
      kummerSamples.push({
        wall_ms: measured.wall_ms,
        cpu_user_ms: measured.cpu_user_ms,
        cpu_system_ms: measured.cpu_system_ms,
        rss_bytes: measured.rss_bytes,
        ...parsed,
      });
    }
    assert(
      kummerSamples.every(
        (entry) => entry.exact_checksum === kummerSamples[0].exact_checksum,
      ),
    );
    const exactKummer = await sageEvaluation(
      session,
      "(kummer_result,kummer_statuses)",
    );
    receipt.kummer = {
      curve: "y^2+h*y=f; f=[1,2,3,4,5,1], h=[2,0,3]",
      prime: 4294967291,
      batch_size: config.kummerBatch,
      capability,
      object_cold: {
        wall_ms: kummerSetup.wall_ms,
        cpu_user_ms: kummerSetup.cpu_user_ms,
        cpu_system_ms: kummerSetup.cpu_system_ms,
        rss_bytes: kummerSetup.rss_bytes,
      },
      exact_result_sha256: sha256(exactKummer),
      exact_checksum: kummerSamples[0].exact_checksum,
      doubling: summarise(kummerSamples),
    };

    const cantorSetup = await sampleAsync(() =>
      sageEvaluation(
        session,
        [
          "from sagejs.hyperelliptic_curves.jacobian_kernels import packed_cantor_add_batch,packed_cantor_progression_batch,packed_cantor_scalar_batch",
          "cantor_compiled=(is_compiled(packed_cantor_add_batch) and is_compiled(packed_cantor_progression_batch) and is_compiled(packed_cantor_scalar_batch))",
          "R3=PolynomialRing(GF(3),'z'); z=R3.gen()",
          "J3=HyperellipticCurve(z**5+z**2+1).jacobian()",
          "C3=J3.prepared_arithmetic()",
          "tiny=J3.points(max_elements=10000,max_candidates=100000)",
          "tiny_left=tiny",
          "tiny_right=[tiny[(17*i+3)%len(tiny)] for i in range(len(tiny))]",
          "tiny_add=C3.add_batch(tiny_left,tiny_right)",
          "tiny_scalar=C3.scalar_batch(tiny[:8],[-257,-17,-1,0,1,2,17,257])",
          "tiny_progression=C3.progression_batch(tiny[0],tiny[1],19,packed=True)",
          "def cantor_basis(curve,context,count):",
          "    field=curve.base_ring(); f,h=curve.hyperelliptic_polynomials()",
          "    points=[]; candidate=0",
          "    while len(points)<count:",
          "        x_value=field(ZZ(candidate)); discriminant=f(x_value)",
          "        if discriminant.is_square():",
          "            y_value=discriminant.sqrt()",
          "            points.append(context.unpack((1,(-candidate)%context.prime,1,0,0,int(y_value.lift()),0,0)))",
          "        candidate+=1",
          "    return tuple(points)",
          "R1009=PolynomialRing(GF(1009),'w'); w=R1009.gen()",
          "cantor_cases=[]",
          "for cantor_genus,cantor_curve in ((2,HyperellipticCurve(w**5+w+1)),(3,HyperellipticCurve(w**7+2*w+1))):",
          "    cantor_jacobian=cantor_curve.jacobian()",
          "    cantor_context=cantor_jacobian.prepared_arithmetic(max_batch_items=2000)",
          "    degree_one=cantor_basis(cantor_curve,cantor_context,64)",
          "    basis=tuple(degree_one[i]+degree_one[(13*i+5)%len(degree_one)] for i in range(len(degree_one)))",
          "    left=tuple(basis[i%len(basis)] for i in range(1000))",
          "    right=tuple(basis[(17*i+7)%len(basis)] for i in range(1000))",
          `    scalars=tuple(2**255+65537*i+1 for i in range(${config.cantorScalarItems}))`,
          "    cantor_cases.append((cantor_genus,cantor_context,basis,left,right,scalars))",
          "(cantor_compiled,len(tiny),C3.capability(),[(g,c.capability()) for g,c,b,l,r,s in cantor_cases])",
        ].join("\n"),
      ),
    );
    const cantorCapability = cantorSetup.value;
    if (config.workerMode === "native") {
      assert.match(cantorCapability, /^\(True,/);
    } else {
      assert.match(cantorCapability, /^\(False,/);
    }
    const tinyExact = await sageEvaluation(
      session,
      "(tuple(C3.pack(v) for v in tiny_add),tuple(C3.pack(v) for v in tiny_scalar),tiny_progression)",
    );
    const cantorCases = [];
    for (const caseIndex of [0, 1]) {
      await sageEvaluation(
        session,
        [
          `cantor_genus,cantor_context,basis,left,right,scalars=cantor_cases[${caseIndex}]`,
          "cantor_add=cantor_context.add_batch(left,right)",
          "cantor_scalar=cantor_context.scalar_batch(left[:1],scalars[:1])",
          "cantor_progression=cantor_context.progression_batch(basis[0],basis[1],1000,packed=True)",
          "cantor_progression_retained=cantor_context.progression_batch(basis[0],basis[1],1000)",
          "if cantor_compiled:",
          "    cantor_add_materialized=cantor_context.add_batch(left,right,materialize=True)",
          "    cantor_scalar_materialized=cantor_context.scalar_batch(left[:1],scalars[:1],materialize=True)",
          "    cantor_progression_materialized=cantor_context.progression_batch(basis[0],basis[1],1000,materialize=True)",
          "else:",
          "    cantor_add_materialized=cantor_add",
          "    cantor_scalar_materialized=cantor_scalar",
          "    cantor_progression_materialized=cantor_progression_retained",
          "assert cantor_progression==tuple(cantor_context.pack(v) for v in cantor_progression_retained)",
          "assert cantor_progression==tuple(cantor_context.pack(v) for v in cantor_progression_materialized)",
          "len(cantor_add)",
        ].join("\n"),
      );
      const addSamples = [];
      const materializedAddSamples = [];
      const progressionSamples = [];
      const retainedProgressionSamples = [];
      const materializedProgressionSamples = [];
      const scalarSamples = [];
      const materializedScalarSamples = [];
      for (let repetition = 0; repetition < config.repeat; repetition += 1) {
        const addMeasured = await sampleAsync(() =>
          sageEvaluation(
            session,
            [
              "started=time.perf_counter()",
              "cantor_add=cantor_context.add_batch(left,right)",
              "arithmetic_ms=1000*(time.perf_counter()-started)",
              "(arithmetic_ms,len(cantor_add),cantor_context.fingerprint(cantor_context.sum(cantor_add)))",
            ].join("\n"),
          ),
        );
        addSamples.push({
          wall_ms: addMeasured.wall_ms,
          cpu_user_ms: addMeasured.cpu_user_ms,
          cpu_system_ms: addMeasured.cpu_system_ms,
          rss_bytes: addMeasured.rss_bytes,
          ...parseTimedSageTuple(addMeasured.value),
        });
        if (config.workerMode === "native") {
          const materializedAddMeasured = await sampleAsync(() =>
            sageEvaluation(
              session,
              [
                "started=time.perf_counter()",
                "cantor_add_materialized=cantor_context.add_batch(left,right,materialize=True)",
                "arithmetic_ms=1000*(time.perf_counter()-started)",
                "(arithmetic_ms,len(cantor_add_materialized),cantor_context.fingerprint(cantor_context.sum(cantor_add_materialized)))",
              ].join("\n"),
            ),
          );
          materializedAddSamples.push({
            wall_ms: materializedAddMeasured.wall_ms,
            cpu_user_ms: materializedAddMeasured.cpu_user_ms,
            cpu_system_ms: materializedAddMeasured.cpu_system_ms,
            rss_bytes: materializedAddMeasured.rss_bytes,
            ...parseTimedSageTuple(materializedAddMeasured.value),
          });
        }
        const progressionMeasured = await sampleAsync(() =>
          sageEvaluation(
            session,
            [
              "started=time.perf_counter()",
              "cantor_progression=cantor_context.progression_batch(basis[0],basis[1],1000,packed=True)",
              "arithmetic_ms=1000*(time.perf_counter()-started)",
              "(arithmetic_ms,len(cantor_progression),cantor_progression[-1])",
            ].join("\n"),
          ),
        );
        progressionSamples.push({
          wall_ms: progressionMeasured.wall_ms,
          cpu_user_ms: progressionMeasured.cpu_user_ms,
          cpu_system_ms: progressionMeasured.cpu_system_ms,
          rss_bytes: progressionMeasured.rss_bytes,
          ...parseTimedSageTuple(progressionMeasured.value),
        });
        const retainedProgressionMeasured = await sampleAsync(() =>
          sageEvaluation(
            session,
            [
              "started=time.perf_counter()",
              "cantor_progression_retained=cantor_context.progression_batch(basis[0],basis[1],1000)",
              "arithmetic_ms=1000*(time.perf_counter()-started)",
              "(arithmetic_ms,len(cantor_progression_retained),cantor_context.pack(cantor_progression_retained[-1]))",
            ].join("\n"),
          ),
        );
        retainedProgressionSamples.push({
          wall_ms: retainedProgressionMeasured.wall_ms,
          cpu_user_ms: retainedProgressionMeasured.cpu_user_ms,
          cpu_system_ms: retainedProgressionMeasured.cpu_system_ms,
          rss_bytes: retainedProgressionMeasured.rss_bytes,
          ...parseTimedSageTuple(retainedProgressionMeasured.value),
        });
        if (config.workerMode === "native") {
          const materializedProgressionMeasured = await sampleAsync(() =>
            sageEvaluation(
              session,
              [
                "started=time.perf_counter()",
                "cantor_progression_materialized=cantor_context.progression_batch(basis[0],basis[1],1000,materialize=True)",
                "arithmetic_ms=1000*(time.perf_counter()-started)",
                "(arithmetic_ms,len(cantor_progression_materialized),cantor_context.pack(cantor_progression_materialized[-1]))",
              ].join("\n"),
            ),
          );
          materializedProgressionSamples.push({
            wall_ms: materializedProgressionMeasured.wall_ms,
            cpu_user_ms: materializedProgressionMeasured.cpu_user_ms,
            cpu_system_ms: materializedProgressionMeasured.cpu_system_ms,
            rss_bytes: materializedProgressionMeasured.rss_bytes,
            ...parseTimedSageTuple(materializedProgressionMeasured.value),
          });
        }
      }
      for (
        let repetition = 0;
        repetition < config.cantorScalarRepeat;
        repetition += 1
      ) {
        const scalarMeasured = await sampleAsync(() =>
          sageEvaluation(
            session,
            [
              "started=time.perf_counter()",
              `cantor_scalar=cantor_context.scalar_batch(left[:${config.cantorScalarItems}],scalars)`,
              "arithmetic_ms=1000*(time.perf_counter()-started)",
              "(arithmetic_ms,len(cantor_scalar),cantor_context.fingerprint(cantor_context.sum(cantor_scalar)))",
            ].join("\n"),
          ),
        );
        scalarSamples.push({
          wall_ms: scalarMeasured.wall_ms,
          cpu_user_ms: scalarMeasured.cpu_user_ms,
          cpu_system_ms: scalarMeasured.cpu_system_ms,
          rss_bytes: scalarMeasured.rss_bytes,
          ...parseTimedSageTuple(scalarMeasured.value),
        });
        if (config.workerMode === "native") {
          const materializedScalarMeasured = await sampleAsync(() =>
            sageEvaluation(
              session,
              [
                "started=time.perf_counter()",
                `cantor_scalar_materialized=cantor_context.scalar_batch(left[:${config.cantorScalarItems}],scalars,materialize=True)`,
                "arithmetic_ms=1000*(time.perf_counter()-started)",
                "(arithmetic_ms,len(cantor_scalar_materialized),cantor_context.fingerprint(cantor_context.sum(cantor_scalar_materialized)))",
              ].join("\n"),
            ),
          );
          materializedScalarSamples.push({
            wall_ms: materializedScalarMeasured.wall_ms,
            cpu_user_ms: materializedScalarMeasured.cpu_user_ms,
            cpu_system_ms: materializedScalarMeasured.cpu_system_ms,
            rss_bytes: materializedScalarMeasured.rss_bytes,
            ...parseTimedSageTuple(materializedScalarMeasured.value),
          });
        }
      }
      for (const samples of [
        addSamples,
        progressionSamples,
        retainedProgressionSamples,
        scalarSamples,
      ]) {
        assert(
          samples.every(
            (entry) => entry.exact_checksum === samples[0].exact_checksum,
          ),
        );
      }
      if (config.workerMode === "native") {
        for (const samples of [
          materializedAddSamples,
          materializedProgressionSamples,
          materializedScalarSamples,
        ]) {
          assert(
            samples.every(
              (entry) => entry.exact_checksum === samples[0].exact_checksum,
            ),
          );
        }
      }
      const exactAdd = await sageEvaluation(
        session,
        "tuple(cantor_context.pack(v) for v in cantor_add)",
      );
      const exactMaterializedAdd = await sageEvaluation(
        session,
        "tuple(cantor_context.pack(v) for v in cantor_add_materialized)",
      );
      const exactScalar = await sageEvaluation(
        session,
        "tuple(cantor_context.pack(v) for v in cantor_scalar)",
      );
      const exactMaterializedScalar = await sageEvaluation(
        session,
        "tuple(cantor_context.pack(v) for v in cantor_scalar_materialized)",
      );
      const exactProgression = await sageEvaluation(
        session,
        "cantor_progression",
      );
      const exactMaterializedProgression = await sageEvaluation(
        session,
        "tuple(cantor_context.pack(v) for v in cantor_progression_materialized)",
      );
      const exactRetainedProgression = await sageEvaluation(
        session,
        "tuple(cantor_context.pack(v) for v in cantor_progression_retained)",
      );
      assert.equal(exactMaterializedAdd, exactAdd);
      assert.equal(exactMaterializedScalar, exactScalar);
      assert.equal(exactRetainedProgression, exactProgression);
      assert.equal(exactMaterializedProgression, exactProgression);
      const representationState = await sageEvaluation(
        session,
        "(sum(1 for v in cantor_add if v.is_materialized()),sum(1 for v in cantor_add_materialized if v.is_materialized()),sum(1 for v in cantor_scalar if v.is_materialized()),sum(1 for v in cantor_scalar_materialized if v.is_materialized()),sum(1 for v in cantor_progression_retained if v.is_materialized()),sum(1 for v in cantor_progression_materialized if v.is_materialized()))",
      );
      if (config.workerMode === "native") {
        assert.equal(
          representationState,
          `(0, 1000, 0, ${config.cantorScalarItems}, 0, 1000)`,
        );
      }
      cantorCases.push({
        genus: caseIndex + 2,
        prime: 1009,
        capability: await sageEvaluation(session, "cantor_context.capability()"),
        add_batch_items: 1000,
        add_exact_sha256: sha256(exactAdd),
        add_exact_checksum: addSamples[0].exact_checksum,
        add_batch: summarise(addSamples),
        add_materialized_exact_sha256: sha256(exactMaterializedAdd),
        add_materialized_exact_checksum:
          materializedAddSamples[0]?.exact_checksum ??
          addSamples[0].exact_checksum,
        add_materialized_batch:
          materializedAddSamples.length === 0
            ? null
            : summarise(materializedAddSamples),
        scalar_batch_items: config.cantorScalarItems,
        scalar_bits: 256,
        scalar_exact_sha256: sha256(exactScalar),
        scalar_exact_checksum: scalarSamples[0].exact_checksum,
        scalar_batch: summarise(scalarSamples),
        scalar_materialized_exact_sha256: sha256(exactMaterializedScalar),
        scalar_materialized_exact_checksum:
          materializedScalarSamples[0]?.exact_checksum ??
          scalarSamples[0].exact_checksum,
        scalar_materialized_batch:
          materializedScalarSamples.length === 0
            ? null
            : summarise(materializedScalarSamples),
        progression_items: 1000,
        progression_packed: true,
        progression_exact_sha256: sha256(exactProgression),
        progression_exact_checksum: progressionSamples[0].exact_checksum,
        progression_batch: summarise(progressionSamples),
        progression_retained_exact_sha256: sha256(exactRetainedProgression),
        progression_retained_exact_checksum:
          retainedProgressionSamples[0].exact_checksum,
        progression_retained_batch: summarise(retainedProgressionSamples),
        progression_materialized_exact_sha256: sha256(
          exactMaterializedProgression,
        ),
        progression_materialized_exact_checksum:
          materializedProgressionSamples[0]?.exact_checksum ??
          retainedProgressionSamples[0].exact_checksum,
        progression_materialized_batch:
          materializedProgressionSamples.length === 0
            ? null
            : summarise(materializedProgressionSamples),
        materialization_comparison:
          config.workerMode === "native"
            ? "retained-packed-versus-forced-polynomials"
            : "not-applicable-reference-is-already-materialized",
        representation_state: representationState,
      });
    }
    receipt.cantor = {
      schema: "sagejs.hyperelliptic.packed-mumford.odd.v1",
      capability: cantorCapability,
      object_cold: {
        wall_ms: cantorSetup.wall_ms,
        cpu_user_ms: cantorSetup.cpu_user_ms,
        cpu_system_ms: cantorSetup.cpu_system_ms,
        rss_bytes: cantorSetup.rss_bytes,
      },
      tiny_prime: 3,
      tiny_exact_sha256: sha256(tinyExact),
      cases: cantorCases,
    };
  } finally {
    await session.close();
  }
  receipt.process_end_rss_bytes = process.memoryUsage().rss;
  process.stdout.write(
    `SAGEJS_HYPERELLIPTIC_CROSS_PLATFORM_WORKER ${JSON.stringify(receipt)}\n`,
  );
}

function preflight() {
  const common = {
    uptime: command(
      platform() === "win32" ? "powershell" : "uptime",
      platform() === "win32"
        ? [
            "-NoProfile",
            "-Command",
            "(Get-Date)-(gcim Win32_OperatingSystem).LastBootUpTime",
          ]
        : [],
    ),
    git_status: command("git", ["status", "--short", "--branch"]),
    git_commit: command("git", ["rev-parse", "HEAD"]),
    compiler: command(
      platform() === "win32" ? "where" : "cc",
      platform() === "win32" ? ["cl.exe"] : ["--version"],
    ),
  };
  if (platform() === "linux") {
    return {
      ...common,
      uname: command("uname", ["-a"]),
      cpu: command("lscpu"),
      memory: command("free", ["-h"]),
      processes: command("ps", ["-eo", "pid,pcpu,pmem,comm", "--sort=-pcpu"]),
      governors: command("sh", [
        "-c",
        "for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do test -r \"$f\" && printf '%s=%s\\n' \"$f\" \"$(cat \"$f\")\"; done",
      ]),
    };
  }
  if (platform() === "darwin") {
    return {
      ...common,
      uname: command("uname", ["-a"]),
      hardware: command("sysctl", [
        "-n",
        "machdep.cpu.brand_string",
        "hw.physicalcpu",
        "hw.logicalcpu",
        "hw.memsize",
      ]),
      processes: command("ps", ["-Ao", "pid,pcpu,pmem,comm", "-r"]),
    };
  }
  return {
    ...common,
    system: command("powershell", [
      "-NoProfile",
      "-Command",
      "Get-CimInstance Win32_OperatingSystem | Format-List *; Get-CimInstance Win32_Processor | Format-List *",
    ]),
    processes: command("powershell", [
      "-NoProfile",
      "-Command",
      "Get-Process | Sort-Object CPU -Descending | Select-Object -First 25 Id,CPU,WorkingSet,ProcessName | Format-Table -AutoSize",
    ]),
  };
}

function runWorker(config, mode) {
  const args = [
    __filename,
    "--worker-mode",
    mode,
    "--cache-root",
    config.cacheRoot,
    "--limits",
    config.limits.join(","),
    "--kummer-batch",
    String(config.kummerBatch),
    "--cantor-scalar-repeat",
    String(config.cantorScalarRepeat),
    "--cantor-scalar-items",
    String(config.cantorScalarItems),
    "--repeat",
    String(config.repeat),
  ];
  const environment = {
    ...process.env,
    SAGEJS_NATIVE_CACHE_DIR: config.cacheRoot,
    SAGEJS_NATIVE_MODE: mode === "native" ? "auto" : "dynamic",
  };
  delete environment.SAGEJS_NATIVE_DISABLE;
  delete environment.SAGEJS_NATIVE_REQUIRED;
  const started = performance.now();
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: "utf8",
    env: environment,
    timeout: 3_600_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  const processColdMs = performance.now() - started;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `worker ${mode} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
    );
  }
  const marker = "SAGEJS_HYPERELLIPTIC_CROSS_PLATFORM_WORKER ";
  const line = result.stdout
    .trim()
    .split("\n")
    .findLast((value) => value.startsWith(marker));
  if (line === undefined) {
    throw new Error(`worker ${mode} emitted no result marker: ${result.stdout}`);
  }
  return {
    ...JSON.parse(line.slice(marker.length)),
    worker_total_ms: processColdMs,
    stderr: result.stderr.trim(),
  };
}

async function coordinatorMain(config) {
  const missing = relevantSources.filter((path) => !existsSync(join(root, path)));
  if (missing.length > 0) {
    throw new Error(`missing benchmark source(s): ${missing.join(", ")}`);
  }
  const requiredBuildProducts = ["dist/tools/compiler.js", "dist/tools/kernel.js"];
  const missingBuildProducts = requiredBuildProducts.filter(
    (path) => !existsSync(join(root, path)),
  );
  if (missingBuildProducts.length > 0) {
    throw new Error(
      `missing build product(s) ${missingBuildProducts.join(", ")}; run ` +
        "`pnpm build` first",
    );
  }
  const { compile } = require(join(root, "tools", "native-kernel.cjs"));
  const compilationStarted = performance.now();
  const compiled = await compile({
    sourcePath: kummerSource,
    cacheRoot: config.cacheRoot,
  });
  const compiledCantor = await compile({
    sourcePath: cantorSource,
    cacheRoot: config.cacheRoot,
  });
  const compilationMs = performance.now() - compilationStarted;
  const dynamic = runWorker(config, "dynamic");
  const native = runWorker(config, "native");

  assert.equal(dynamic.local_factors.length, native.local_factors.length);
  for (let index = 0; index < dynamic.local_factors.length; index += 1) {
    assert.equal(
      dynamic.local_factors[index].packed_exact_sha256,
      native.local_factors[index].packed_exact_sha256,
    );
    assert.equal(
      dynamic.local_factors[index].coefficient_rows_exact_sha256,
      native.local_factors[index].coefficient_rows_exact_sha256,
    );
  }
  assert.equal(
    dynamic.kummer.exact_result_sha256,
    native.kummer.exact_result_sha256,
  );
  assert.equal(dynamic.kummer.exact_checksum, native.kummer.exact_checksum);
  assert.equal(dynamic.cantor.tiny_exact_sha256, native.cantor.tiny_exact_sha256);
  assert.deepEqual(
    dynamic.cantor.cases.map((entry) => ({
      add: entry.add_exact_sha256,
      scalar: entry.scalar_exact_sha256,
      progression: entry.progression_exact_sha256,
    })),
    native.cantor.cases.map((entry) => ({
      add: entry.add_exact_sha256,
      scalar: entry.scalar_exact_sha256,
      progression: entry.progression_exact_sha256,
    })),
  );

  const cpuModels = [...new Set(cpus().map((cpu) => cpu.model))];
  const receipt = {
    schema: "sagejs.hyperelliptic-cross-platform-acceptance.v1",
    generated_at_utc: new Date().toISOString(),
    host: {
      hostname: hostname(),
      os_type: type(),
      platform: platform(),
      os_release: release(),
      architecture: arch(),
      cpu_models: cpuModels,
      logical_cpus: cpus().length,
      total_memory_bytes: totalmem(),
      free_memory_bytes_before: freemem(),
      node: process.version,
      preflight: preflight(),
    },
    repository: {
      root,
      commit: command("git", ["rev-parse", "HEAD"]).stdout,
      status: command("git", ["status", "--porcelain=v1"]).stdout,
      build_receipt_sha256: fileDigest("dist/build-receipt.json"),
      source_sha256: Object.fromEntries(
        relevantSources.map((path) => [path, fileDigest(path)]),
      ),
    },
    configuration: {
      limits: config.limits,
      kummer_batch: config.kummerBatch,
      cantor_add_batch: 1000,
      cantor_scalar_batch: config.cantorScalarItems,
      cantor_scalar_bits: 256,
      cantor_progression_batch: 1000,
      cantor_scalar_repeat: config.cantorScalarRepeat,
      repeat: config.repeat,
      cache_root: config.cacheRoot,
      algorithm_environment: Object.fromEntries(
        algorithmEnvironment.map((name) => [name, process.env[name] ?? null]),
      ),
    },
    native_compilation: {
      wall_ms: compilationMs,
      kummer: compiledReceipt(compiled),
      cantor: compiledReceipt(compiledCantor),
    },
    modes: { dynamic, native },
    cross_mode_exact: {
      local_factor_packed_sha256: dynamic.local_factors.map(
        (entry) => entry.packed_exact_sha256,
      ),
      local_factor_coefficients_sha256: dynamic.local_factors.map(
        (entry) => entry.coefficient_rows_exact_sha256,
      ),
      kummer_sha256: dynamic.kummer.exact_result_sha256,
      cantor_tiny_sha256: dynamic.cantor.tiny_exact_sha256,
      cantor_cases: dynamic.cantor.cases.map((entry) => ({
        genus: entry.genus,
        add_sha256: entry.add_exact_sha256,
        scalar_sha256: entry.scalar_exact_sha256,
        progression_sha256: entry.progression_exact_sha256,
      })),
    },
  };
  const encoded = `${JSON.stringify(receipt, null, 2)}\n`;
  if (config.output === undefined) {
    process.stdout.write(encoded);
  } else {
    mkdirSync(dirname(config.output), { recursive: true });
    writeFileSync(config.output, encoded);
    process.stderr.write(`wrote ${config.output}\n`);
  }
}

const config = options(process.argv.slice(2));
const action =
  config.workerMode === undefined
    ? coordinatorMain(config)
    : workerMain(config);
Promise.resolve(action).catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});
