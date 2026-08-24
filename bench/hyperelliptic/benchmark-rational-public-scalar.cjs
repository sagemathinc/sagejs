#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require("node:fs");
const os = require("node:os");
const { join, resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../..");
const sagejs = join(root, "bin", "sagejs");
const rationalSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_rational_native.py",
);

function parsePositive(value, name) {
  const answer = Number(value);
  if (!Number.isSafeInteger(answer) || answer <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return answer;
}

function optionsFromArguments(arguments_) {
  const options = {
    noMagma: false,
    budgetCheckOnly: false,
    printMagmaSource: false,
    samples: 5,
    iterations: 128,
    torsionIterations: 10_000,
    warmups: 8,
    maxOutputBits: 8_192,
    smallExponent: 4,
    growingExponent: 6,
    magma: process.env.MAGMA || "/home/user/bin/magma",
  };
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--no-magma") options.noMagma = true;
    else if (argument === "--budget-check-only") options.budgetCheckOnly = true;
    else if (argument === "--print-magma-source") options.printMagmaSource = true;
    else {
      const equal = argument.indexOf("=");
      const name = equal < 0 ? argument : argument.slice(0, equal);
      const value = equal < 0 ? arguments_[++index] : argument.slice(equal + 1);
      if (value === undefined) throw new Error(`${name} requires a value`);
      if (name === "--samples") options.samples = parsePositive(value, name);
      else if (name === "--iterations") options.iterations = parsePositive(value, name);
      else if (name === "--torsion-iterations") {
        options.torsionIterations = parsePositive(value, name);
      } else if (name === "--warmups") options.warmups = parsePositive(value, name);
      else if (name === "--max-output-bits") {
        options.maxOutputBits = parsePositive(value, name);
      } else if (name === "--small-exponent") {
        options.smallExponent = parsePositive(value, name);
      } else if (name === "--growing-exponent") {
        options.growingExponent = parsePositive(value, name);
      } else if (name === "--magma") options.magma = value;
      else throw new Error(`unknown argument ${name}`);
    }
  }
  for (const [name, exponent] of [
    ["--small-exponent", options.smallExponent],
    ["--growing-exponent", options.growingExponent],
  ]) {
    if (exponent > 6) {
      throw new Error(
        `${name} exceeds the audited exact-publication exponent bound 6; `
        + "use finite-field/local arithmetic for large scalar bit lengths",
      );
    }
  }
  return options;
}

function polynomial(variable, coefficients) {
  return coefficients
    .map((coefficient, degree) => `(${coefficient})*${variable}^${degree}`)
    .join("+") || "0";
}

function casesFor(options) {
  const smallScalar = (1n << BigInt(options.smallExponent)) + 1n;
  const growingScalar = (1n << BigInt(options.growingExponent)) + 1n;
  return [
    {
      id: "g2-qq-nontorsion-small",
      classification: "non-torsion-exact-bounded-output",
      f: ["1", "1", "0", "0", "0", "1"],
      h: ["0"],
      u: ["0", "1"],
      v: ["1"],
      scalar: String(smallScalar),
      iterations: options.iterations,
      nonTorsionProof: { primes: [5, 11], groupOrders: [36, 88], bound: 4 },
    },
    {
      id: "g2-qq-nontorsion-growing",
      classification: "non-torsion-exact-bounded-output",
      f: ["1", "1", "0", "0", "0", "1"],
      h: ["0"],
      u: ["0", "1"],
      v: ["1"],
      scalar: String(growingScalar),
      iterations: options.iterations,
      nonTorsionProof: { primes: [5, 11], groupOrders: [36, 88], bound: 4 },
    },
    {
      id: "g2-qq-generalized-h-nontorsion",
      classification: "non-torsion-exact-bounded-output",
      f: ["0", "1", "0", "0", "0", "1"],
      h: ["1"],
      u: ["0", "1"],
      v: ["0"],
      scalar: String(smallScalar),
      iterations: options.iterations,
      nonTorsionProof: { primes: [5, 7], groupOrders: [36, 66], bound: 6 },
    },
    {
      id: "g2-qq-256-bit-scalar-on-2-torsion",
      classification: "torsion-large-scalar-no-coefficient-growth",
      f: ["0", "-1", "0", "0", "0", "1"],
      h: ["0"],
      u: ["0", "1"],
      v: ["0"],
      scalar: String((1n << 255n) + 1n),
      iterations: options.torsionIterations,
      torsionOrder: 2,
    },
  ];
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function checkedSpawn(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 64 * 1024 * 1024,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || "child failed").trim());
  }
  return result.stdout;
}

function sageSource(options, cases) {
  const payload = JSON.stringify({
    cases,
    samples: options.samples,
    warmups: options.warmups,
    max_output_bits: options.maxOutputBits,
    budget_check_only: options.budgetCheckOnly,
  });
  return String.raw`
import hashlib
import json
import time

payload = json.loads(${JSON.stringify(payload)})


def rational_text(value):
    numerator = int(value.numerator())
    denominator = int(value.denominator())
    if denominator == 1:
        return str(numerator)
    return str(numerator) + "/" + str(denominator)


def canonical_row(divisor):
    u_value, v_value = divisor.uv()
    return {
        "u": [rational_text(value) for value in u_value.list()],
        "v": [rational_text(value) for value in v_value.list()],
        "infinity_weight": int(u_value.degree()),
    }


def row_bits(row):
    maximum = 1
    total = 0
    for name in ("u", "v"):
        for text in row[name]:
            pieces = text.split("/")
            numerator = abs(int(pieces[0]))
            denominator = int(pieces[1]) if len(pieces) == 2 else 1
            coefficient_bits = max(numerator.bit_length(), denominator.bit_length())
            maximum = max(maximum, coefficient_bits)
            total += numerator.bit_length() + denominator.bit_length()
    return maximum, total


def gcd(left, right):
    while right:
        left, right = right, left % right
    return left


def timer_resolution_ns():
    values = []
    for _index in range(16):
        first = time.perf_counter_ns()
        second = first
        while second == first:
            second = time.perf_counter_ns()
        values.append(second - first)
    return min(values)


rows = []
for case in payload["cases"]:
    ring = PolynomialRing(QQ, "x")
    f_coefficients = [int(value) for value in case["f"]]
    h_coefficients = [int(value) for value in case["h"]]
    u_coefficients = [int(value) for value in case["u"]]
    v_coefficients = [int(value) for value in case["v"]]
    f_value = ring(f_coefficients)
    h_value = ring(h_coefficients)
    jacobian = HyperellipticCurve(f_value, h_value).jacobian()
    point = jacobian([ring(u_coefficients), ring(v_coefficients)])
    scalar = int(case["scalar"])
    scalar_bits = scalar.bit_length()

    reference_started = time.perf_counter_ns()
    reference = point.scalar_multiple(scalar, algorithm="reference")
    reference_ns = time.perf_counter_ns() - reference_started
    expected = canonical_row(reference)
    maximum_bits, total_bits = row_bits(expected)
    if maximum_bits > payload["max_output_bits"]:
        raise ValueError(
            case["id"] + " actual output coefficient bits " + str(maximum_bits)
            + " exceeds max_output_bits=" + str(payload["max_output_bits"])
        )

    proof = case.get("nonTorsionProof")
    if proof is not None:
        orders = []
        for prime in proof["primes"]:
            finite_ring = PolynomialRing(GF(prime), "z")
            finite_curve = HyperellipticCurve(
                finite_ring(f_coefficients), finite_ring(h_coefficients)
            )
            orders.append(int(finite_curve.jacobian().order()))
        assert orders == proof["groupOrders"]
        bound = orders[0]
        for order in orders[1:]:
            bound = gcd(bound, order)
        assert bound == proof["bound"]
        assert point.scalar_multiple(bound, algorithm="reference") != jacobian.zero()
    else:
        assert point != jacobian.zero()
        assert point.scalar_multiple(case["torsionOrder"], algorithm="reference") == jacobian.zero()

    row = {
        "id": case["id"],
        "classification": case["classification"],
        "scalar": case["scalar"],
        "scalar_bits": scalar_bits,
        "iterations": case["iterations"],
        "actual_max_output_coefficient_bits": maximum_bits,
        "actual_total_output_coefficient_bits": total_bits,
        "exact_result": expected,
        "reference_replay_ns": reference_ns,
        "non_torsion_proof": proof,
        "torsion_order": case.get("torsionOrder"),
    }
    if not payload["budget_check_only"]:
        context = jacobian.prepared_arithmetic(algorithm="native")
        assert context.native_available
        for _warmup in range(payload["warmups"]):
            answer = scalar * point
        samples = []
        for _sample in range(payload["samples"]):
            started = time.perf_counter_ns()
            for _item in range(case["iterations"]):
                answer = scalar * point
            samples.append(time.perf_counter_ns() - started)
        observed = canonical_row(answer)
        assert observed == expected
        certificate_started = time.perf_counter_ns()
        certificate = context.operation_certificate("scalar", point, scalar)
        assert context.verify_operation_certificate(certificate)
        certificate_ns = time.perf_counter_ns() - certificate_started
        assert canonical_row(context.unpack(certificate["answer"])) == expected
        certificate_text = json.dumps(certificate, sort_keys=True)
        row["samples_ns"] = samples
        row["certificate"] = {
            "schema": certificate["schema"],
            "verified_by_reference": True,
            "verification_ns": certificate_ns,
            "sha256": hashlib.sha256(certificate_text.encode("ascii")).hexdigest(),
            "included_in_timing": False,
        }
        row["native_available"] = context.native_available
    rows.append(row)

print(json.dumps({
    "schema": "sagejs.hyperelliptic.rational-public-scalar.v1",
    "engine": "sagejs",
    "timer": "time.perf_counter_ns",
    "timer_resolution_ns": timer_resolution_ns(),
    "max_output_bits": payload["max_output_bits"],
    "budget_check_only": payload["budget_check_only"],
    "rows": rows,
}, sort_keys=True))
`;
}

function magmaSource(options, cases) {
  const blocks = cases.map((caseData, index) => {
    const name = `c${index}`;
    const variable = `${name}x`;
    const f = polynomial(variable, caseData.f);
    const h = polynomial(variable, caseData.h);
    const curve = caseData.h.some((value) => BigInt(value) !== 0n)
      ? `HyperellipticCurve(${f},${h})`
      : `HyperellipticCurve(${f})`;
    const u = polynomial(variable, caseData.u);
    const v = polynomial(variable, caseData.v);
    return `${name}R<${variable}>:=PolynomialRing(Rationals());
${name}C:=${curve}; ${name}J:=Jacobian(${name}C);
${name}P:=${name}J![${u},${v}]; ${name}scalar:=${caseData.scalar};
for warmup in [1..${options.warmups}] do ${name}value:=${name}scalar*${name}P; end for;
${name}times:=[];
for sample in [1..${options.samples}] do
  started:=Realtime();
  for item in [1..${caseData.iterations}] do ${name}value:=${name}scalar*${name}P; end for;
  Append(~${name}times,Realtime(started));
end for;
${name}uv,${name}d:=Eltseq(${name}value);
${name}u:=[Coefficient(${name}uv[1],degree):degree in [0..Degree(${name}uv[1])]];
${name}v:=[Coefficient(${name}uv[2],degree):degree in [0..Degree(${name}uv[2])]];
printf "SJS_SCALAR|${caseData.id}|%o|%o|%o|%o\\n",${name}times,${name}u,${name}v,${name}d;`;
  });
  return `SetColumns(0);
major,minor,patch:=GetVersion();
printf "SJS_VERSION|%o.%o.%o\\n",major,minor,patch;
function TimerResolution()
  values:=[];
  for trial in [1..8] do
    first:=Realtime(); second:=first; counter:=0;
    repeat counter+:=1; discard:=counter*counter; second:=Realtime();
    until second gt first;
    Append(~values,second-first);
  end for;
  return Min(values);
end function;
printf "SJS_TIMER_RESOLUTION|%o\\n",TimerResolution();
${blocks.join("\n")}
quit;`;
}

function parseMagmaArray(text) {
  const value = text.trim();
  assert.ok(value.startsWith("[") && value.endsWith("]"), text);
  const body = value.slice(1, -1).trim();
  return body ? body.split(",").map((item) => item.trim()) : [];
}

function rationalText(text) {
  const pieces = text.trim().split("/");
  let numerator = BigInt(pieces[0]);
  let denominator = pieces.length === 2 ? BigInt(pieces[1]) : 1n;
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  let left = numerator < 0n ? -numerator : numerator;
  let right = denominator;
  while (right !== 0n) [left, right] = [right, left % right];
  numerator /= left;
  denominator /= left;
  return denominator === 1n ? String(numerator) : `${numerator}/${denominator}`;
}

function parseMagma(stdout, cases) {
  const version = stdout.match(/SJS_VERSION\|([^\n]+)/)?.[1]?.trim();
  const timerResolution = Number(
    stdout.match(/SJS_TIMER_RESOLUTION\|([^\n]+)/)?.[1],
  );
  assert.ok(version && timerResolution > 0, stdout);
  const rows = new Map();
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.startsWith("SJS_SCALAR|")) continue;
    const fields = line.split("|");
    rows.set(fields[1], {
      id: fields[1],
      samples_seconds: parseMagmaArray(fields[2]).map(Number),
      exact_result: {
        u: parseMagmaArray(fields[3]).map(rationalText),
        v: parseMagmaArray(fields[4]).map(rationalText),
        infinity_weight: Number(fields[5]),
      },
    });
  }
  assert.equal(rows.size, cases.length, stdout);
  return { version, timer_resolution_seconds: timerResolution, rows };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

function summarize(samples, iterations, scale) {
  const middle = median(samples);
  return {
    samples,
    median: middle,
    iterations,
    median_ns_per_operation: (middle * scale) / iterations,
  };
}

function execute(options) {
  const cases = casesFor(options);
  const sageProgram = sageSource(options, cases);
  const magmaProgram = magmaSource(options, cases);
  if (options.printMagmaSource) {
    process.stdout.write(`${magmaProgram}\n`);
    return null;
  }
  const temporary = mkdtempSync(join(os.tmpdir(), "sagejs-rational-scalar-"));
  try {
    const program = join(temporary, "benchmark.py");
    const cache = join(temporary, "cache");
    writeFileSync(program, sageProgram);
    if (!options.budgetCheckOnly) {
      checkedSpawn(process.execPath, [
        sagejs,
        "native",
        "compile",
        rationalSource,
        "--cache-root",
        cache,
      ]);
    }
    const sage = JSON.parse(checkedSpawn(process.execPath, [sagejs, program], {
      env: options.budgetCheckOnly ? {} : { SAGEJS_NATIVE_CACHE_DIR: cache },
    }).trim());
    if (!options.budgetCheckOnly) {
      for (const row of sage.rows) {
        for (const sample of row.samples_ns) {
          assert.ok(
            sample > sage.timer_resolution_ns,
            `${row.id} Sage.js sample ${sample}ns is not timer-resolved`,
          );
        }
      }
    }
    const sageRows = new Map(sage.rows.map((row) => [row.id, row]));
    let magma = { status: "not-requested", reason: "pass --magma or set MAGMA" };
    if (!options.noMagma && !options.budgetCheckOnly) {
      const parsed = parseMagma(
        checkedSpawn(options.magma, ["-b"], { input: magmaProgram }),
        cases,
      );
      const rows = [];
      for (const caseData of cases) {
        const sageRow = sageRows.get(caseData.id);
        const magmaRow = parsed.rows.get(caseData.id);
        assert.deepEqual(magmaRow.exact_result, sageRow.exact_result);
        for (const sample of magmaRow.samples_seconds) {
          assert.ok(
            sample > parsed.timer_resolution_seconds,
            `${caseData.id} Magma sample ${sample}s is not timer-resolved`,
          );
        }
        rows.push({
          ...magmaRow,
          timing: summarize(
            magmaRow.samples_seconds,
            caseData.iterations,
            1_000_000_000,
          ),
          exact_result_sha256: sha256(JSON.stringify(magmaRow.exact_result)),
        });
      }
      magma = {
        status: "ok",
        version: parsed.version,
        timer: "Realtime",
        timer_resolution_seconds: parsed.timer_resolution_seconds,
        rows,
      };
    }
    const sageRowsOutput = sage.rows.map((row) => ({
      ...row,
      timing: row.samples_ns === undefined
        ? null
        : summarize(row.samples_ns, row.iterations, 1),
      exact_result_sha256: sha256(JSON.stringify(row.exact_result)),
    }));
    return {
      schema: "sagejs.hyperelliptic.rational-public-scalar-acceptance.v1",
      source: {
        commit: checkedSpawn("git", ["rev-parse", "HEAD"]).trim(),
        harness_sha256: sha256(readFileSync(__filename)),
        sage_program_sha256: sha256(sageProgram),
        magma_program_sha256: sha256(magmaProgram),
      },
      host: {
        platform: os.platform(),
        architecture: os.arch(),
        release: os.release(),
        cpu_model: os.cpus()[0]?.model || "unknown",
        node: process.version,
        load_average: os.loadavg(),
      },
      contract: {
        ordinary_public_operators: true,
        non_torsion_output_budget_bits: options.maxOutputBits,
        exact_output_observation_included_in_timing: false,
        reference_and_certificate_included_in_timing: false,
        coefficient_growth_note:
          "Non-torsion QQ rows are bounded by actual exact output bits; the 256-bit scalar row is explicitly rational 2-torsion and is not evidence about non-torsion growth.",
      },
      sagejs: { ...sage, rows: sageRowsOutput },
      magma,
    };
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
}

function main() {
  const options = optionsFromArguments(process.argv.slice(2));
  const report = execute(options);
  if (report !== null) process.stdout.write(`${JSON.stringify(report)}\n`);
}

module.exports = {
  casesFor,
  execute,
  magmaSource,
  optionsFromArguments,
  sageSource,
};

if (require.main === module) main();
