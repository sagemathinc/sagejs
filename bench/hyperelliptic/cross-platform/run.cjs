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

const root = resolve(__dirname, "..", "..", "..");
const kummerSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kummer_native.py",
);
const relevantSources = [
  "src/lib/sagejs/hyperelliptic_curves/frobenius.py",
  "src/lib/sagejs/hyperelliptic_curves/jacobian_kummer_native.py",
  "src/lib/sagejs/hyperelliptic_curves/genus2_kummer_formulas.py",
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
    limits: [10_000, 100_000],
    output: undefined,
    repeat: 5,
    workerMode: undefined,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cache-root") {
      result.cacheRoot = resolve(argv[++index]);
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
    session_ready_ms: sessionReadyMs,
    process_start_rss_bytes: process.memoryUsage().rss,
    local_factors: [],
    kummer: undefined,
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
      "Get-CimInstance Win32_OperatingSystem,Win32_Processor | Format-List *",
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
    "--repeat",
    String(config.repeat),
  ];
  const environment = {
    ...process.env,
    SAGEJS_NATIVE_CACHE_DIR: config.cacheRoot,
    SAGEJS_NATIVE_MODE: mode,
  };
  delete environment.SAGEJS_NATIVE_DISABLE;
  delete environment.SAGEJS_NATIVE_REQUIRED;
  if (mode === "native") environment.SAGEJS_NATIVE_REQUIRED = "1";
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
  const { compile } = require("@sagemath/sagejs/native");
  const compilationStarted = performance.now();
  const compiled = await compile({
    sourcePath: kummerSource,
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
      repeat: config.repeat,
      cache_root: config.cacheRoot,
      algorithm_environment: Object.fromEntries(
        algorithmEnvironment.map((name) => [name, process.env[name] ?? null]),
      ),
    },
    native_compilation: {
      cache_key: compiled.cacheKey,
      cached: compiled.cached,
      source_hash: compiled.sourceHash,
      native_abi: compiled.nativeAbi,
      module_path: compiled.modulePath,
      core_source_sha256: existsSync(compiled.coreSourcePath)
        ? sha256(readFileSync(compiled.coreSourcePath))
        : null,
      wall_ms: compilationMs,
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
