#!/usr/bin/env node

"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { arch, cpus, freemem, hostname, loadavg, platform, release, totalmem } = require("node:os");
const { dirname, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const root = resolve(process.env.SAGEJS_ROOT ?? resolve(__dirname, "..", "..", ".."));
const corpusPath = join(__dirname, "domain-corpus-v1.json");
const cantorSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kernels.py",
);
const policyPath = join(root, "architecture", "hyperelliptic-auto-receipt-policy.json");
const { generateSourceBundle } = require(join(
  root,
  "tools",
  "math-dispatch",
  "hyperelliptic-auto-receipt-policy.cjs",
));

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function readJson(filename) {
  return JSON.parse(readFileSync(filename, "utf8"));
}

function checkedPositive(value, label) {
  const answer = Number(value);
  if (!Number.isSafeInteger(answer) || answer <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return answer;
}

function options(argv) {
  const answer = {
    cacheRoot: join(require("node:os").tmpdir(), "sagejs-hyperelliptic-domain-cache"),
    check: false,
    output: null,
    repeat: 1,
    workerMode: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--cache-root") answer.cacheRoot = resolve(argv[++index]);
    else if (value === "--check") answer.check = true;
    else if (value === "--output") answer.output = resolve(argv[++index]);
    else if (value === "--repeat") answer.repeat = checkedPositive(argv[++index], value);
    else if (value === "--worker-mode") answer.workerMode = argv[++index];
    else throw new Error(`unknown argument ${value}`);
  }
  if (answer.workerMode !== null && !["dynamic", "native"].includes(answer.workerMode)) {
    throw new Error("--worker-mode must be dynamic or native");
  }
  if (!answer.check && answer.workerMode === null && answer.output === null) {
    throw new Error("--output is required outside --check and worker modes");
  }
  return answer;
}

function checkEnvelope(envelope, operation) {
  const fields = [
    "prime_min",
    "prime_max",
    "interval_start_min",
    "interval_stop_max",
    "interval_span_max",
    "batch_items_min",
    "batch_items_max",
    "scalar_bits_max",
    "resource_bytes_max",
  ];
  assert.deepEqual(Object.keys(envelope), fields, `${operation} envelope fields drifted`);
  for (const field of fields) assert(Number.isSafeInteger(envelope[field]));
  assert(envelope.prime_min <= envelope.prime_max);
  assert(envelope.batch_items_min >= 1);
  assert(envelope.batch_items_min <= envelope.batch_items_max);
}

function checkCorpus(corpus) {
  assert.equal(corpus.schema, "sagejs.hyperelliptic-prime-cantor-domain-corpus/v1");
  assert.equal(corpus.domain.kind, "domain-envelope");
  assert.equal(corpus.domain.domain_id, "prime-cantor-odd-v1");
  assert.deepEqual(corpus.domain.constraints, {
    genus: [2, 3],
    field_kind: ["prime-field"],
    model_kind: ["odd-degree-one-infinity"],
    h_kind: ["zero", "nonzero"],
  });
  assert.deepEqual(Object.keys(corpus.envelopes), ["add", "scalar", "progression"]);
  for (const [operation, envelope] of Object.entries(corpus.envelopes)) {
    checkEnvelope(envelope, operation);
  }
  assert.equal(corpus.envelopes.add.resource_bytes_max, 96 + 200 * 1000);
  assert.equal(corpus.envelopes.scalar.resource_bytes_max, 96 + 64 * 22 * 8);
  assert.equal(corpus.envelopes.progression.resource_bytes_max, 224 + 72 * 1000);
  assert.equal(corpus.cases.length, 20);
  assert.equal(new Set(corpus.cases.map((entry) => entry.id)).size, 20);
  assert.deepEqual([...new Set(corpus.cases.map((entry) => entry.prime))], [5, 13, 101, 1009, 65521]);
  for (const prime of [5, 13, 101, 1009, 65521]) {
    const rows = corpus.cases.filter((entry) => entry.prime === prime);
    assert.deepEqual(rows.map((entry) => [entry.genus, entry.h_kind]), [
      [2, "zero"],
      [2, "nonzero"],
      [3, "zero"],
      [3, "nonzero"],
    ]);
  }
  for (const operation of ["add", "scalar", "progression"]) {
    assert(corpus.cases.some((entry) => entry.maximum_operations.includes(operation)));
  }
  return corpus;
}

function command(commandName, args, extra = {}) {
  return spawnSync(commandName, args, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 3_600_000,
    ...extra,
  });
}

function checkedCommand(commandName, args, extra = {}) {
  const result = command(commandName, args, extra);
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${commandName} ${args.join(" ")}\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function git(...args) {
  return checkedCommand("git", ["-C", root, ...args], { timeout: 30_000 });
}

function statistics(values) {
  const ordered = [...values].sort((left, right) => left - right);
  const median = ordered[Math.floor(ordered.length / 2)];
  const deviations = ordered
    .map((value) => Math.abs(value - median))
    .sort((left, right) => left - right);
  return {
    count: ordered.length,
    min: ordered[0],
    median,
    max: ordered.at(-1),
    mad: deviations[Math.floor(deviations.length / 2)],
  };
}

function compilationReceipt(compiled) {
  const manifestPath = join(compiled.outputPath, "manifest.json");
  const bytes = readFileSync(manifestPath);
  const manifest = JSON.parse(bytes);
  return {
    cache_key: manifest.cacheKey,
    cached: compiled.cached,
    source_hash: manifest.sourceHash,
    native_abi: manifest.nativeAbi,
    host_isolation: manifest.hostIsolation,
    source_bounds_checked: manifest.sourceBoundsChecked,
    manifest_sha256: sha256(bytes),
  };
}

function workerSource(corpus, mode, repeat) {
  const algorithm = mode === "native" ? "native" : "reference";
  return [
    "import base64,hashlib,json,time",
    "from sagejs.hyperelliptic_curves.jacobian_kernels import packed_cantor_add_batch,packed_cantor_progression_batch,packed_cantor_scalar_batch",
    "from sagejs.native import execution_mode,is_compiled",
    `corpus=json.loads(${JSON.stringify(JSON.stringify(corpus))})`,
    `bench_algorithm=${JSON.stringify(algorithm)}`,
    `repeat_count=${repeat}`,
    "def basis_for(curve,context,count):",
    "    field=curve.base_ring(); f,h=curve.hyperelliptic_polynomials()",
    "    two=field(2); four=field(4); points=[]; candidate=0",
    "    while len(points)<count:",
    "        x_value=field(candidate)",
    "        discriminant=h(x_value)*h(x_value)+four*f(x_value)",
    "        if discriminant.is_square():",
    "            y_value=(-h(x_value)+discriminant.sqrt())/two",
    "            points.append(context.unpack((1,(-candidate)%context.prime,1,0,0,int(y_value.lift()),0,0)))",
    "        candidate+=1",
    "    shifted=tuple(points[(13*i+5)%len(points)] for i in range(len(points)))",
    "    return context.add_batch(tuple(points),shifted,algorithm=bench_algorithm)",
    "prepared=[]",
    "for spec in corpus['cases']:",
    "    field=GF(spec['prime']); ring=PolynomialRing(field,'x'); x=ring.gen()",
    "    f=ring(spec['f']); h=ring(spec['h']); discriminant=h*h+4*f",
    "    assert discriminant.gcd(discriminant.derivative()).degree()==0",
    "    curve=HyperellipticCurve(f,h); assert curve.genus()==spec['genus']",
    "    jacobian=curve.jacobian(); assert jacobian.model_kind()=='odd-degree-one-infinity'",
    "    context=jacobian.prepared_arithmetic(max_batch_items=2000)",
    "    basis=basis_for(curve,context,64)",
    "    prepared.append((spec,context,basis))",
    "def items(basis,count,multiplier,offset):",
    "    return tuple(basis[(multiplier*i+offset)%len(basis)] for i in range(count))",
    "def packed(context,values):",
    "    return tuple(context.pack(value) for value in values)",
    "def digest(value):",
    "    return hashlib.sha256(repr(tuple(value)).encode('utf-8')).hexdigest()",
    "def run_add():",
    "    answer=[]",
    "    for spec,context,basis in prepared:",
    "        counts=[corpus['small_workload']['add_items']]",
    "        if 'add' in spec['maximum_operations']: counts.append(corpus['envelopes']['add']['batch_items_max'])",
    "        for count in counts:",
    "            left=items(basis,count,1,0); right=items(basis,count,17,7)",
    "            value=context.add_batch(left,right,algorithm=bench_algorithm)",
    "            answer.append((spec['id'],count,packed(context,value)))",
    "    return tuple(answer)",
    "def run_scalar():",
    "    answer=[]",
    "    for spec,context,basis in prepared:",
    "        counts=[corpus['small_workload']['scalar_items']]",
    "        if 'scalar' in spec['maximum_operations']: counts.append(corpus['envelopes']['scalar']['batch_items_max'])",
    "        for count in counts:",
    "            values=items(basis,count,1,0)",
    "            scalars=tuple(2**255+65537*i+1 for i in range(count))",
    "            value=context.scalar_batch(values,scalars,algorithm=bench_algorithm)",
    "            answer.append((spec['id'],count,packed(context,value)))",
    "    return tuple(answer)",
    "def run_progression():",
    "    answer=[]",
    "    for spec,context,basis in prepared:",
    "        counts=[corpus['small_workload']['progression_items']]",
    "        if 'progression' in spec['maximum_operations']: counts.append(corpus['envelopes']['progression']['batch_items_max'])",
    "        for count in counts:",
    "            value=context.progression_batch(basis[0],basis[1],count,algorithm=bench_algorithm,packed=True)",
    "            answer.append((spec['id'],count,tuple(value)))",
    "    return tuple(answer)",
    "exact={}; timings={}",
    "for operation,function in (('add',run_add),('scalar',run_scalar),('progression',run_progression)):",
    "    samples=[]; value=None",
    "    for repetition in range(repeat_count):",
    "        started=time.perf_counter(); value=function(); samples.append(1000*(time.perf_counter()-started))",
    "    exact[operation+'_sha256']=digest(value)",
    "    exact[operation+'_rows']=sum(len(row[2]) for row in value)",
    "    timings[operation]=samples",
    "record={",
    "  'algorithm':bench_algorithm,",
    "  'compiled':all(is_compiled(function) for function in (packed_cantor_add_batch,packed_cantor_progression_batch,packed_cantor_scalar_batch)),",
    "  'execution_modes':[execution_mode(function) for function in (packed_cantor_add_batch,packed_cantor_progression_batch,packed_cantor_scalar_batch)],",
    "  'case_fingerprints':[(spec['id'],context.model_fingerprint) for spec,context,basis in prepared],",
    "  'exact':exact,",
    "  'timings':timings,",
    "}",
    "base64.b64encode(json.dumps(record,sort_keys=True,separators=(',',':')).encode('utf-8')).decode('ascii')",
  ].join("\n");
}

async function workerMain(config, corpus) {
  const { createSage } = require(join(root, "dist", "tools", "kernel.js"));
  const session = await createSage();
  const started = performance.now();
  try {
    const result = await session.evaluate(workerSource(corpus, config.workerMode, config.repeat), {
      timeout: 3_600_000,
    });
    assert.match(result.repr, /^'[A-Za-z0-9+/=]+'$/);
    const payload = JSON.parse(Buffer.from(result.repr.slice(1, -1), "base64").toString("utf8"));
    return {
      ...payload,
      worker_wall_ms: performance.now() - started,
      rss_bytes: process.memoryUsage().rss,
    };
  } finally {
    session.close();
  }
}

function runWorker(config, mode) {
  const environment = {
    ...process.env,
    SAGEJS_NATIVE_CACHE_DIR: config.cacheRoot,
    SAGEJS_NATIVE_MODE: mode === "native" ? "auto" : "dynamic",
    SAGEJS_HYPERELLIPTIC_AUTO_RECEIPT_POLICY: "off",
  };
  delete environment.SAGEJS_NATIVE_DISABLE;
  delete environment.SAGEJS_NATIVE_REQUIRED;
  const result = command(process.execPath, [
    __filename,
    "--worker-mode",
    mode,
    "--cache-root",
    config.cacheRoot,
    "--repeat",
    String(config.repeat),
  ], { env: environment });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${mode} worker failed\n${result.stdout}\n${result.stderr}`);
  const marker = "SAGEJS_HYPERELLIPTIC_DOMAIN_WORKER ";
  const line = result.stdout.trim().split("\n").findLast((value) => value.startsWith(marker));
  assert(line, `${mode} worker emitted no result marker`);
  return { ...JSON.parse(line.slice(marker.length)), stderr: result.stderr.trim() };
}

function preflight() {
  const processCommand = platform() === "win32"
    ? [
        "powershell",
        [
          "-NoProfile",
          "-Command",
          "Get-Process | Sort-Object CPU -Descending | Select-Object -First 25 Id,CPU,WorkingSet,ProcessName",
        ],
      ]
    : ["ps", ["-eo", "pid,pcpu,pmem,comm", "--sort=-pcpu"]];
  const result = command(processCommand[0], processCommand[1], { timeout: 30_000 });
  return {
    load_average: loadavg(),
    processes: {
      command: [processCommand[0], ...processCommand[1]],
      status: result.status,
      error: result.error?.message ?? null,
      stdout: result.stdout,
      stderr: result.stderr,
    },
  };
}

async function coordinatorMain(config, corpus) {
  assert(existsSync(join(root, "dist", "tools", "kernel.js")), "run pnpm build first");
  const { compile } = require(join(root, "tools", "native-kernel.cjs"));
  const compilationStarted = performance.now();
  const compiled = await compile({ sourcePath: cantorSource, cacheRoot: config.cacheRoot });
  const compilationMs = performance.now() - compilationStarted;
  const dynamic = runWorker(config, "dynamic");
  const native = runWorker(config, "native");
  assert.equal(dynamic.compiled, false);
  assert.equal(native.compiled, true);
  assert.deepEqual(dynamic.case_fingerprints, native.case_fingerprints);
  assert.deepEqual(dynamic.exact, native.exact);
  const timing = {};
  for (const operation of ["add", "scalar", "progression"]) {
    const dynamicStats = statistics(dynamic.timings[operation]);
    const nativeStats = statistics(native.timings[operation]);
    assert(nativeStats.median < dynamicStats.median, `${operation} native path is not faster`);
    timing[operation] = {
      dynamic_ms: dynamicStats,
      native_ms: nativeStats,
      native_to_dynamic: nativeStats.median / dynamicStats.median,
    };
  }
  const candidate = readJson(policyPath);
  const sourceBundle = {
    ...generateSourceBundle(root, candidate.source_bundle_contract.paths),
    source_commit: git("rev-parse", "HEAD"),
  };
  const corpusBytes = readFileSync(corpusPath);
  const receipt = {
    schema: "sagejs.hyperelliptic-prime-cantor-domain-acceptance/v1",
    generated_at_utc: new Date().toISOString(),
    host: {
      hostname: hostname(),
      platform: platform(),
      architecture: arch(),
      os_release: release(),
      cpu_models: [...new Set(cpus().map((cpu) => cpu.model))],
      logical_cpus: cpus().length,
      total_memory_bytes: totalmem(),
      free_memory_bytes_before: freemem(),
      node: process.version,
      preflight: preflight(),
    },
    repository: {
      commit: git("rev-parse", "HEAD"),
      status: git("status", "--porcelain=v1"),
      harness_sha256: sha256(readFileSync(__filename)),
      corpus_sha256: sha256(corpusBytes),
      build_receipt_sha256: sha256(readFileSync(join(root, "dist", "build-receipt.json"))),
    },
    source_bundle: sourceBundle,
    corpus: {
      id: "prime-cantor-domain-v1",
      path: "bench/hyperelliptic/cross-platform/domain-corpus-v1.json",
      sha256: sha256(corpusBytes),
    },
    model_evidence: corpus.domain,
    envelope_evidence: corpus.envelopes,
    compilation: {
      wall_ms: compilationMs,
      cache_root: config.cacheRoot,
      cantor: compilationReceipt(compiled),
    },
    exact: dynamic.exact,
    timing,
    modes: { dynamic, native },
  };
  mkdirSync(dirname(config.output), { recursive: true });
  writeFileSync(config.output, `${JSON.stringify(receipt, null, 2)}\n`);
  process.stdout.write(`PASS ${receipt.schema} ${config.output}\n`);
}

const config = options(process.argv.slice(2));
const corpus = checkCorpus(readJson(corpusPath));
if (config.check) {
  process.stdout.write(`verified ${corpus.cases.length} branch-covering cases\n`);
} else if (config.workerMode !== null) {
  workerMain(config, corpus)
    .then((value) => process.stdout.write(`SAGEJS_HYPERELLIPTIC_DOMAIN_WORKER ${JSON.stringify(value)}\n`))
    .catch((error) => {
      process.stderr.write(`${error.stack || error}\n`);
      process.exitCode = 1;
    });
} else {
  coordinatorMain(config, corpus).catch((error) => {
    process.stderr.write(`${error.stack || error}\n`);
    process.exitCode = 1;
  });
}
