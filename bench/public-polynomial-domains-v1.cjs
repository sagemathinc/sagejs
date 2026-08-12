#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { basename, isAbsolute, join, resolve } = require("node:path");
const { performance } = require("node:perf_hooks");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "..");
const sagejs = resolve(root, "bin", "sagejs");
const samples = Math.max(
  3,
  Number(process.env.SAGEJS_POLYNOMIAL_DOMAIN_SAMPLES || 5),
);

const workflows = [
  "construction",
  "mutation",
  "arithmetic",
  "divrem",
  "gcd",
  "xgcd",
  "factor",
  "roots",
  "evaluate",
  "format",
  "serialize",
];

const representations = {
  "gf-prime-large": {
    label: "GF(p)[x], p > 2^32-1",
    sagejs: "opaque FLINT prime-polynomial resource",
    sagemath: "Sage/FLINT prime-polynomial element",
  },
  "gf-extension": {
    label: "GF(p^n)[x], n > 1",
    sagejs: "opaque FLINT fq-polynomial resource",
    sagemath: "Sage/FLINT fq-polynomial element",
  },
  "cyclotomic-field": {
    label: "CyclotomicField(n)[x]",
    sagejs: "generic exact sparse term list",
    sagemath: "Sage generic dense polynomial over a number field",
  },
};

// This source is intentionally accepted by CPython after adding Sage's public
// namespace. It measures public mathematical operations, not private adapters.
const commonSource = String.raw`
import time

_samples = __SAMPLES__


def _clean(value):
    return str(value).replace("|", "/").replace("\n", " ")


def _scalar_identity(value):
    return _clean(value).replace(" ", "")


def _text_checksum(value):
    answer = 0
    for character in value:
        answer = (answer * 1000003 + ord(character)) % 2305843009213693951
    return str(len(value)) + ":" + str(answer)


def _polynomial_identity(value, point):
    return (
        str(value.degree())
        + ":"
        + _scalar_identity(value[0])
        + ":"
        + _scalar_identity(value[value.degree()])
        + ":"
        + _scalar_identity(value(point))
    )


def _generic_polynomial_identity(value, point):
    return (
        str(value.degree())
        + ":"
        + _scalar_identity(value(point))
        + ":"
        + _scalar_identity(value(point + 1))
    )


def _pair_identity(value, dividend, divisor, point):
    quotient, remainder = value
    return (
        str(quotient * divisor + remainder == dividend)
        + ":"
        + str(quotient.degree())
        + ":"
        + str(remainder.degree())
        + ":"
        + _scalar_identity(quotient(point))
        + ":"
        + _scalar_identity(remainder(point))
    )


def _xgcd_identity(value, left, right, point):
    gcd_value, left_cofactor, right_cofactor = value
    return (
        str(left_cofactor * left + right_cofactor * right == gcd_value)
        + ":"
        + _polynomial_identity(gcd_value, point)
    )


def _generic_xgcd_identity(value, left, right, point):
    gcd_value, left_cofactor, right_cofactor = value
    return (
        str(left_cofactor * left + right_cofactor * right == gcd_value)
        + ":"
        + _generic_polynomial_identity(gcd_value, point)
    )


def _factor_identity(value, source, point):
    return (
        str(value.value() == source)
        + ":"
        + str(len(value))
        + ":"
        + _scalar_identity(value.unit())
        + ":"
        + _scalar_identity(value.value()(point))
    )


def _roots_identity(value):
    entries = []
    for root, multiplicity in value:
        entries.append(_scalar_identity(root) + "^" + str(multiplicity))
    entries.sort()
    return str(len(entries)) + ":" + ",".join(entries)


def _serialized_identity(value, source, point):
    encoded, restored = value
    return (
        str(restored == source)
        + ":"
        + _polynomial_identity(restored, point)
        + ":bytes="
        + str(len(encoded))
    )


def _serialized_generic_identity(value, source, point):
    encoded, restored = value
    return (
        str(restored == source)
        + ":"
        + _generic_polynomial_identity(restored, point)
        + ":bytes="
        + str(len(encoded))
    )


def _emit_representation(domain, value):
    print(
        "SAGEJS_POLY_REP|"
        + domain
        + "|"
        + _clean(type(value))
        + "|"
        + _clean(value.parent())
    )


def _emit_unmeasured(domain, workflow, state, identity):
    print(
        "SAGEJS_POLY_CASE|"
        + domain
        + "|"
        + workflow
        + "|"
        + state
        + "|0|||"
        + _clean(identity)
        + "|"
    )


def _measure(domain, workflow, iterations, operation, identity):
    try:
        started = time.perf_counter()
        value = operation()
        cold_ms = 1000 * (time.perf_counter() - started)
        result_identity = identity(value)
        timings = []
        for sample in range(_samples):
            started = time.perf_counter()
            for repeat in range(iterations):
                value = operation()
            timings.append(
                1000 * (time.perf_counter() - started) / iterations
            )
        timings.sort()
        warm_ms = timings[len(timings) // 2]
        if identity(value) != result_identity:
            raise AssertionError("non-deterministic result identity")
        print(
            "SAGEJS_POLY_CASE|"
            + domain
            + "|"
            + workflow
            + "|supported|"
            + str(iterations)
            + "|"
            + str(cold_ms)
            + "|"
            + str(warm_ms)
            + "|"
            + _clean(result_identity)
            + "|"
        )
    except Exception as error:
        print(
            "SAGEJS_POLY_CASE|"
            + domain
            + "|"
            + workflow
            + "|unsupported|"
            + str(iterations)
            + "||||"
            + _clean(error)
        )


def _seeded_integers(length, modulus, seed):
    state = seed
    answer = []
    for index in range(length):
        state = (6364136223846793005 * state + 1442695040888963407) % modulus
        answer.append(state - modulus // 2)
    return answer


# Large-prime GF(p)[x].
_large_prime = 2305843009213693951
_large_field = GF(_large_prime)
_large_ring = PolynomialRing(_large_field, "x")
_x = _large_ring.gen()
_large_left_coefficients = _seeded_integers(129, _large_prime, 1729)
_large_right_coefficients = _seeded_integers(97, _large_prime, 314159)
_large_left = _large_ring(_large_left_coefficients)
_large_right = _large_ring(_large_right_coefficients)
_large_divisor = _x ** 32 + 7 * _x + 11
_large_quotient = _x ** 47 + 5 * _x ** 11 + 3
_large_remainder = _x ** 17 + 19
_large_dividend = _large_quotient * _large_divisor + _large_remainder
_large_common = _x ** 5 + 2 * _x + 1
_large_gcd_left = _large_common * (_x ** 41 + _x + 3)
_large_gcd_right = _large_common * (_x ** 37 + 2 * _x + 5)
_large_factor_source = (
    (_x + 1) ** 3 * (_x + 2) ** 2 * (_x ** 4 + _x + 7)
)
_large_root_source = (_x - 1) ** 3 * (_x - 2) ** 2 * (_x - 3)
_emit_representation("gf-prime-large", _large_left)


def _large_construct():
    return _large_ring(_large_left_coefficients)


def _large_arithmetic():
    return _large_left * _large_right + _large_left


def _large_divrem():
    return _large_dividend.quo_rem(_large_divisor)


def _large_gcd():
    return _large_gcd_left.gcd(_large_gcd_right)


def _large_xgcd():
    return _large_gcd_left.xgcd(_large_gcd_right)


def _large_factor():
    return _large_factor_source.factor()


def _large_roots():
    return _large_root_source.roots()


def _large_evaluate():
    return _large_left(_large_field(123456789))


def _large_format():
    return str(_large_left)


def _large_serialize():
    encoded = dumps(_large_left)
    return encoded, loads(encoded)


_measure(
    "gf-prime-large", "construction", 1, _large_construct,
    lambda value: _polynomial_identity(value, _large_field(17)),
)
_emit_unmeasured(
    "gf-prime-large", "mutation", "semantic-only",
    "polynomial elements are immutable; see the dedicated semantics lane",
)
_measure(
    "gf-prime-large", "arithmetic", 12, _large_arithmetic,
    lambda value: _polynomial_identity(value, _large_field(17)),
)
_measure(
    "gf-prime-large", "divrem", 12, _large_divrem,
    lambda value: _pair_identity(
        value, _large_dividend, _large_divisor, _large_field(17)
    ),
)
_measure(
    "gf-prime-large", "gcd", 12, _large_gcd,
    lambda value: _polynomial_identity(value, _large_field(17)),
)
_measure(
    "gf-prime-large", "xgcd", 8, _large_xgcd,
    lambda value: _xgcd_identity(
        value, _large_gcd_left, _large_gcd_right, _large_field(17)
    ),
)
_measure(
    "gf-prime-large", "factor", 3, _large_factor,
    lambda value: _factor_identity(
        value, _large_factor_source, _large_field(17)
    ),
)
_measure(
    "gf-prime-large", "roots", 3, _large_roots, _roots_identity
)
_measure(
    "gf-prime-large", "evaluate", 40, _large_evaluate, _scalar_identity
)
_measure(
    "gf-prime-large", "format", 20, _large_format, _text_checksum
)
_measure(
    "gf-prime-large", "serialize", 1, _large_serialize,
    lambda value: _serialized_identity(
        value, _large_left, _large_field(17)
    ),
)


# GF(3^2)[y] with an explicit modulus so both runtimes use the same field.
_prime_ring = PolynomialRing(GF(3), "u")
_u = _prime_ring.gen()
_extension = GF(9, "a", modulus=_u ** 2 + 1)
_a = _extension.gen()
_extension_ring = PolynomialRing(_extension, "y")
_y = _extension_ring.gen()
_extension_left_coefficients = [
    _extension((index * 2 + 1) % 3) + _extension((index * 7 + 2) % 3) * _a
    for index in range(81)
]
_extension_right_coefficients = [
    _extension((index * 5 + 2) % 3) + _extension((index * 11 + 1) % 3) * _a
    for index in range(57)
]
_extension_left = _extension_ring(_extension_left_coefficients)
_extension_right = _extension_ring(_extension_right_coefficients)
_extension_divisor = _y ** 17 + _a * _y + 1
_extension_quotient = _y ** 23 + (_a + 1) * _y ** 7 + _a
_extension_remainder = _y ** 9 + _a + 1
_extension_dividend = (
    _extension_quotient * _extension_divisor + _extension_remainder
)
_extension_common = _y ** 4 + _a * _y + 1
_extension_gcd_left = _extension_common * (_y ** 31 + _a * _y + 1)
_extension_gcd_right = _extension_common * (_y ** 29 + _y + _a)
_extension_factor_source = (
    (_y + 1) ** 3 * (_y + _a) ** 2 * (_y ** 3 + _a * _y + 1)
)
_extension_root_source = (
    (_y - 1) ** 3 * (_y - _a) ** 2 * (_y - (_a + 1))
)
_emit_representation("gf-extension", _extension_left)


def _extension_construct():
    return _extension_ring(_extension_left_coefficients)


def _extension_arithmetic():
    return _extension_left * _extension_right + _extension_left


def _extension_divrem():
    return _extension_dividend.quo_rem(_extension_divisor)


def _extension_gcd():
    return _extension_gcd_left.gcd(_extension_gcd_right)


def _extension_xgcd():
    return _extension_gcd_left.xgcd(_extension_gcd_right)


def _extension_factor():
    return _extension_factor_source.factor()


def _extension_roots():
    return _extension_root_source.roots()


def _extension_evaluate():
    return _extension_left(_a + 1)


def _extension_format():
    return str(_extension_left)


def _extension_serialize():
    encoded = dumps(_extension_left)
    return encoded, loads(encoded)


_measure(
    "gf-extension", "construction", 1, _extension_construct,
    lambda value: _polynomial_identity(value, _a + 1),
)
_emit_unmeasured(
    "gf-extension", "mutation", "semantic-only",
    "polynomial elements are immutable; see the dedicated semantics lane",
)
_measure(
    "gf-extension", "arithmetic", 12, _extension_arithmetic,
    lambda value: _polynomial_identity(value, _a + 1),
)
_measure(
    "gf-extension", "divrem", 12, _extension_divrem,
    lambda value: _pair_identity(
        value, _extension_dividend, _extension_divisor, _a + 1
    ),
)
_measure(
    "gf-extension", "gcd", 12, _extension_gcd,
    lambda value: _polynomial_identity(value, _a + 1),
)
_measure(
    "gf-extension", "xgcd", 8, _extension_xgcd,
    lambda value: _xgcd_identity(
        value, _extension_gcd_left, _extension_gcd_right, _a + 1
    ),
)
_measure(
    "gf-extension", "factor", 3, _extension_factor,
    lambda value: _factor_identity(
        value, _extension_factor_source, _a + 1
    ),
)
_measure(
    "gf-extension", "roots", 3, _extension_roots, _roots_identity
)
_measure(
    "gf-extension", "evaluate", 40, _extension_evaluate, _scalar_identity
)
_measure(
    "gf-extension", "format", 20, _extension_format, _text_checksum
)
_measure(
    "gf-extension", "serialize", 1, _extension_serialize,
    lambda value: _serialized_identity(
        value, _extension_left, _a + 1
    ),
)


# CyclotomicField(5)[z].
_cyclotomic = CyclotomicField(5, "zeta5")
_zeta = _cyclotomic.gen()
_cyclotomic_ring = PolynomialRing(_cyclotomic, "z")
_z = _cyclotomic_ring.gen()
_cyclotomic_left_coefficients = [
    _cyclotomic((index * 7 + 3) % 11 - 5)
    + _cyclotomic((index * 13 + 1) % 7 - 3) * _zeta
    for index in range(41)
]
_cyclotomic_right_coefficients = [
    _cyclotomic((index * 5 + 2) % 13 - 6)
    + _cyclotomic((index * 3 + 1) % 5 - 2) * _zeta ** 2
    for index in range(29)
]


def _cyclotomic_from_terms(coefficients):
    answer = _cyclotomic_ring(0)
    for index in range(len(coefficients)):
        answer += coefficients[index] * _z ** index
    return answer


_cyclotomic_left = _cyclotomic_from_terms(_cyclotomic_left_coefficients)
_cyclotomic_right = _cyclotomic_from_terms(_cyclotomic_right_coefficients)
_cyclotomic_divisor = _z ** 11 + _zeta * _z + 1
_cyclotomic_quotient = _z ** 17 + (_zeta + 1) * _z ** 5 + _zeta ** 2
_cyclotomic_remainder = _z ** 7 + _zeta + 1
_cyclotomic_dividend = (
    _cyclotomic_quotient * _cyclotomic_divisor + _cyclotomic_remainder
)
_cyclotomic_common = _z ** 3 + _zeta * _z + 1
_cyclotomic_gcd_left = (
    _cyclotomic_common * (_z ** 19 + _zeta * _z + 1)
)
_cyclotomic_gcd_right = (
    _cyclotomic_common * (_z ** 17 + _z + _zeta)
)
_cyclotomic_factor_source = (
    (_z + 1) ** 3
    * (_z + _zeta) ** 2
    * (_z ** 2 + _zeta * _z + 1)
)
_cyclotomic_root_source = (
    (_z - 1) ** 3 * (_z - _zeta) ** 2 * (_z - (_zeta + 1))
)
_emit_representation("cyclotomic-field", _cyclotomic_left)


def _cyclotomic_construct():
    return _cyclotomic_ring(_cyclotomic_left_coefficients)


def _cyclotomic_arithmetic():
    return _cyclotomic_left * _cyclotomic_right + _cyclotomic_left


def _cyclotomic_divrem():
    return _cyclotomic_dividend.quo_rem(_cyclotomic_divisor)


def _cyclotomic_gcd():
    return _cyclotomic_gcd_left.gcd(_cyclotomic_gcd_right)


def _cyclotomic_xgcd():
    return _cyclotomic_gcd_left.xgcd(_cyclotomic_gcd_right)


def _cyclotomic_factor():
    return _cyclotomic_factor_source.factor()


def _cyclotomic_roots():
    return _cyclotomic_root_source.roots()


def _cyclotomic_evaluate():
    return _cyclotomic_left(_zeta + 1)


def _cyclotomic_format():
    return str(_cyclotomic_left)


def _cyclotomic_serialize():
    encoded = dumps(_cyclotomic_left)
    return encoded, loads(encoded)


_measure(
    "cyclotomic-field", "construction", 20, _cyclotomic_construct,
    lambda value: _generic_polynomial_identity(value, _zeta + 1),
)
_emit_unmeasured(
    "cyclotomic-field", "mutation", "semantic-only",
    "polynomial elements are immutable; see the dedicated semantics lane",
)
_measure(
    "cyclotomic-field", "arithmetic", 1, _cyclotomic_arithmetic,
    lambda value: _generic_polynomial_identity(value, _zeta + 1),
)
_measure(
    "cyclotomic-field", "divrem", 8, _cyclotomic_divrem,
    lambda value: _pair_identity(
        value, _cyclotomic_dividend, _cyclotomic_divisor, _zeta + 1
    ),
)
_measure(
    "cyclotomic-field", "gcd", 8, _cyclotomic_gcd,
    lambda value: _generic_polynomial_identity(value, _zeta + 1),
)
_measure(
    "cyclotomic-field", "xgcd", 5, _cyclotomic_xgcd,
    lambda value: _generic_xgcd_identity(
        value, _cyclotomic_gcd_left, _cyclotomic_gcd_right, _zeta + 1
    ),
)
_measure(
    "cyclotomic-field", "factor", 2, _cyclotomic_factor,
    lambda value: _factor_identity(
        value, _cyclotomic_factor_source, _zeta + 1
    ),
)
_measure(
    "cyclotomic-field", "roots", 2, _cyclotomic_roots, _roots_identity
)
_measure(
    "cyclotomic-field", "evaluate", 1, _cyclotomic_evaluate,
    _scalar_identity,
)
_measure(
    "cyclotomic-field", "format", 1, _cyclotomic_format, _text_checksum
)
_measure(
    "cyclotomic-field", "serialize", 1, _cyclotomic_serialize,
    lambda value: _serialized_generic_identity(
        value, _cyclotomic_left, _zeta + 1
    ),
)
`;

function executable(candidate) {
  if (!candidate || (isAbsolute(candidate) && !existsSync(candidate))) {
    return false;
  }
  const check = spawnSync(candidate, ["--version"], { encoding: "utf8" });
  return !check.error && check.status === 0;
}

function locateSage() {
  const candidates = [
    process.env.SAGE_BIN,
    process.env.SAGELITE_SAGE,
    "/home/user/bin/sagelite",
    "/opt/cocalc-webdev-python/bin/sage",
    "sage",
  ];
  return candidates.find(executable) || null;
}

function version(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return `${result.stdout}\n${result.stderr}`.trim().split("\n")[0] || null;
}

function parseOutput(label, stdout) {
  const cases = [];
  const runtimeRepresentations = {};
  for (const rawLine of stdout.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("SAGEJS_POLY_REP|")) {
      const [, domain, elementType, parent] = line.split("|");
      runtimeRepresentations[domain] = { elementType, parent };
      continue;
    }
    if (!line.startsWith("SAGEJS_POLY_CASE|")) continue;
    const [
      ,
      domain,
      workflow,
      state,
      iterations,
      coldMilliseconds,
      warmMedianMilliseconds,
      identity,
      error,
    ] = line.split("|");
    cases.push({
      domain,
      workflow,
      state,
      iterations: Number(iterations),
      coldMilliseconds:
        coldMilliseconds === "" ? null : Number(coldMilliseconds),
      warmMedianMilliseconds:
        warmMedianMilliseconds === ""
          ? null
          : Number(warmMedianMilliseconds),
      identity: identity || null,
      error: error || null,
    });
  }
  assert.equal(
    cases.length,
    Object.keys(representations).length * workflows.length,
    `${label} produced ${cases.length} of ${Object.keys(representations).length * workflows.length} cases`,
  );
  for (const domain of Object.keys(representations)) {
    assert.ok(runtimeRepresentations[domain], `${label} omitted ${domain}`);
    const actual = new Set(
      cases.filter((entry) => entry.domain === domain).map((entry) => entry.workflow),
    );
    assert.deepEqual(actual, new Set(workflows), `${label} ${domain} workflows`);
  }
  for (const entry of cases) {
    if (entry.state !== "supported") continue;
    assert.ok(Number.isFinite(entry.coldMilliseconds), `${label} cold timing`);
    assert.ok(
      Number.isFinite(entry.warmMedianMilliseconds),
      `${label} warm timing`,
    );
    assert.ok(entry.identity, `${label} ${entry.domain}/${entry.workflow} identity`);
  }
  return { cases, representations: runtimeRepresentations };
}

function executeRuntime({
  label,
  command,
  args,
  versionArgs,
  prelude,
  implementationKey,
}) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-polynomial-domains-"));
  const source = `${prelude}${commonSource.replace("__SAMPLES__", String(samples))}`;
  const sourcePath = join(directory, "workload.py");
  writeFileSync(sourcePath, source);
  let result;
  let processColdMilliseconds;
  try {
    const started = performance.now();
    result = spawnSync(command, [...args, sourcePath], {
      cwd: root,
      encoding: "utf8",
      env: process.env,
      maxBuffer: 64 * 1024 * 1024,
    });
    processColdMilliseconds = performance.now() - started;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.stderr.write(result.stdout);
    process.stderr.write(result.stderr);
    throw new Error(`${label} exited with status ${result.status}`);
  }
  const parsed = parseOutput(label, result.stdout);
  return {
    label,
    command: basename(command),
    version: version(command, versionArgs),
    processColdMilliseconds,
    samples,
    representations: Object.fromEntries(
      Object.entries(parsed.representations).map(([domain, observed]) => [
        domain,
        {
          declared: representations[domain][implementationKey],
          ...observed,
        },
      ]),
    ),
    cases: parsed.cases,
  };
}

const runtimes = [
  executeRuntime({
    label: "Sage.js",
    command: process.execPath,
    args: [sagejs, "--python"],
    versionArgs: [sagejs, "--version"],
    prelude: "",
    implementationKey: "sagejs",
  }),
];

const sage = locateSage();
if (sage !== null && process.env.SAGEJS_POLYNOMIAL_DOMAIN_SAGE !== "0") {
  runtimes.push(
    executeRuntime({
      label: "SageMath",
      command: sage,
      args: [],
      versionArgs: ["--version"],
      prelude: "from sage.all import *\n",
      implementationKey: "sagemath",
    }),
  );
}

const comparisons = [];
if (runtimes.length === 2) {
  const sageCases = new Map(
    runtimes[1].cases.map((entry) => [
      `${entry.domain}/${entry.workflow}`,
      entry,
    ]),
  );
  for (const sagejsCase of runtimes[0].cases) {
    const key = `${sagejsCase.domain}/${sagejsCase.workflow}`;
    const sageCase = sageCases.get(key);
    const bothSupported =
      sagejsCase.state === "supported" && sageCase?.state === "supported";
    // SagePack payload lengths are runtime-format metadata, not mathematics.
    const sagejsIdentity = sagejsCase.identity?.replace(/:bytes=\d+$/, "");
    const sageIdentity = sageCase?.identity?.replace(/:bytes=\d+$/, "");
    const comparableIdentity = sagejsCase.workflow !== "format";
    comparisons.push({
      domain: sagejsCase.domain,
      workflow: sagejsCase.workflow,
      bothSupported,
      comparableIdentity,
      identityMatches:
        bothSupported && comparableIdentity
          ? sagejsIdentity === sageIdentity
          : null,
      warmRatioSagejsOverSage:
        bothSupported && sageCase.warmMedianMilliseconds > 0
          ? sagejsCase.warmMedianMilliseconds / sageCase.warmMedianMilliseconds
          : null,
    });
    if (bothSupported && comparableIdentity) {
      assert.equal(sagejsIdentity, sageIdentity, `${key} result identity`);
    }
  }
}

console.log(
  JSON.stringify(
    {
      schema: "sagejs.benchmark/public-polynomial-domains-v1",
      workload: {
        coefficientGeneration:
          "fixed 64-bit LCG seeds and deterministic extension/cyclotomic formulas",
        warmSamples: samples,
        timingPolicy:
          "first public invocation plus median per-operation time; informational only",
        timingGates:
          "none; especially no sub-5 ms gate without an explicit noise margin",
        resultPolicy:
          "deterministic algebraic identities; format checksums and serialization byte lengths are runtime metadata",
      },
      host: {
        platform: process.platform,
        architecture: process.arch,
        node: process.version,
        cpu: require("node:os").cpus()[0]?.model || null,
        cpuCount: require("node:os").cpus().length,
        totalMemoryBytes: require("node:os").totalmem(),
      },
      domains: Object.fromEntries(
        Object.entries(representations).map(([id, entry]) => [
          id,
          { label: entry.label },
        ]),
      ),
      sageMath: {
        requested: process.env.SAGEJS_POLYNOMIAL_DOMAIN_SAGE !== "0",
        available: sage !== null,
        executable: sage,
      },
      runtimes,
      comparisons,
    },
    null,
    2,
  ),
);
