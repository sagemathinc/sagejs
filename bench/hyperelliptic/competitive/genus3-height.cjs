#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const os = require("node:os");
const { dirname, join, relative, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");

const repository = resolve(__dirname, "../../..");
const fixtureDirectory = join(repository, "test", "hyperelliptic-bsd-oracles");
const sageFixtureScript = join(fixtureDirectory, "sagejs-genus3-height-radius6.py");
const sageFixtureManifest = join(fixtureDirectory, "sagejs-genus3-height-radius6.json");
const magmaFixtureScript = join(fixtureDirectory, "magma-genus3-height.m");
const magmaFixtureManifest = join(fixtureDirectory, "magma-genus3-height.json");
const magmaFixtureTranscript = join(
  fixtureDirectory,
  "expected-magma-2.18-5-genus3-height.txt",
);
const magmaTimingScript = join(__dirname, "genus3-height-magma.m");

// This is the immediate integrated parent of the prepared-height change
// cd0378ba.  Its genus3_heights.py is the direct two-cube implementation.
const historicalCommit = "302bf8ccb3e3b71901e646f9ee75877d61640298";
const historicalGenus3SourceSha256 =
  "bbb249c85b0d915d578f52c25597781992c9ce060d2c1d942cc3ad78fc6c236a";
const expectedFixtureScriptSha256 =
  "b54ccb6868566a42c6f2103f6fe5387fdcc0f7ae95bcac2a3f296c6440be68d0";
const expectedMagmaScriptSha256 =
  "0452ac450ee1df366f303ed9bde2562628f28b1f96a15ec650bd816d79858e2a";
const expectedMagmaTranscriptSha256 =
  "34e37ec17ee9d4daa0dadfbd8bbf914c7129babf6f7d20b40d70b4e2c85acc10";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fileSha256(path) {
  return sha256(readFileSync(path));
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stable(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function command(executable, args = [], options = {}) {
  return spawnSync(executable, args, {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 3_600_000,
    ...options,
  });
}

function checkedCommand(executable, args = [], options = {}) {
  const result = command(executable, args, options);
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${args.join(" ")} failed (${result.status}):\n${result.stderr}\n${result.stdout}`,
    );
  }
  return result.stdout.trim();
}

function resolveExecutable(value) {
  if (value.includes("/")) return existsSync(value) ? realpathSync(value) : null;
  const result = command("bash", ["-lc", `command -v ${value}`]);
  return result.status === 0 && result.stdout.trim()
    ? realpathSync(result.stdout.trim())
    : null;
}

function parseKeyValues(output) {
  return Object.fromEntries(
    output
      .trimEnd()
      .split(/\r?\n/)
      .filter((line) => line.includes("="))
      .map((line) => {
        const split = line.indexOf("=");
        return [line.slice(0, split), line.slice(split + 1)];
      }),
  );
}

function parseNumberArray(text) {
  const value = text.trim();
  assert(value.startsWith("[") && value.endsWith("]"), `invalid array ${text}`);
  const body = value.slice(1, -1).trim();
  return body ? body.split(",").map((item) => Number(item.trim())) : [];
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function summarize(values) {
  if (!values?.length) return null;
  const center = median(values);
  return {
    median_ms: center,
    min_ms: Math.min(...values),
    max_ms: Math.max(...values),
    mad_ms: median(values.map((value) => Math.abs(value - center))),
    samples: values.length,
  };
}

function decimalParts(text) {
  const match = String(text).trim().match(/^([+-]?)(\d+)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/);
  if (!match) throw new Error(`invalid decimal ${text}`);
  const negative = match[1] === "-";
  const fraction = match[3] ?? "";
  const exponent = Number(match[4] ?? 0);
  const digits = BigInt(`${match[2]}${fraction}` || "0");
  return { integer: negative ? -digits : digits, scale: fraction.length - exponent };
}

function power10(exponent) {
  return 10n ** BigInt(exponent);
}

function decimalDifference(leftText, rightText) {
  const left = decimalParts(leftText);
  const right = decimalParts(rightText);
  const scale = Math.max(left.scale, right.scale);
  let difference =
    left.integer * power10(scale - left.scale) -
    right.integer * power10(scale - right.scale);
  if (difference < 0n) difference = -difference;
  return { integer: difference, scale };
}

function differenceAtMost(leftText, rightText, toleranceText) {
  const difference = decimalDifference(leftText, rightText);
  const tolerance = decimalParts(toleranceText);
  assert(tolerance.integer >= 0n, "tolerance must be nonnegative");
  const scale = Math.max(difference.scale, tolerance.scale);
  return (
    difference.integer * power10(scale - difference.scale) <=
    tolerance.integer * power10(scale - tolerance.scale)
  );
}

function scientificDifference(leftText, rightText) {
  const difference = decimalDifference(leftText, rightText);
  if (difference.integer === 0n) return "0";
  const digits = difference.integer.toString();
  const exponent = digits.length - difference.scale - 1;
  const tail = digits.slice(1).replace(/0+$/, "");
  return `${digits[0]}${tail ? `.${tail}` : ""}e${exponent >= 0 ? "+" : ""}${exponent}`;
}

function fixtureData() {
  const sage = JSON.parse(readFileSync(sageFixtureManifest, "utf8"));
  const magma = JSON.parse(readFileSync(magmaFixtureManifest, "utf8"));
  const transcript = parseKeyValues(readFileSync(magmaFixtureTranscript, "utf8"));
  assert.equal(sage.schema, "sagejs.hyperelliptic-bsd-oracle.genus3-height-radius6.v1");
  assert.equal(sage.classification, "slow numerical comparison; not rigorous");
  assert.equal(sage.script_sha256, expectedFixtureScriptSha256);
  assert.equal(fileSha256(sageFixtureScript), expectedFixtureScriptSha256);
  assert.equal(magma.schema, "sagejs.hyperelliptic-bsd-oracle.magma-genus3-height.v1");
  assert.equal(magma.version, "2.18-5");
  assert.equal(magma.classification, "external numerical oracle; not an interval proof");
  assert.equal(magma.script_sha256, expectedMagmaScriptSha256);
  assert.equal(magma.transcript_sha256, expectedMagmaTranscriptSha256);
  assert.equal(fileSha256(magmaFixtureScript), expectedMagmaScriptSha256);
  assert.equal(fileSha256(magmaFixtureTranscript), expectedMagmaTranscriptSha256);
  assert.equal(transcript.magma_version, "2.18-5");
  assert.equal(transcript.canonical_height_160, sage.output.magma_height);
  assert.equal(sage.theta_refinement_stable, true);
  assert.equal(sage.finite_plan_complete, true);
  assert.equal(sage.finite_exact, true);
  assert.equal(sage.rigorous, false);
  return { sage, magma, transcript };
}

function verifyHistoricalObject() {
  const source = checkedCommand("git", [
    "show",
    `${historicalCommit}:src/lib/sagejs/hyperelliptic_curves/genus3_heights.py`,
  ]);
  assert.equal(sha256(`${source}\n`), historicalGenus3SourceSha256);
  assert(source.includes("def _theta_sum("), "historical source lost the direct theta sum");
  assert(!source.includes("def _prepared_theta_lattice("), "historical source is already prepared");
}

function parseResource(stderr) {
  const match = stderr.match(
    /SJS_G3_RESOURCE\|max_rss_kib=(\d+)\|user_s=([0-9.]+)\|system_s=([0-9.]+)/,
  );
  return match
    ? {
        peak_rss_kib: Number(match[1]),
        user_seconds: Number(match[2]),
        system_seconds: Number(match[3]),
      }
    : { status: "unavailable", reason: "/usr/bin/time not installed" };
}

function timedCommand(executable, args, options = {}) {
  const marker = "SJS_G3_RESOURCE|max_rss_kib=%M|user_s=%U|system_s=%S";
  const hasTime = process.platform !== "win32" && existsSync("/usr/bin/time");
  const started = performance.now();
  const result = command(hasTime ? "/usr/bin/time" : executable, hasTime
    ? ["-f", marker, executable, ...args]
    : args, options);
  const wallMs = performance.now() - started;
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${executable} ${args.join(" ")} failed (${result.status}):\n${result.stderr}\n${result.stdout}`,
    );
  }
  return {
    stdout: result.stdout,
    stderr: result.stderr.replace(/SJS_G3_RESOURCE\|[^\n]*\n?/, "").trim(),
    outer_wall_ms: wallMs,
    resources: hasTime ? parseResource(result.stderr) : parseResource(""),
  };
}

function validateResult(actual, expectedOutput, magmaHeight) {
  assert.deepEqual(actual.candidate_primes, expectedOutput.candidate_primes.split(","));
  assert.deepEqual(
    actual.finite_coefficients,
    expectedOutput.finite_coefficients.split(","),
  );
  assert.equal(actual.archimedean, expectedOutput.archimedean);
  assert.equal(actual.finite, expectedOutput.finite);
  assert.equal(actual.height, expectedOutput.sagejs_height);
  assert.equal(actual.theta_refinement_stable, true);
  assert.equal(actual.archimedean_move_verified, true);
  assert.equal(actual.finite_plan_complete, true);
  assert.equal(actual.finite_exact, true);
  assert.equal(actual.rigorous, false);
  assert(
    differenceAtMost(actual.height, magmaHeight, "2e-20"),
    `height error ${scientificDifference(actual.height, magmaHeight)} exceeds 2e-20`,
  );
}

function currentProcessCold(fixtures) {
  const run = timedCommand(process.execPath, [
    join(repository, "bin", "sagejs-source.cjs"),
    "--python",
    sageFixtureScript,
  ]);
  const fields = parseKeyValues(run.stdout);
  for (const [key, value] of Object.entries(fixtures.sage.output)) {
    assert.equal(fields[key], String(value), key);
  }
  return {
    mode: "process-cold",
    contract: "Node/Sage.js startup through the full public radius-6 canonical-height answer",
    wall_samples_ms: [run.outer_wall_ms],
    wall: summarize([run.outer_wall_ms]),
    resources: run.resources,
    result: {
      height: fields.sagejs_height,
      archimedean: fields.archimedean,
      finite: fields.finite,
      candidate_primes: fields.candidate_primes.split(","),
      finite_coefficients: fields.finite_coefficients.split(","),
      theta_refinement_stable: fields.theta_refinement_stable === "true",
      finite_plan_complete: fields.finite_plan_complete === "true",
      finite_exact: fields.finite_exact === "true",
      rigorous: fields.rigorous === "true",
      magma_absolute_error: fields.absolute_error,
    },
  };
}

function pythonSource(configuration) {
  const expected = JSON.stringify(JSON.stringify(configuration.expected));
  return String.raw`
import json
import time
import sagejs as sage
import sagejs.hyperelliptic_curves.genus3_heights as heights
import sagejs.hyperelliptic_curves.periods as periods
from mpmath import mp
from sagejs.hyperelliptic_curves.model import HyperellipticCurve

EXPECTED = json.loads(${expected})
MAGMA_HEIGHT = EXPECTED["magma_height"]

def clear_height_caches():
    heights._NORMALIZED_ABEL_CACHE.clear()
    heights._ABEL_COORDINATE_PLAN_CACHE.clear()
    heights._THETA_PLAN_CACHE.clear()

def clear_all_caches():
    periods.clear_period_cache()
    clear_height_caches()

def make_divisor(suffix):
    ring = sage.PolynomialRing(sage.QQ, "x_g3_height_" + str(suffix))
    x_value = ring.gen()
    f_value = (x_value**7 - 9*x_value**6 + 28*x_value**5
        - 32*x_value**4 + x_value**3 + 17*x_value**2 - 6*x_value)
    curve = HyperellipticCurve(f_value, ring(1))
    divisor = curve.jacobian()([
        x_value*(x_value - 1)*(x_value - 2), ring(0)
    ])
    return curve, divisor

def call_public(divisor):
    return divisor.canonical_height(
        moving_x=3, prec=64, abel_max_refinements=6, theta_radius=6
    )

def call_prepared(move, period_result):
    return heights.automatic_split_mumford_canonical_height(
        move, period_result=period_result, prec=64,
        abel_max_refinements=6, theta_radius=6
    )

def encode(result):
    plan = result.finite_plan.require_complete()
    archimedean = result.pairing.archimedean
    certificate = archimedean.certificate
    records = certificate["abel_jacobi_normalization"]["records"]
    components = [component for record in records for component in record["components"]]
    theta_values = []
    for piece in certificate["theta_pieces"]:
        for term in piece["certificate"]["theta_terms"]:
            theta_values.append(term["theta_e1"])
            theta_values.append(term["theta_e2"])
    with mp.workprec(192):
        absolute_error = abs(mp.mpf(result.value) - mp.mpf(MAGMA_HEIGHT))
    return {
        "height": mp.nstr(result.value, 50),
        "archimedean": mp.nstr(archimedean.value, 50),
        "finite": mp.nstr(result.pairing.finite_value, 50),
        "candidate_primes": [str(prime) for prime in plan.support.primes],
        "finite_coefficients": [str(pairing.coefficient) for pairing in plan.pairings],
        "magma_absolute_error": mp.nstr(absolute_error, 30),
        "theta_refinement_stable": bool(result.archimedean_refinement_stable),
        "archimedean_move_verified": bool(result.archimedean_move_verified),
        "finite_plan_complete": bool(plan.complete),
        "finite_exact": bool(result.finite_exact),
        "rigorous": bool(result.rigorous),
        "period_cache_hit": bool(certificate["period_result"]["cache_hit"]),
        "abel_component_count": len(components),
        "abel_prepared_cache_hits": sum(1 for item in components if item["prepared_cache_hit"]),
        "theta_evaluation_count": len(theta_values),
        "theta_plan_cache_hits": sum(1 for item in theta_values if item["plan_cache_hit"]),
        "theta_exponential_evaluations": sum(item["exponential_evaluations"] for item in theta_values),
        "cache_sizes": {
            "normalized_abel": len(heights._NORMALIZED_ABEL_CACHE),
            "abel_coordinate": len(heights._ABEL_COORDINATE_PLAN_CACHE),
            "theta_plan": len(heights._THETA_PLAN_CACHE),
        },
    }

def validate(record):
    assert record["candidate_primes"] == EXPECTED["candidate_primes"].split(",")
    assert record["finite_coefficients"] == EXPECTED["finite_coefficients"].split(",")
    assert record["archimedean"] == EXPECTED["archimedean"]
    assert record["finite"] == EXPECTED["finite"]
    assert record["height"] == EXPECTED["sagejs_height"]
    assert record["theta_refinement_stable"]
    assert record["archimedean_move_verified"]
    assert record["finite_plan_complete"]
    assert record["finite_exact"]
    assert not record["rigorous"]

object_wall = []
object_cpu = []
object_result = None
for sample in range(${configuration.objectColdRepetitions}):
    clear_all_caches()
    started_wall = time.perf_counter()
    started_cpu = time.process_time()
    curve, divisor = make_divisor("cold_" + str(sample))
    value = call_public(divisor)
    object_cpu.append(1000*(time.process_time() - started_cpu))
    object_wall.append(1000*(time.perf_counter() - started_wall))
    record = encode(value)
    validate(record)
    if object_result is None:
        object_result = record
    else:
        assert record["height"] == object_result["height"]

prepared_setup_wall = []
prepared_setup_cpu = []
prepared_wall = []
prepared_cpu = []
prepared_result = None
prepared_state = None
for sample in range(${configuration.preparedRepetitions}):
    clear_all_caches()
    started_wall = time.perf_counter()
    started_cpu = time.process_time()
    curve, divisor = make_divisor("prepared_" + str(sample))
    move = heights.move_split_mumford_divisor(divisor, moving_x=3, max_search=128)
    period_result = periods.real_period(curve, prec=64)
    prepared_setup_cpu.append(1000*(time.process_time() - started_cpu))
    prepared_setup_wall.append(1000*(time.perf_counter() - started_wall))
    # Retain the explicit verified period object, but make Abel/theta
    # preparation cold for the timed first prepared height.
    periods._ABEL_CACHE.clear()
    clear_height_caches()
    started_wall = time.perf_counter()
    started_cpu = time.process_time()
    value = call_prepared(move, period_result)
    prepared_cpu.append(1000*(time.process_time() - started_cpu))
    prepared_wall.append(1000*(time.perf_counter() - started_wall))
    record = encode(value)
    validate(record)
    if prepared_result is None:
        prepared_result = record
    else:
        assert record["height"] == prepared_result["height"]
    prepared_state = (move, period_result)

for sample in range(${configuration.warmups}):
    validate(encode(call_prepared(prepared_state[0], prepared_state[1])))

warm_wall = []
warm_cpu = []
warm_result = None
for sample in range(${configuration.warmRepetitions}):
    started_wall = time.perf_counter()
    started_cpu = time.process_time()
    value = call_prepared(prepared_state[0], prepared_state[1])
    warm_cpu.append(1000*(time.process_time() - started_cpu))
    warm_wall.append(1000*(time.perf_counter() - started_wall))
    record = encode(value)
    validate(record)
    if warm_result is None:
        warm_result = record
    else:
        assert record["height"] == warm_result["height"]

payload = {
    "schema": "sagejs.hyperelliptic-genus3-height-resident.v1",
    "object_cold": {
        "wall_samples_ms": object_wall,
        "cpu_samples_ms": object_cpu,
        "result": object_result,
    },
    "prepared_first": {
        "setup_wall_samples_ms": prepared_setup_wall,
        "setup_cpu_samples_ms": prepared_setup_cpu,
        "wall_samples_ms": prepared_wall,
        "cpu_samples_ms": prepared_cpu,
        "result": prepared_result,
    },
    "warm": {
        "warmups": ${configuration.warmups},
        "wall_samples_ms": warm_wall,
        "cpu_samples_ms": warm_cpu,
        "result": warm_result,
    },
}
print("SAGEJS_GENUS3_HEIGHT_RESIDENT=" + json.dumps(payload, sort_keys=True))
True
`;
}

async function sageWorker() {
  const configuration = JSON.parse(process.env.SAGEJS_GENUS3_HEIGHT_REQUEST ?? "null");
  if (!configuration) throw new Error("missing SAGEJS_GENUS3_HEIGHT_REQUEST");
  const { createSage } = require(join(repository, "dist", "tools", "kernel.js"));
  const session = await createSage();
  try {
    const result = await session.evaluate(pythonSource(configuration), {
      timeout: 3_600_000,
    });
    process.stdout.write(result.stdout);
  } finally {
    await session.close();
  }
}

function residentCurrent(options, fixtures) {
  const configuration = {
    objectColdRepetitions: options.objectColdRepetitions,
    preparedRepetitions: options.preparedRepetitions,
    warmups: options.warmups,
    warmRepetitions: options.warmRepetitions,
    expected: fixtures.sage.output,
  };
  const run = timedCommand(process.execPath, [__filename, "--worker", "sagejs"], {
    env: {
      ...process.env,
      SAGEJS_GENUS3_HEIGHT_REQUEST: JSON.stringify(configuration),
    },
  });
  const line = run.stdout
    .trimEnd()
    .split(/\r?\n/)
    .find((value) => value.startsWith("SAGEJS_GENUS3_HEIGHT_RESIDENT="));
  if (!line) throw new Error(`resident worker produced no payload:\n${run.stdout}`);
  const payload = JSON.parse(line.slice("SAGEJS_GENUS3_HEIGHT_RESIDENT=".length));
  for (const mode of ["object_cold", "prepared_first", "warm"]) {
    validateResult(payload[mode].result, fixtures.sage.output, fixtures.sage.output.magma_height);
    payload[mode].wall = summarize(payload[mode].wall_samples_ms);
    payload[mode].cpu = summarize(payload[mode].cpu_samples_ms);
  }
  assert(
    payload.object_cold.result.theta_plan_cache_hits <
      payload.object_cold.result.theta_evaluation_count,
    "object-cold row unexpectedly reused every theta plan",
  );
  assert(
    payload.prepared_first.result.theta_plan_cache_hits <
      payload.prepared_first.result.theta_evaluation_count,
    "prepared-first row unexpectedly reused every theta plan",
  );
  assert.equal(
    payload.warm.result.theta_plan_cache_hits,
    payload.warm.result.theta_evaluation_count,
    "warm row did not reuse every theta plan",
  );
  assert.equal(
    payload.warm.result.abel_prepared_cache_hits,
    payload.warm.result.abel_component_count,
    "warm row did not reuse every normalized Abel component",
  );
  assert(
    payload.warm.result.theta_exponential_evaluations <
      payload.prepared_first.result.theta_exponential_evaluations,
    "warm theta row did not exclude plan-construction exponentials",
  );
  payload.prepared_first.setup_wall = summarize(
    payload.prepared_first.setup_wall_samples_ms,
  );
  payload.prepared_first.setup_cpu = summarize(
    payload.prepared_first.setup_cpu_samples_ms,
  );
  payload.resources = run.resources;
  payload.process_wall_ms = run.outer_wall_ms;
  return payload;
}

function validateHistoricalRoot(root) {
  const resolved = realpathSync(root);
  const commit = checkedCommand("git", ["rev-parse", "HEAD"], { cwd: resolved });
  assert.equal(commit, historicalCommit, "historical root has the wrong commit");
  const status = checkedCommand("git", ["status", "--short"], { cwd: resolved });
  assert.equal(status, "", "historical root has tracked or untracked changes");
  const sourcePath = join(
    resolved,
    "src",
    "lib",
    "sagejs",
    "hyperelliptic_curves",
    "genus3_heights.py",
  );
  assert.equal(fileSha256(sourcePath), historicalGenus3SourceSha256);
  const source = readFileSync(sourcePath, "utf8");
  assert(source.includes("def _theta_sum("));
  assert(!source.includes("def _prepared_theta_lattice("));
  const compiler = join(resolved, "dist", "tools", "kernel.js");
  const buildReceiptPath = join(resolved, "dist", "build-receipt.json");
  assert(
    existsSync(compiler) && existsSync(buildReceiptPath),
    "historical root needs `git submodule update --init --recursive`, " +
      "`pnpm install --frozen-lockfile`, `pnpm parallel:cache -- prepare`, and `pnpm build`",
  );
  const buildReceipt = JSON.parse(readFileSync(buildReceiptPath, "utf8"));
  assert.equal(buildReceipt.schema, "sagejs.build-receipt/v1");
  assert.equal(buildReceipt.identity.node, process.versions.node);
  assert.equal(buildReceipt.identity.platform, process.platform);
  assert.equal(buildReceipt.identity.architecture, process.arch);
  return { root: resolved, buildReceiptPath, buildReceipt };
}

function historicalReplay(root, currentFixtures) {
  const historical = validateHistoricalRoot(root);
  const resolved = historical.root;
  const manifestPath = join(
    resolved,
    "test",
    "hyperelliptic-bsd-oracles",
    "sagejs-genus3-height-radius6.json",
  );
  const scriptPath = join(
    resolved,
    "test",
    "hyperelliptic-bsd-oracles",
    "sagejs-genus3-height-radius6.py",
  );
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  assert.equal(fileSha256(scriptPath), expectedFixtureScriptSha256);
  assert.equal(manifest.script_sha256, expectedFixtureScriptSha256);
  assert.equal(manifest.rigorous, false);
  assert.equal(manifest.theta_refinement_stable, true);
  assert.equal(manifest.finite_plan_complete, true);
  assert.equal(manifest.finite_exact, true);
  const run = timedCommand(
    process.execPath,
    [join(resolved, "bin", "sagejs-source.cjs"), "--python", scriptPath],
    { cwd: resolved },
  );
  const fields = parseKeyValues(run.stdout);
  for (const [key, value] of Object.entries(manifest.output)) {
    assert.equal(fields[key], String(value), `historical ${key}`);
  }
  assert.equal(fields.candidate_primes, currentFixtures.sage.output.candidate_primes);
  assert.equal(
    fields.finite_coefficients,
    currentFixtures.sage.output.finite_coefficients,
  );
  assert(differenceAtMost(fields.sagejs_height, fields.magma_height, "2e-20"));
  return {
    mode: "historical-direct-process-cold",
    contract: "exact preoptimization checkout startup through the identical public fixture script",
    commit: historicalCommit,
    source_sha256: historicalGenus3SourceSha256,
    fixture_script_sha256: expectedFixtureScriptSha256,
    build_receipt_sha256: fileSha256(historical.buildReceiptPath),
    build_identity: historical.buildReceipt.identity,
    algorithm_witness: "def _theta_sum; no _prepared_theta_lattice",
    wall_samples_ms: [run.outer_wall_ms],
    wall: summarize([run.outer_wall_ms]),
    resources: run.resources,
    result: {
      height: fields.sagejs_height,
      archimedean: fields.archimedean,
      finite: fields.finite,
      candidate_primes: fields.candidate_primes.split(","),
      finite_coefficients: fields.finite_coefficients.split(","),
      magma_absolute_error: fields.absolute_error,
      theta_refinement_stable: fields.theta_refinement_stable === "true",
      finite_plan_complete: fields.finite_plan_complete === "true",
      finite_exact: fields.finite_exact === "true",
      rigorous: fields.rigorous === "true",
    },
  };
}

function magmaInput(mode, options) {
  const script = magmaTimingScript.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
  return [
    `SageJSGenus3HeightMode := "${mode}";`,
    `SageJSGenus3HeightColdRepetitions := ${options.magmaColdRepetitions};`,
    `SageJSGenus3HeightWarmups := ${options.magmaWarmups};`,
    `SageJSGenus3HeightWarmRepetitions := ${options.magmaWarmRepetitions};`,
    `load "${script}";`,
    "",
  ].join("\n");
}

function runMagma(options, fixtures) {
  const executable = resolveExecutable(options.magma);
  if (!executable) throw new Error(`Magma executable not found: ${options.magma}`);
  const processCold = timedCommand(executable, ["-b"], {
    input: magmaInput("process-cold", options),
  });
  const processFields = parseKeyValues(processCold.stdout);
  assert.equal(processFields.mode, "process-cold");
  assert(differenceAtMost(processFields.height, fixtures.sage.output.magma_height, "2e-20"));

  const resident = timedCommand(executable, ["-b"], {
    input: magmaInput("resident", options),
  });
  const fields = parseKeyValues(resident.stdout);
  assert.equal(fields.mode, "resident");
  assert.equal(fields.magma_version, "2.18-5");
  assert.equal(fields.completion_map, "Y=2*y+1");
  assert.equal(fields.completed_model, "Y^2=1+4*f(x)");
  assert.equal(fields.precision_decimal_digits, "21");
  assert.equal(fields.height_50, fixtures.transcript.canonical_height_50);
  assert(differenceAtMost(fields.height, fixtures.sage.output.magma_height, "2e-20"));
  const coldWall = parseNumberArray(fields.object_cold_wall_ms);
  const coldCpu = parseNumberArray(fields.object_cold_cpu_ms);
  const warmWall = parseNumberArray(fields.warm_wall_ms);
  const warmCpu = parseNumberArray(fields.warm_cpu_ms);
  return {
    backend: {
      id: "magma",
      version: fields.magma_version,
      executable,
      executable_sha256: fileSha256(executable),
      timing_classification: "descriptive/non-gating",
    },
    comparison_contract: {
      comparable: "same canonical-height scalar, curve isomorphism, normalization, and at least 64-bit decimal accuracy",
      not_comparable: "Magma exposes neither Sage.js's exact finite-plan certificate nor its radius-refinement witness",
      timing_use: "descriptive only; no Sage.js/Magma speed gate is asserted",
      magma_rigorous: false,
      magma_accuracy_label: "external numerical oracle; not an interval proof",
      sagejs_rigorous: false,
      sagejs_accuracy_label: "radius-refinement-stable; truncation and rounding not enclosed",
    },
    process_cold: {
      wall_samples_ms: [processCold.outer_wall_ms],
      wall: summarize([processCold.outer_wall_ms]),
      inner_wall_ms: Number(processFields.inner_wall_ms),
      inner_cpu_ms: Number(processFields.inner_cpu_ms),
      resources: processCold.resources,
      result: { height: processFields.height },
    },
    object_cold: {
      wall_samples_ms: coldWall,
      cpu_samples_ms: coldCpu,
      wall: summarize(coldWall),
      cpu: summarize(coldCpu),
    },
    warm: {
      warmups: Number(fields.warmups),
      wall_samples_ms: warmWall,
      cpu_samples_ms: warmCpu,
      wall: summarize(warmWall),
      cpu: summarize(warmCpu),
    },
    resources: resident.resources,
    result: {
      height: fields.height,
      height_50: fields.height_50,
      oracle_absolute_error: scientificDifference(
        fields.height,
        fixtures.sage.output.magma_height,
      ),
      precision_decimal_digits: Number(fields.precision_decimal_digits),
      rigorous: false,
    },
  };
}

function shellCapture(text) {
  const result = command("bash", ["-lc", text]);
  return {
    command: text,
    status: result.status,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
  };
}

function preflight() {
  return {
    captured_at_utc: new Date().toISOString(),
    hostname: os.hostname(),
    platform: os.platform(),
    release: os.release(),
    architecture: os.arch(),
    cpu: os.cpus()[0]?.model,
    logical_cpus: os.cpus().length,
    total_memory_bytes: os.totalmem(),
    free_memory_bytes: os.freemem(),
    node: process.version,
    commands: [
      shellCapture("uptime"),
      shellCapture("uname -a"),
      shellCapture("lscpu"),
      shellCapture("free -b"),
      shellCapture("ps -eo pid,ppid,comm,%cpu,%mem,rss --sort=-%cpu | head -25"),
      shellCapture(
        'for f in /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor; do test -r "$f" && printf "%s=" "$f" && cat "$f"; done',
      ),
    ],
    algorithm_environment: Object.fromEntries(
      Object.entries(process.env)
        .filter(([key]) => /^(OMP|OPENBLAS|MKL|FLINT|SAGEJS|NODE_OPTIONS)/.test(key))
        .sort(),
    ),
  };
}

function renderReport(receipt) {
  const currentProcess = receipt.sagejs.process_cold?.wall?.median_ms;
  const historical = receipt.historical_direct?.wall?.median_ms;
  const speedup = receipt.validation.same_host_process_cold_speedup;
  const row = (label, data, note) =>
    `| ${label} | ${data?.wall?.median_ms?.toFixed(2) ?? "unavailable"} | ${data?.wall?.mad_ms?.toFixed(2) ?? "unavailable"} | ${data?.wall?.samples ?? 0} | ${note} |`;
  const speedupText = speedup === null ? "not evaluated" : `${speedup.toFixed(2)}x`;
  const gateText = receipt.validation.fivefold_exit_gate === null
    ? "was not evaluated in this diagnostic run"
    : receipt.validation.fivefold_exit_gate
      ? "passes"
      : "does not pass";
  return `# Genus-3 radius-6 height acceptance — Linux x64

Source commit: \`${receipt.source.commit}\`

Host: \`${receipt.host.hostname}\` (${receipt.host.cpu})

Node: \`${receipt.host.node}\`

The Sage.js rows all return the complete public canonical height with the exact
finite plan replayed.  The result is refinement-stable but nonrigorous:
\`theta_refinement_stable=true\`, \`finite_exact=true\`, and
\`rigorous=false\`.  “Prepared first” excludes construction of the explicitly
verified period object but still includes the full exact finite plan and the
first Abel/theta preparation.  “Warm” is arithmetic with bounded plan/lift
cache reuse, never a cached canonical-height result.

| Workload | Median wall ms | MAD ms | Samples | Contract |
|---|---:|---:|---:|---|
${row("Sage.js process cold", receipt.sagejs.process_cold, "startup through public answer")}
${row("Sage.js object cold", receipt.sagejs.resident.object_cold, "new curve/divisor; caches cleared")}
${row("Sage.js prepared first", receipt.sagejs.resident.prepared_first, "verified period supplied; Abel/theta cold")}
${row("Sage.js warm", receipt.sagejs.resident.warm, "prepared arithmetic; no result-cache hit")}
${row("Historical direct process cold", receipt.historical_direct, `exact ${historicalCommit.slice(0, 12)} checkout`)}
${row("Magma process cold", receipt.magma?.process_cold, "descriptive/non-gating")}
${row("Magma object cold", receipt.magma?.object_cold, "descriptive/non-gating")}
${row("Magma warm", receipt.magma?.warm, "descriptive/non-gating")}

The same-host process-cold speedup is **${speedupText}**
(${historical?.toFixed(2) ?? "unavailable"} ms direct versus
${currentProcess?.toFixed(2) ?? "unavailable"} ms prepared).  The Phase-8 5x
gate therefore ${gateText}.

Sage.js gives
\`${receipt.sagejs.resident.warm.result.height}\`; the pinned Magma oracle gives
\`${receipt.fixtures.magma_height}\`.  The Sage.js absolute error is
\`${receipt.sagejs.resident.warm.result.magma_absolute_error}\`.

Magma timings are deliberately descriptive and non-gating.  Its transported
model \`Y^2 = 1 + 4*f(x)\` computes the same canonical-height scalar and the
21-decimal-digit row matches the requested 64-bit accuracy, but Magma 2.18-5
does not expose an exact finite-plan certificate or Sage.js's radius-refinement
witness.  Neither backend is labeled rigorous.
`;
}

function finalizeReceipt(receipt, options, sourceStatus, reportRenderer = renderReport) {
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;
  if (options.output) writeFileSync(options.output, serialized);
  else process.stdout.write(serialized);
  if (options.report) writeFileSync(options.report, reportRenderer(receipt));

  if (receipt.acceptance) {
    assert.equal(sourceStatus, "", "acceptance receipt requires a clean source tree");
    assert(
      receipt.validation.fivefold_exit_gate,
      `same-host speedup ${receipt.validation.same_host_process_cold_speedup} is below 5x`,
    );
  }
}

function verifyFailedGateSerialization() {
  const temporaryDirectory = mkdtempSync(
    join(os.tmpdir(), "sagejs-genus3-height-finalize-"),
  );
  const output = join(temporaryDirectory, "receipt.json");
  const report = join(temporaryDirectory, "report.md");
  const receipt = {
    schema: "sagejs.hyperelliptic-genus3-height-acceptance.v1",
    acceptance: true,
    validation: {
      same_host_process_cold_speedup: 4.5,
      fivefold_exit_gate: false,
    },
  };
  try {
    assert.throws(
      () => finalizeReceipt(receipt, { output, report }, "", () => "failed gate\n"),
      /same-host speedup 4\.5 is below 5x/,
    );
    assert.deepEqual(JSON.parse(readFileSync(output, "utf8")), receipt);
    assert.equal(readFileSync(report, "utf8"), "failed gate\n");
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

function parseArguments() {
  const options = {
    check: false,
    worker: null,
    smoke: false,
    skipProcessCold: false,
    skipHistorical: false,
    skipMagma: false,
    historicalRoot: null,
    magma: process.env.MAGMA ?? "/home/user/bin/magma",
    output: null,
    report: null,
    objectColdRepetitions: 3,
    preparedRepetitions: 3,
    warmups: 1,
    warmRepetitions: 5,
    magmaColdRepetitions: 3,
    magmaWarmups: 1,
    magmaWarmRepetitions: 5,
  };
  for (let index = 2; index < process.argv.length; index += 1) {
    const value = process.argv[index];
    if (value === "--check") options.check = true;
    else if (value === "--worker") options.worker = process.argv[++index];
    else if (value === "--smoke") options.smoke = true;
    else if (value === "--skip-process-cold") options.skipProcessCold = true;
    else if (value === "--skip-historical") options.skipHistorical = true;
    else if (value === "--skip-magma") options.skipMagma = true;
    else if (value === "--historical-root") options.historicalRoot = resolve(process.argv[++index]);
    else if (value === "--magma") options.magma = process.argv[++index];
    else if (value === "--output") options.output = resolve(process.argv[++index]);
    else if (value === "--report") options.report = resolve(process.argv[++index]);
    else if (value === "--object-cold-repetitions") options.objectColdRepetitions = Number(process.argv[++index]);
    else if (value === "--prepared-repetitions") options.preparedRepetitions = Number(process.argv[++index]);
    else if (value === "--warmups") options.warmups = Number(process.argv[++index]);
    else if (value === "--warm-repetitions") options.warmRepetitions = Number(process.argv[++index]);
    else if (value === "--help") {
      process.stdout.write(`Usage: node ${relative(repository, __filename)} [options]\n\n` +
        "  --check                    validate pinned sources without timing\n" +
        "  --historical-root PATH     prepared clean checkout at the pinned direct commit\n" +
        "  --output PATH              write the machine-readable receipt\n" +
        "  --report PATH              write the Markdown report\n" +
        "  --smoke                    use one sample for each resident row\n" +
        "  --skip-process-cold        diagnostic only\n" +
        "  --skip-historical          diagnostic only\n" +
        "  --skip-magma               diagnostic only\n");
      process.exit(0);
    } else throw new Error(`unknown argument ${value}`);
  }
  if (options.smoke) {
    options.objectColdRepetitions = 1;
    options.preparedRepetitions = 1;
    options.warmups = 0;
    options.warmRepetitions = 1;
    options.magmaColdRepetitions = 1;
    options.magmaWarmups = 0;
    options.magmaWarmRepetitions = 1;
  }
  for (const key of [
    "objectColdRepetitions",
    "preparedRepetitions",
    "warmRepetitions",
    "magmaColdRepetitions",
    "magmaWarmRepetitions",
  ]) {
    if (!Number.isInteger(options[key]) || options[key] < 1) {
      throw new Error(`${key} must be a positive integer`);
    }
  }
  for (const key of ["warmups", "magmaWarmups"]) {
    if (!Number.isInteger(options[key]) || options[key] < 0) {
      throw new Error(`${key} must be a nonnegative integer`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments();
  if (options.worker) {
    if (options.worker !== "sagejs") throw new Error(`unknown worker ${options.worker}`);
    await sageWorker();
    return;
  }
  const fixtures = fixtureData();
  verifyHistoricalObject();
  assert(existsSync(magmaTimingScript));
  if (options.check) {
    verifyFailedGateSerialization();
    process.stdout.write(
      `Genus-3 height benchmark sources verified (${expectedFixtureScriptSha256.slice(0, 12)}, historical ${historicalCommit.slice(0, 12)}, timing ${fileSha256(magmaTimingScript).slice(0, 12)})\n`,
    );
    return;
  }
  if (!options.skipHistorical && !options.historicalRoot) {
    throw new Error("--historical-root is required unless --skip-historical is used");
  }

  const sourceCommit = checkedCommand("git", ["rev-parse", "HEAD"]);
  const sourceStatus = checkedCommand("git", ["status", "--short"]);
  const currentBuildReceiptPath = join(repository, "dist", "build-receipt.json");
  assert(existsSync(currentBuildReceiptPath), "current root needs a complete `pnpm build`");
  const currentBuildReceipt = JSON.parse(readFileSync(currentBuildReceiptPath, "utf8"));
  assert.equal(currentBuildReceipt.schema, "sagejs.build-receipt/v1");
  assert.equal(currentBuildReceipt.identity.node, process.versions.node);
  const receipt = {
    schema: "sagejs.hyperelliptic-genus3-height-acceptance.v1",
    generated_at_utc: new Date().toISOString(),
    acceptance: !options.skipProcessCold && !options.skipHistorical && !options.skipMagma,
    source: {
      commit: sourceCommit,
      status: sourceStatus,
      harness: relative(repository, __filename),
      harness_sha256: fileSha256(__filename),
      magma_timing_script: relative(repository, magmaTimingScript),
      magma_timing_script_sha256: fileSha256(magmaTimingScript),
      genus3_heights_sha256: fileSha256(
        join(repository, "src", "lib", "sagejs", "hyperelliptic_curves", "genus3_heights.py"),
      ),
      build_receipt_sha256: fileSha256(currentBuildReceiptPath),
      build_identity: currentBuildReceipt.identity,
    },
    fixtures: {
      sagejs_script_sha256: expectedFixtureScriptSha256,
      sagejs_manifest_sha256: fileSha256(sageFixtureManifest),
      magma_script_sha256: expectedMagmaScriptSha256,
      magma_transcript_sha256: expectedMagmaTranscriptSha256,
      magma_height: fixtures.sage.output.magma_height,
      requested_precision_bits: 64,
      abel_max_refinements: 6,
      theta_radius: 6,
      classification: fixtures.sage.classification,
    },
    timing_contract: {
      process_cold: "executable startup through one full public answer",
      object_cold: "resident runtime; caches cleared; new ring, curve, Jacobian, divisor, and first full public answer",
      prepared_first: "explicit verified period construction excluded; exact finite replay and first Abel/theta preparation included",
      warm: "same move and verified period; exact finite replay and theta arithmetic repeated; no canonical-height result cache",
      historical_direct: `one process-cold exact checkout at ${historicalCommit}; identical fixture script`,
      statistics: "median, minimum, maximum, and median absolute deviation; wall and mathematical-process CPU samples",
    },
    sample_policy: {
      diagnostic_smoke: options.smoke,
      sagejs_object_cold_repetitions: options.objectColdRepetitions,
      sagejs_prepared_first_repetitions: options.preparedRepetitions,
      sagejs_warmups: options.warmups,
      sagejs_warm_repetitions: options.warmRepetitions,
      historical_direct_repetitions: options.skipHistorical ? 0 : 1,
      magma_object_cold_repetitions: options.skipMagma ? 0 : options.magmaColdRepetitions,
      magma_warmups: options.skipMagma ? 0 : options.magmaWarmups,
      magma_warm_repetitions: options.skipMagma ? 0 : options.magmaWarmRepetitions,
    },
    host: preflight(),
    sagejs: {
      backend: {
        id: "sagejs",
        node: process.version,
        numerical_classification:
          "radius-refinement-stable; truncation and rounding not enclosed",
        rigorous: false,
        finite_contract: "exact complete finite-plan replay",
      },
      process_cold: options.skipProcessCold ? null : currentProcessCold(fixtures),
      resident: residentCurrent(options, fixtures),
    },
    historical_direct: options.skipHistorical
      ? null
      : historicalReplay(options.historicalRoot, fixtures),
    magma: options.skipMagma ? null : runMagma(options, fixtures),
    validation: {},
  };

  const currentResult = receipt.sagejs.resident.warm.result;
  validateResult(currentResult, fixtures.sage.output, fixtures.sage.output.magma_height);
  const historicalResult = receipt.historical_direct?.result;
  if (historicalResult) {
    assert.equal(historicalResult.finite_exact, true);
    assert.equal(historicalResult.finite_plan_complete, true);
    assert.equal(historicalResult.theta_refinement_stable, true);
    assert.equal(historicalResult.rigorous, false);
  }
  const currentMs = receipt.sagejs.process_cold?.wall?.median_ms;
  const historicalMs = receipt.historical_direct?.wall?.median_ms;
  const speedup = currentMs && historicalMs ? historicalMs / currentMs : null;
  receipt.validation = {
    exact_finite_replay: true,
    finite_support_digest: sha256(
      stable({
        candidate_primes: currentResult.candidate_primes,
        finite_coefficients: currentResult.finite_coefficients,
      }),
    ),
    refinement_stable: true,
    rigorous: false,
    current_magma_absolute_error: currentResult.magma_absolute_error,
    current_magma_error_at_most_2e_20: differenceAtMost(
      currentResult.height,
      fixtures.sage.output.magma_height,
      "2e-20",
    ),
    historical_magma_error_at_most_2e_20: historicalResult
      ? differenceAtMost(
          historicalResult.height,
          fixtures.sage.output.magma_height,
          "2e-20",
        )
      : null,
    same_host_process_cold_speedup: speedup,
    fivefold_exit_gate: speedup === null ? null : speedup >= 5,
    magma_timing_gate: "not-applicable; descriptive/non-gating",
  };

  finalizeReceipt(receipt, options, sourceStatus);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
