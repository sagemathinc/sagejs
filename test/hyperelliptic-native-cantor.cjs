"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const source = join(
  root,
  "src",
  "lib",
  "sagejs",
  "hyperelliptic_curves",
  "jacobian_kernels.py",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 300_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const witness = String.raw`
from sagejs.native import is_compiled
from sagejs.hyperelliptic_curves.jacobian_kernels import (
    packed_cantor_add_batch,
    packed_cantor_progression_batch,
    packed_cantor_scalar_batch,
)

compiled = is_compiled(packed_cantor_add_batch)
assert compiled == is_compiled(packed_cantor_scalar_batch)
assert compiled == is_compiled(packed_cantor_progression_batch)
selected = "native" if compiled else "reference"


def scalar_operations(scalar):
    magnitude = abs(scalar)
    bits = 0
    ones = 0
    while magnitude:
        bits += 1
        ones += magnitude % 2
        magnitude //= 2
    return ones + max(0, bits - 1)


def check_curve(curve, exhaustive):
    J = curve.jacobian()
    context = J.prepared_arithmetic()
    assert context is J.prepared_arithmetic()
    capability = context.capability()
    assert capability.schema == "sagejs.hyperelliptic.packed-mumford.odd.v1"
    assert capability.model_kind == "odd-degree-one-infinity"
    assert capability.selected == selected
    points = J.points(max_elements=10000, max_candidates=100000)

    for point in points:
        row = context.pack(point)
        assert len(row) == 8
        assert context.unpack(row) == point
        assert context.fingerprint(point) == context.fingerprint(point)

    sample = points if exhaustive else points[:min(48, len(points))]
    if exhaustive:
        left = [a for a in sample for _b in sample]
        right = [b for _a in sample for b in sample]
    else:
        left = sample
        right = [sample[(17 * index + 3) % len(sample)] for index in range(len(sample))]
    expected = J.prepared_arithmetic(algorithm="reference").add_batch(
        left, right, algorithm="reference"
    )
    actual, diagnostics = context.add_batch(
        left, right, algorithm=selected, diagnostics=True
    )
    assert actual == expected
    assert diagnostics.selected == selected
    observed_statuses = set(diagnostics.statuses) if compiled else set()
    if not compiled:
        # Exercise the exact same typed source body as the native artifact, not
        # merely the public reference fallback selected when artifacts are off.
        raw_output = [0] * (8 * len(left))
        raw_status = [0] * len(left)
        assert packed_cantor_add_batch(
            raw_output,
            raw_status,
            list(context.model_coefficients),
            [word for point in left for word in context.pack(point)],
            [word for point in right for word in context.pack(point)],
            len(left),
            context.genus,
            context.prime,
        )
        source_answer = tuple(
            context.unpack(raw_output[8 * index:8 * index + 8])
            for index in range(len(left))
        )
        assert source_answer == expected
        if exhaustive:
            observed_statuses = set(raw_status)

    doubled = context.double_batch(sample, algorithm=selected)
    doubled_reference = J.prepared_arithmetic(algorithm="reference").double_batch(
        sample, algorithm="reference"
    )
    assert doubled == doubled_reference

    progression = context.progression_batch(
        sample[0], sample[1], 19, algorithm=selected
    )
    progression_reference = context.progression_batch(
        sample[0], sample[1], 19, algorithm="reference"
    )
    assert progression == progression_reference
    packed_progression = context.progression_batch(
        sample[0], sample[1], 19, algorithm=selected, packed=True
    )
    assert tuple(context.unpack(row) for row in packed_progression) == progression_reference
    if not compiled:
        raw_output = [0] * (19 * 8)
        raw_status = [0] * 19
        assert packed_cantor_progression_batch(
            raw_output,
            raw_status,
            list(context.model_coefficients),
            list(context.pack(sample[0])),
            list(context.pack(sample[1])),
            19,
            context.genus,
            context.prime,
        )
        source_progression = tuple(
            context.unpack(raw_output[8 * index:8 * index + 8])
            for index in range(19)
        )
        assert source_progression == progression_reference

    scalars = [
        -(2**130 + 17), -257, -1, 0, 1, 2, 17, 2**128 + 12345
    ]
    scalar_points = [sample[index % len(sample)] for index in range(len(scalars))]
    products, scalar_diagnostics = context.scalar_batch(
        scalar_points, scalars, algorithm=selected, diagnostics=True
    )
    reference_products = J.prepared_arithmetic(algorithm="reference").scalar_batch(
        scalar_points, scalars, algorithm="reference"
    )
    assert products == reference_products
    operation_statuses = tuple(
        scalar_operations(scalar) + 1 for scalar in scalars
    )
    if compiled:
        assert scalar_diagnostics.statuses == operation_statuses
    if not compiled:
        maximum_bits = max(abs(value).bit_length() for value in scalars)
        words_per_scalar = max(1, (maximum_bits + 63) // 64)
        scalar_words = []
        signs = []
        for scalar in scalars:
            signs.append(1 if scalar < 0 else 0)
            magnitude = abs(scalar)
            for _index in range(words_per_scalar):
                scalar_words.append(magnitude % (1 << 64))
                magnitude //= 1 << 64
        raw_output = [0] * (8 * len(scalars))
        raw_status = [0] * len(scalars)
        assert packed_cantor_scalar_batch(
            raw_output,
            raw_status,
            list(context.model_coefficients),
            [word for point in scalar_points for word in context.pack(point)],
            scalar_words,
            signs,
            len(scalars),
            words_per_scalar,
            context.genus,
            context.prime,
        )
        source_products = tuple(
            context.unpack(raw_output[8 * index:8 * index + 8])
            for index in range(len(scalars))
        )
        assert source_products == reference_products
        assert tuple(raw_status) == operation_statuses

    assert context.sum(sample, algorithm=selected) == context.sum(
        sample, algorithm="reference"
    )
    try:
        J.prepared_arithmetic(max_batch_items=2).add_batch(sample[:3], sample[:3])
    except RuntimeError:
        pass
    else:
        raise AssertionError("batch resource limit was ignored")
    try:
        context.scalar_batch(sample[:1], [17], max_group_operations=2)
    except RuntimeError:
        pass
    else:
        raise AssertionError("scalar operation resource limit was ignored")
    try:
        context.progression_batch(
            sample[0], sample[1], 4, max_group_operations=2
        )
    except RuntimeError:
        pass
    else:
        raise AssertionError("progression operation resource limit was ignored")
    return len(points), context.model_fingerprint, tuple(sorted(observed_statuses))


R = PolynomialRing(GF(3), "x")
x = R.gen()
rows = []
rows.append(check_curve(HyperellipticCurve(x**5 + x**2 + 1), True))
rows.append(check_curve(HyperellipticCurve(x**5 + x**2 + 2, x), True))
rows.append(check_curve(HyperellipticCurve(x**7 + x + 2), False))
rows.append(check_curve(HyperellipticCurve(x**7 + x + 2, x**2 + 1), False))
assert set(rows[0][2] + rows[1][2]) == {1, 2, 3, 4, 5}

# Parent and curve identity are never inferred from coincident coefficients.
J0 = HyperellipticCurve(x**5 + x**2 + 1).jacobian()
J1 = HyperellipticCurve(x**5 + x**2 + 2, x).jacobian()
try:
    J0.prepared_arithmetic().pack(J1.zero())
except ValueError:
    pass
else:
    raise AssertionError("cross-model divisor accepted")
assert J0.prepared_arithmetic().model_fingerprint != J1.prepared_arithmetic().model_fingerprint

try:
    HyperellipticCurve(x**6 + x + 1).jacobian()
except NotImplementedError as error:
    assert "odd-degree model" in str(error)
else:
    raise AssertionError("even-degree Jacobian was ambiguously accepted by v1")

print("compiled=" + str(compiled))
print("rows=" + repr(rows))
print("HYPERELLIPTIC_NATIVE_CANTOR_OK")
`;

test("prepared packed Cantor arithmetic is exact in dynamic and native modes", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-cantor-native-"));
  const cache = join(temporary, "cache");
  const program = join(temporary, "witness.py");
  try {
    writeFileSync(program, witness);
    const explanation = run(process.execPath, [
      sagejs,
      "native",
      "explain",
      source,
      "--function",
      "packed_cantor_add_batch",
    ]);
    assert.match(explanation, /host-isolated core: yes/);
    assert.match(explanation, /0 callbacks inside core/);
    run(process.execPath, [
      sagejs,
      "native",
      "compile",
      source,
      "--cache-root",
      cache,
    ]);
    const native = run(process.execPath, [sagejs, program], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
      },
    });
    const dynamic = run(process.execPath, [sagejs, program], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(dynamic, /compiled=False/);
    assert.match(native, /HYPERELLIPTIC_NATIVE_CANTOR_OK/);
    assert.match(dynamic, /HYPERELLIPTIC_NATIVE_CANTOR_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("packed Cantor kernels retain an ordinary CPython fallback", () => {
  const program = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.hyperelliptic_curves.jacobian_kernels import packed_cantor_add_batch, packed_cantor_progression_batch, packed_cantor_scalar_batch",
    "model = [1,1,0,0,0,1,0,0] + [0]*4",
    "identity = [0,1,0,0,0,0,0,0]",
    "out = [99]*16; status = [0,0]",
    "assert packed_cantor_add_batch(out,status,model,identity*2,identity*2,2,2,3)",
    "assert out == identity*2 and status == [5,5]",
    "progression_out = [99]*16; progression_status = [0,0]",
    "assert packed_cantor_progression_batch(progression_out,progression_status,model,identity,identity,2,2,3)",
    "assert progression_out == identity*2 and progression_status == [5,5]",
    "scalar_out = [99]*8; scalar_status = [0]",
    "assert packed_cantor_scalar_batch(scalar_out,scalar_status,model,identity,[0],[0],1,1,2,3)",
    "assert scalar_out == identity",
    "print('cpython-ok')",
  ].join("\n");
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(run(python, ["-I", "-c", program]), "cpython-ok");
});
