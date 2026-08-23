#!/usr/bin/env node
"use strict";

// Equal-contract resident benchmark for the public/prepared prime-field
// genus-2/3 Jacobian group law and Magma.  The acceptance defaults deliberately
// keep cheap operation loops well above Magma's 10 ms Realtime resolution.

const { createHash } = require("node:crypto");
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const repository = resolve(__dirname, "../../..");
const sagejs = resolve(repository, "bin/sagejs");
const harnessPath = resolve(__filename);

const cases = [
  {
    id: "g2-p1009",
    genus: 2,
    prime: 1009,
    f: [1, 1, 0, 0, 0, 1],
    h: [],
    left: { u: [0, 1003, 1], v: [1, 689], row: [2, 0, 1003, 1, 0, 1, 689, 0] },
    right: { u: [680, 931, 1], v: [66, 785], row: [2, 680, 931, 1, 0, 66, 785, 0] },
    expected: {
      add: { u: [507, 944, 1], v: [113, 633], row: [2, 507, 944, 1, 0, 113, 633, 0] },
      double: { u: [843, 270, 1], v: [201, 988], row: [2, 843, 270, 1, 0, 201, 988, 0] },
      scalar: { u: [169, 7, 1], v: [1001, 957], row: [2, 169, 7, 1, 0, 1001, 957, 0] },
    },
  },
  {
    id: "g3-p1009",
    genus: 3,
    prime: 1009,
    f: [1, 2, 0, 0, 0, 0, 0, 1],
    h: [],
    left: { u: [0, 997, 1], v: [1, 842], row: [2, 0, 997, 1, 0, 1, 842, 0] },
    right: { u: [990, 928, 1], v: [414, 429], row: [2, 990, 928, 1, 0, 414, 429, 0] },
    expected: {
      add: { u: [724, 967, 255, 1], v: [184, 196, 185], row: [3, 724, 967, 255, 1, 184, 196, 185] },
      double: { u: [944, 75, 429, 1], v: [71, 304, 193], row: [3, 944, 75, 429, 1, 71, 304, 193] },
      scalar: { u: [720, 837, 548, 1], v: [727, 139, 915], row: [3, 720, 837, 548, 1, 727, 139, 915] },
    },
  },
];

const scalar = "57896044618658097711785492504343953926634992332820282019728792003956564885506";

function parseArguments(argv) {
  const options = {
    cheapIterations: 100_000,
    scalarIterations: 1_000,
    samples: 7,
    warmups: 2,
    magma: process.env.MAGMA ?? "/home/user/bin/magma",
    noMagma: false,
    output: null,
    printMagmaSource: false,
    printSageSource: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const nextInteger = (name) => {
      const value = Number(argv[++index]);
      if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${name} must be a positive safe integer`);
      return value;
    };
    if (argument === "--cheap-iterations") options.cheapIterations = nextInteger(argument);
    else if (argument === "--scalar-iterations") options.scalarIterations = nextInteger(argument);
    else if (argument === "--samples") options.samples = nextInteger(argument);
    else if (argument === "--warmups") options.warmups = nextInteger(argument);
    else if (argument === "--magma") options.magma = argv[++index];
    else if (argument === "--no-magma") options.noMagma = true;
    else if (argument === "--output") options.output = resolve(argv[++index]);
    else if (argument === "--print-magma-source") options.printMagmaSource = true;
    else if (argument === "--print-sage-source") options.printSageSource = true;
    else throw new Error(`unknown argument ${argument}`);
  }
  return options;
}

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: repository,
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    timeout: 30 * 60 * 1000,
    ...options,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status}):\n${result.stderr}\n${result.stdout}`);
  return result;
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function timingSummary(samplesNs, itemCount) {
  const middle = median(samplesNs);
  const deviations = samplesNs.map((value) => Math.abs(value - middle));
  return {
    samples_ns: samplesNs,
    median_ns: middle,
    min_ns: Math.min(...samplesNs),
    max_ns: Math.max(...samplesNs),
    mad_ns: median(deviations),
    item_count: itemCount,
    median_ns_per_item: middle / itemCount,
  };
}

function polynomial(variable, coefficients) {
  return coefficients.map((coefficient, degree) => `(${coefficient})*${variable}^${degree}`).join("+") || "0";
}

function magmaPoint(name, point, variable) {
  return `${name}![${polynomial(variable, point.u)},${polynomial(variable, point.v)}]`;
}

function magmaSource(options) {
  const blocks = [];
  for (const caseData of cases) {
    const name = caseData.id.replaceAll("-", "_");
    const variable = `${name}x`;
    const field = `${name}F`;
    const ring = `${name}R`;
    const curve = `${name}C`;
    const jacobian = `${name}J`;
    blocks.push(`${field}:=GF(${caseData.prime}); ${ring}<${variable}>:=PolynomialRing(${field});
${curve}:=HyperellipticCurve(${polynomial(variable, caseData.f)}); ${jacobian}:=Jacobian(${curve});
${name}P:=${magmaPoint(jacobian, caseData.left, variable)};
${name}Q:=${magmaPoint(jacobian, caseData.right, variable)};`);
    for (const operation of ["add", "double", "scalar"]) {
      const iterations = operation === "scalar" ? options.scalarIterations : options.cheapIterations;
      const expression = operation === "add"
        ? `${name}P+${name}Q`
        : operation === "double"
          ? `${name}P+${name}P`
          : `(${scalar})*${name}P`;
      blocks.push(`${name}_${operation}_times:=[];
for warmup in [1..${options.warmups}] do ${name}_${operation}_value:=${expression}; end for;
for sample in [1..${options.samples}] do
  started:=Realtime();
  for item in [1..${iterations}] do ${name}_${operation}_value:=${expression}; end for;
  Append(~${name}_${operation}_times,1000000000*Realtime(started));
end for;
${name}_${operation}_uv,${name}_${operation}_d:=Eltseq(${name}_${operation}_value);
${name}_${operation}_u:=[Integers()!Coefficient(${name}_${operation}_uv[1],degree):degree in [0..Degree(${name}_${operation}_uv[1])]];
${name}_${operation}_v:=[Integers()!Coefficient(${name}_${operation}_uv[2],degree):degree in [0..Degree(${name}_${operation}_uv[2])]];
printf "SJS_FINITE|${caseData.id}|${operation}|%o|%o|%o|%o\\n",${name}_${operation}_times,${name}_${operation}_u,${name}_${operation}_v,${name}_${operation}_d;`);
    }
  }
  return [
    "SetColumns(0); SetSeed(20260823);",
    'major,minor,patch:=GetVersion(); printf "SJS_VERSION|%o.%o.%o\\n",major,minor,patch;',
    ...blocks,
    "quit;",
  ].join("\n");
}

function sageSource(options) {
  const payload = JSON.stringify({ cases, scalar, options: {
    cheap_iterations: options.cheapIterations,
    scalar_iterations: options.scalarIterations,
    samples: options.samples,
    warmups: options.warmups,
  } });
  return String.raw`
import json
import time

payload = json.loads(${JSON.stringify(payload)})


def coefficients(polynomial):
    return [int(value.lift()) for value in polynomial.list()]


def divisor_data(divisor):
    u_value, v_value = divisor.uv()
    return {"u": coefficients(u_value), "v": coefficients(v_value)}


def time_mode(function, expected, item_count):
    value = None
    for _warmup in range(payload["options"]["warmups"]):
        value = function()
    samples = []
    for _sample in range(payload["options"]["samples"]):
        started = time.perf_counter_ns()
        value = function()
        samples.append(time.perf_counter_ns() - started)
    # Observing one result is deliberately outside the timed interval.  In
    # particular, indexing a sealed packed batch may copy its storage, and the
    # Magma side likewise observes its final Mumford result after timing.
    result = divisor_data(value[0])
    assert result == expected
    return {"samples_ns": samples, "item_count": item_count, "result": result}


rows = []
for case in payload["cases"]:
    prime = int(case["prime"])
    ring = PolynomialRing(GF(prime), "x")
    curve = HyperellipticCurve(ring(case["f"]), ring(case["h"]))
    jacobian = curve.jacobian()
    maximum = max(
        payload["options"]["cheap_iterations"],
        payload["options"]["scalar_iterations"],
    )
    context = jacobian.prepared_arithmetic(
        algorithm="native", max_batch_items=maximum
    )
    reference = jacobian.prepared_arithmetic(
        algorithm="reference", max_batch_items=maximum
    )
    public_left = jacobian([ring(case["left"]["u"]), ring(case["left"]["v"])])
    public_right = jacobian([ring(case["right"]["u"]), ring(case["right"]["v"])])
    retained_left = context.unpack(tuple(case["left"]["row"]))
    retained_right = context.unpack(tuple(case["right"]["row"]))
    cheap_count = payload["options"]["cheap_iterations"]
    scalar_count = payload["options"]["scalar_iterations"]
    public_cheap_left = tuple(retained_left for _index in range(cheap_count))
    public_cheap_right = tuple(retained_right for _index in range(cheap_count))
    public_scalar_left = tuple(retained_left for _index in range(scalar_count))
    cheap_left = context.prepare_batch(public_cheap_left)
    cheap_right = context.prepare_batch(public_cheap_right)
    scalar_left = context.prepare_batch(public_scalar_left)
    scalar_values = tuple(int(payload["scalar"]) for _index in range(scalar_count))

    def ordinary_add():
        value = context.add_batch(
            public_cheap_left, public_cheap_right, algorithm="native"
        )
        assert value.published_count == 0
        return value

    def ordinary_double():
        value = context.double_batch(public_cheap_left, algorithm="native")
        assert value.published_count == 0
        return value

    def ordinary_scalar():
        value = context.scalar_batch(
            public_scalar_left, scalar_values, algorithm="native"
        )
        assert value.published_count == 0
        return value

    def retained_add():
        value = context.add_batch(cheap_left, cheap_right, algorithm="native")
        assert value.published_count == 0
        return value

    def retained_double():
        value = context.double_batch(cheap_left, algorithm="native")
        assert value.published_count == 0
        return value

    def retained_scalar():
        value = context.scalar_batch(
            scalar_left, scalar_values, algorithm="native"
        )
        assert value.published_count == 0
        return value

    def materialized_add():
        value = context.add_batch(
            cheap_left, cheap_right, algorithm="native", materialize=True
        )
        assert len(value) == cheap_count and value[0].is_materialized()
        return value

    def materialized_double():
        value = context.double_batch(
            cheap_left, algorithm="native", materialize=True
        )
        assert len(value) == cheap_count and value[0].is_materialized()
        return value

    def materialized_scalar():
        value = context.scalar_batch(
            scalar_left,
            scalar_values,
            algorithm="native",
            materialize=True,
        )
        assert len(value) == scalar_count and value[0].is_materialized()
        return value

    expected = case["expected"]
    reference_results = {
        "add": divisor_data(reference.add_batch(
            (public_left,), (public_right,), algorithm="reference"
        )[0]),
        "double": divisor_data(reference.double_batch(
            (public_left,), algorithm="reference"
        )[0]),
        "scalar": divisor_data(reference.scalar_batch(
            (public_left,), (int(payload["scalar"]),), algorithm="reference"
        )[0]),
    }
    for operation in ("add", "double", "scalar"):
        exact = {"u": expected[operation]["u"], "v": expected[operation]["v"]}
        assert reference_results[operation] == exact

    modes = {}
    operations = {
        "add": (ordinary_add, retained_add, materialized_add, cheap_count),
        "double": (
            ordinary_double, retained_double, materialized_double, cheap_count
        ),
        "scalar": (
            ordinary_scalar, retained_scalar, materialized_scalar, scalar_count
        ),
    }
    for operation, operation_data in operations.items():
        exact = {"u": expected[operation]["u"], "v": expected[operation]["v"]}
        modes[operation] = {
            "ordinary_public": time_mode(operation_data[0], exact, operation_data[3]),
            "prepared_retained_batch": time_mode(
                operation_data[1], exact, operation_data[3]
            ),
            "forced_materialized_batch": time_mode(
                operation_data[2], exact, operation_data[3]
            ),
            "reference_result": reference_results[operation],
        }
    rows.append({
        "id": case["id"],
        "genus": case["genus"],
        "prime": prime,
        "compiled": bool(context.native_available),
        "modes": modes,
    })

print("SJS_FINITE_JSON=" + json.dumps({"rows": rows}, sort_keys=True))
True`;
}

function extractSage(stdout) {
  const marker = stdout.split(/\r?\n/).findLast((line) => line.startsWith("SJS_FINITE_JSON="));
  if (!marker) throw new Error(`Sage.js emitted no finite benchmark payload:\n${stdout}`);
  return JSON.parse(marker.slice("SJS_FINITE_JSON=".length));
}

function parseMagmaArray(text) {
  const body = text.trim().replace(/^\[\s*/, "").replace(/\s*\]$/, "").trim();
  return body ? body.split(",").map((value) => Number(value.trim())) : [];
}

function parseMagma(stdout) {
  let version = null;
  const rows = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith("SJS_VERSION|")) version = line.slice("SJS_VERSION|".length).trim();
    if (!line.startsWith("SJS_FINITE|")) continue;
    const [, id, operation, times, uValue, vValue, infinityWeight] = line.split("|");
    rows.push({
      id,
      operation,
      samples_ns: parseMagmaArray(times),
      result: { u: parseMagmaArray(uValue), v: parseMagmaArray(vValue) },
      infinity_weight: Number(infinityWeight),
    });
  }
  if (!version || rows.length !== cases.length * 3) {
    throw new Error(`Magma emitted an incomplete finite benchmark payload:\n${stdout}`);
  }
  return { version, rows };
}

function exactData(caseData, operation) {
  return { u: caseData.expected[operation].u, v: caseData.expected[operation].v };
}

function validateAndAssemble(sageResult, magmaResult, options, sources) {
  const rows = [];
  for (const caseData of cases) {
    const sageRow = sageResult.rows.find((row) => row.id === caseData.id);
    if (!sageRow || !sageRow.compiled) throw new Error(`${caseData.id} did not use the compiled prepared context`);
    const operations = {};
    for (const operation of ["add", "double", "scalar"]) {
      const expected = exactData(caseData, operation);
      const expectedText = stable(expected);
      const expectedDigest = sha256(expectedText);
      const sageModes = sageRow.modes[operation];
      if (stable(sageModes.reference_result) !== expectedText) throw new Error(`${caseData.id} ${operation} reference mismatch`);
      const modes = {};
      for (const [name, mode] of Object.entries(sageModes)) {
        if (name === "reference_result") continue;
        if (stable(mode.result) !== expectedText) throw new Error(`${caseData.id} ${operation} ${name} mismatch`);
        modes[name] = {
          ...timingSummary(mode.samples_ns, mode.item_count),
          result_digest_sha256: expectedDigest,
        };
      }
      let magma = { status: "not-run" };
      if (magmaResult) {
        const magmaRow = magmaResult.rows.find((row) => row.id === caseData.id && row.operation === operation);
        if (!magmaRow || stable(magmaRow.result) !== expectedText) throw new Error(`${caseData.id} ${operation} Magma mismatch`);
        if (magmaRow.infinity_weight !== expected.u.length - 1) throw new Error(`${caseData.id} ${operation} Magma infinity-weight mismatch`);
        if (magmaRow.samples_ns.some((value) => !(value > 10_000_000))) {
          throw new Error(`${caseData.id} ${operation} has a Magma sample at or below its 10 ms timer resolution; increase iterations`);
        }
        magma = {
          status: "ok",
          ...timingSummary(
            magmaRow.samples_ns,
            operation === "scalar" ? options.scalarIterations : options.cheapIterations,
          ),
          result_digest_sha256: expectedDigest,
          infinity_weight: magmaRow.infinity_weight,
          timer_resolution_ns: 10_000_000,
        };
        modes.ordinary_public.ratio_to_magma = modes.ordinary_public.median_ns_per_item / magma.median_ns_per_item;
        modes.prepared_retained_batch.ratio_to_magma = modes.prepared_retained_batch.median_ns_per_item / magma.median_ns_per_item;
        modes.forced_materialized_batch.ratio_to_magma = modes.forced_materialized_batch.median_ns_per_item / magma.median_ns_per_item;
      }
      operations[operation] = {
        canonical_result: expected,
        canonical_packed_row: caseData.expected[operation].row,
        result_digest_sha256: expectedDigest,
        reference_result_digest_sha256: expectedDigest,
        sagejs: modes,
        magma,
      };
    }
    rows.push({ id: caseData.id, genus: caseData.genus, prime: caseData.prime, operations });
  }
  return {
    schema: "sagejs.hyperelliptic.finite-jacobian-magma-contract.v1",
    revision: run("git", ["rev-parse", "HEAD"]).stdout.trim(),
    host: {
      platform: process.platform,
      architecture: process.arch,
      release: os.release(),
      cpu: os.cpus()[0]?.model ?? "unknown",
      logical_cpus: os.cpus().length,
      node: process.version,
    },
    contract: {
      prime: 1009,
      cheap_iterations: options.cheapIterations,
      scalar_iterations: options.scalarIterations,
      scalar_bits: 256,
      scalar,
      samples: options.samples,
      warmups: options.warmups,
      result_observation_outside_timing: true,
      ordinary_public: "one public batch call from canonical registered divisor objects; includes authenticated gather and retains canonical output rows",
      prepared_retained_batch: "one prepared batch boundary; opaque canonical rows retained",
      forced_materialized_batch: "one prepared batch boundary plus all public Mumford polynomial objects",
      magma: "resident public Jacobian operations; final canonical Mumford result observed outside timing",
    },
    sources: {
      harness_sha256: sha256(readFileSync(harnessPath)),
      sagejs_program_sha256: sha256(sources.sage),
      magma_program_sha256: sha256(sources.magma),
    },
    backends: {
      sagejs: { executable: sagejs },
      magma: magmaResult
        ? { executable: options.magma, version: magmaResult.version, timer_resolution_ns: 10_000_000 }
        : { status: "not-run" },
    },
    rows,
  };
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const sources = { sage: sageSource(options), magma: magmaSource(options) };
  if (options.printMagmaSource) {
    process.stdout.write(sources.magma + "\n");
    return;
  }
  if (options.printSageSource) {
    process.stdout.write(sources.sage + "\n");
    return;
  }
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-finite-magma-contract-"));
  try {
    const sageProgram = join(temporary, "benchmark.py");
    writeFileSync(sageProgram, sources.sage);
    const sageResult = extractSage(run(process.execPath, [sagejs, sageProgram]).stdout);
    let magmaResult = null;
    if (!options.noMagma) {
      if (!existsSync(options.magma)) throw new Error(`Magma executable is unavailable at ${options.magma}; use --no-magma only for local harness validation`);
      magmaResult = parseMagma(run(options.magma, ["-b"], { input: sources.magma }).stdout);
    }
    const receipt = validateAndAssemble(sageResult, magmaResult, options, sources);
    const output = JSON.stringify(receipt, null, 2) + "\n";
    if (options.output) writeFileSync(options.output, output);
    else process.stdout.write(output);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

main();
