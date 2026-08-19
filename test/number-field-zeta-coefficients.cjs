#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");
const coefficientPath = join(
  root,
  "src/lib/sagejs/number_fields/zeta_coefficients.py",
);
const eulerPath = join(
  root,
  "src/lib/sagejs/number_fields/euler_products.py",
);
const coefficientSource = readFileSync(coefficientPath, "utf8");
const eulerSource = readFileSync(eulerPath, "utf8");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

function sourceWithoutFuture(source) {
  return source.replace("from __future__ import annotations\n", "");
}

function eulerWithoutCoefficientImport(source) {
  const begin = source.indexOf(
    "from sagejs.number_fields.zeta_coefficients import (",
  );
  const end = source.indexOf(")\n", begin);
  assert.notEqual(begin, -1);
  assert.notEqual(end, -1);
  return source.slice(0, begin) + source.slice(end + 2);
}

function runSagejs(witness) {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-zeta-coefficients-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(
      filename,
      `${sourceWithoutFuture(coefficientSource)}\n${sourceWithoutFuture(
        eulerWithoutCoefficientImport(eulerSource),
      )}\n${witness}\n`,
    );
    return run(process.execPath, [join(root, "bin/sagejs"), filename], {
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runCPython(witness) {
  const mpmathDirectory = join(root, "src/lib/mpmath");
  const mpmathPath = join(mpmathDirectory, "__init__.py");
  const bootstrap = String.raw`
import importlib.util
import sys
import types

mpmath_spec = importlib.util.spec_from_file_location(
    "mpmath",
    ${JSON.stringify(mpmathPath)},
    submodule_search_locations=[${JSON.stringify(mpmathDirectory)}],
)
mpmath_module = importlib.util.module_from_spec(mpmath_spec)
sys.modules["mpmath"] = mpmath_module
mpmath_spec.loader.exec_module(mpmath_module)

sagejs = types.ModuleType("sagejs")
number_fields = types.ModuleType("sagejs.number_fields")
sagejs.number_fields = number_fields
sys.modules["sagejs"] = sagejs
sys.modules["sagejs.number_fields"] = number_fields

for module_name, module_path in [
    ("sagejs.number_fields.zeta_coefficients", ${JSON.stringify(coefficientPath)}),
    ("sagejs.number_fields.euler_products", ${JSON.stringify(eulerPath)}),
]:
    spec = importlib.util.spec_from_file_location(module_name, module_path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    for exported_name in module.__all__:
        globals()[exported_name] = getattr(module, exported_name)
`;
  return run(pythonExecutable(), ["-I", "-c", `${bootstrap}\n${witness}`]);
}

const exactWitness = String.raw`
def chi5(n):
    residue = n % 5
    if residue == 0:
        return 0
    return 1 if residue in [1, 4] else -1

def quadratic_provider(start, stop):
    records = []
    for prime in range(max(2, start), stop):
        is_prime = True
        divisor = 2
        while divisor * divisor <= prime:
            if prime % divisor == 0:
                is_prime = False
                break
            divisor += 1
        if not is_prime:
            continue
        if prime == 5:
            factors = [(2, 1)]
        elif chi5(prime) == 1:
            factors = [(1, 1), (1, 1)]
        else:
            factors = [(1, 2)]
        records.append({"version": 1, "prime": prime, "factors": factors})
    return records

def divisors(value):
    return [divisor for divisor in range(1, value + 1) if value % divisor == 0]

assert local_zeta_coefficients([1, 1], 5) == [1, 2, 3, 4, 5, 6]
assert local_zeta_coefficients([2], 5) == [1, 0, 1, 0, 1, 0]
assert local_zeta_denominator([1, 2]) == [1, -1, -1, 1]
assert zeta_coefficients(0, degree=2, splitting_provider=quadratic_provider) == []
factor_data = list(local_zeta_factors(
    quadratic_provider, 2, 6, degree=2
))
assert [factor["prime"] for factor in factor_data] == [2, 3, 5]
assert factor_data[0]["denominator"] == [1, 0, -1]
assert factor_data[2]["denominator"] == [1, -1]
coefficients = zeta_coefficients(
    500, degree=2, splitting_provider=quadratic_provider
)
convolution = [
    sum(chi5(divisor) for divisor in divisors(value))
    for value in range(1, 501)
]
assert coefficients == convolution
assert coefficients[:10] == [1, 0, 0, 1, 1, 0, 0, 0, 1, 0]
# Offline Sage 10.9/PARI oracle for x^3-x-1.  The ramified factor at 23 also
# checks that e authenticates the local degree but does not enter Z_p(T).
cubic_splits = {
    2: [(1, 3)], 3: [(1, 3)], 5: [(1, 1), (1, 2)],
    7: [(1, 1), (1, 2)], 11: [(1, 1), (1, 2)], 13: [(1, 3)],
    17: [(1, 1), (1, 2)], 19: [(1, 1), (1, 2)],
    23: [(1, 1), (2, 1)], 29: [(1, 3)],
}
def cubic_provider(start, stop):
    return [
        {"version": 1, "prime": prime, "factors": cubic_splits[prime]}
        for prime in sorted(cubic_splits)
        if start <= prime < stop
    ]
assert zeta_coefficients(30, degree=3, splitting_provider=cubic_provider) == [
    1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0,
    0, 1, 0, 1, 0, 0, 0, 2, 0, 2, 0, 1, 0, 0, 0,
]
blocks = [
    block.as_dict()
    for block in coefficient_blocks(coefficients[:7], block_size=3)
]
assert blocks == [
    {"version": 1, "start": 1, "coefficients": [1, 0, 0]},
    {"version": 1, "start": 4, "coefficients": [1, 1, 0]},
    {"version": 1, "start": 7, "coefficients": [0]},
]
streamed_blocks = [
    block.as_dict()
    for block in zeta_coefficient_blocks(
        7, degree=2, splitting_provider=quadratic_provider, block_size=3
    )
]
assert streamed_blocks == blocks
try:
    list(compact_splitting_records(
        lambda start, stop: [], 2, 4, degree=2
    ))
    raise AssertionError("an incomplete splitting stream was accepted")
except SplittingStreamError:
    pass
`;

const numericWitness = String.raw`
${exactWitness}
direct = dirichlet_series(
    (2.5, 1), 500, degree=2, coefficients=coefficients, prec=100
)
product = euler_product(
    (2.5, 1), 499, degree=2,
    splitting_provider=quadratic_provider, prec=100
)
direct_value = complex(float(direct["value_real"]), float(direct["value_imag"]))
product_value = complex(float(product["value_real"]), float(product["value_imag"]))
assert abs(direct_value - product_value) < 0.001
assert direct["rigorous"] is False
assert "not outward-rounded" in direct["analytic_tail_bound_status"]
assert "not outward-rounded" in product["analytic_tail_bound_status"]
try:
    euler_product(1, 10, degree=2, splitting_provider=quadratic_provider)
    raise AssertionError("the convergence boundary was accepted")
except ZetaHalfPlaneDomainError:
    pass
try:
    dirichlet_series(2, 10, degree=2, coefficients=coefficients, rigorous=True)
    raise AssertionError("a midpoint was relabelled as a rigorous enclosure")
except RigorousEnclosureUnavailableError:
    pass
`;

test("exact Dedekind-zeta coefficients agree with quadratic convolution", () => {
  runCPython(exactWitness);
  if (process.env.SAGEJS_SKIP_GENERATED !== "1") runSagejs(exactWitness);
});

test("right-half-plane evaluators retain honest tail diagnostics", () => {
  runCPython(numericWitness);
  if (process.env.SAGEJS_SKIP_GENERATED !== "1") runSagejs(numericWitness);
});
