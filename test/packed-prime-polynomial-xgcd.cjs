"use strict";

const assert = require("node:assert/strict");
const { mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");

const root = join(__dirname, "..");
const sagejs = join(root, "bin", "sagejs");
const kernelSource = join(
  root,
  "src",
  "lib",
  "sagejs",
  "polynomial_algorithms",
  "packed_prime_xgcd.py",
);

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
    env: { ...process.env, ...options.env },
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
}

const sageWitness = String.raw`
import sagejs.runtime as runtime
from sagejs.polynomial_algorithms.packed_prime_xgcd import packed_prime_field_polynomial_xgcd
from sagejs.native import is_compiled

compiled_kernel = is_compiled(packed_prime_field_polynomial_xgcd)


def buffer(source):
    if compiled_kernel:
        return runtime.uint64_buffer(source)
    if isinstance(source, int):
        return [0] * source
    return list(source)


def invoke(left, right, prime):
    capacity = max(1, len(left), len(right))
    output = buffer(3 * capacity + 3)
    exact_prime = runtime.bigint(prime) if compiled_kernel else prime
    accepted = packed_prime_field_polynomial_xgcd(
        output,
        buffer(left),
        buffer(right),
        exact_prime,
    )
    assert accepted
    lengths_offset = 3 * capacity
    gcd_length = int(output[lengths_offset])
    left_length = int(output[lengths_offset + 1])
    right_length = int(output[lengths_offset + 2])
    return (
        [int(output[index]) for index in range(gcd_length)],
        [int(output[capacity + index]) for index in range(left_length)],
        [int(output[2 * capacity + index]) for index in range(right_length)],
    )


def trim(values):
    answer = list(values)
    while answer and answer[-1] == 0:
        answer.pop()
    return answer


def multiply(left, right, prime):
    if not left or not right:
        return []
    output = [0] * (len(left) + len(right) - 1)
    for left_index in range(len(left)):
        for right_index in range(len(right)):
            target = left_index + right_index
            output[target] = (
                output[target] + left[left_index] * right[right_index]
            ) % prime
    return trim(output)


def add(left, right, prime):
    output = [0] * max(len(left), len(right))
    for index in range(len(output)):
        if index < len(left):
            output[index] += left[index]
        if index < len(right):
            output[index] += right[index]
        output[index] %= prime
    return trim(output)


def remainder(dividend, divisor, prime):
    output = trim(dividend)
    assert divisor[-1] == 1
    while len(output) >= len(divisor):
        shift = len(output) - len(divisor)
        factor = output[-1]
        for index in range(len(divisor)):
            output[index + shift] = (
                output[index + shift] - factor * divisor[index]
            ) % prime
        output = trim(output)
    return output


def check(left, right, prime):
    gcd_value, left_coefficient, right_coefficient = invoke(left, right, prime)
    assert add(
        multiply(left_coefficient, left, prime),
        multiply(right_coefficient, right, prime),
        prime,
    ) == gcd_value
    if gcd_value:
        assert gcd_value[-1] == 1
        assert remainder(left, gcd_value, prime) == []
        assert remainder(right, gcd_value, prime) == []
    return gcd_value, left_coefficient, right_coefficient


# These exact triples are Sage 10.9 fixtures, including its zero convention.
assert invoke([], [], 7) == ([], [], [])
assert invoke([], [2, 1], 7) == ([2, 1], [], [1])
assert invoke([2, 1], [], 7) == ([2, 1], [1], [])
assert invoke([3], [], 7) == ([1], [5], [])
assert invoke([], [3], 7) == ([1], [], [5])
assert invoke([2, 3, 1], [3, 4, 1], 7) == ([1, 1], [6], [1])
assert invoke([1, 0, 1], [1, 1], 2) == ([1, 1], [], [1])
assert invoke([6, 2, 5, 1], [3, 4, 1], 7) == (
    [1], [4, 3], [4, 0, 4]
)
assert invoke([17, 3, 999, 1], [81, 42, 7, 1], 65521) == (
    [1], [62452, 65308, 49434], [50796, 36914, 16087]
)

# The largest 32-bit prime exercises the complete declared modulus domain.
check([4294967290, 2, 1], [17, 1], 4294967291)

seed = 0x12345678
for prime in [2, 7, 65521]:
    for trial in range(36):
        left = []
        right = []
        for _index in range((trial * 11) % 43):
            seed = (1664525 * seed + 1013904223) % (2**32)
            left.append(seed % prime)
        for _index in range((trial * 17) % 39):
            seed = (1664525 * seed + 1013904223) % (2**32)
            right.append(seed % prime)
        check(trim(left), trim(right), prime)

# Non-coprime inputs retain a monic common factor.
for prime in [2, 7, 65521]:
    common = [1, 1, 1]
    check(multiply(common, [3 % prime, 1], prime), multiply(common, [5 % prime, 1], prime), prime)

# Shape rejection is transactional.
output = buffer([91, 92, 93, 94, 95, 96, 97, 98])
assert not packed_prime_field_polynomial_xgcd(
    output,
    buffer([1, 1]),
    buffer([1]),
    7,
)
assert [int(value) for value in output] == [91, 92, 93, 94, 95, 96, 97, 98]


def invalid_modulus_precedes_shape(prime):
    # Generated argument conversion rejects PrimeFieldModulus before the body
    # can inspect output shape. The same-source fallback must do the same.
    output = buffer([91])
    try:
        packed_prime_field_polynomial_xgcd(
            output,
            buffer([1]),
            buffer([1]),
            runtime.bigint(prime) if compiled_kernel else prime,
        )
    except ValueError:
        pass
    else:
        raise AssertionError("invalid modulus was hidden by invalid output shape")
    assert [int(value) for value in output] == [91]


for invalid_prime in [0, 1, 4294967296]:
    invalid_modulus_precedes_shape(invalid_prime)


def rejected(left, right, prime):
    capacity = max(1, len(left), len(right))
    sentinel = list(range(71, 71 + 3 * capacity + 3))
    output = buffer(sentinel)
    assert not packed_prime_field_polynomial_xgcd(
        output,
        buffer(left),
        buffer(right),
        runtime.bigint(prime) if compiled_kernel else prime,
    )
    assert [int(value) for value in output] == sentinel


# Composite moduli, nonunit leading terms, and noncanonical residues fail
# before division and never publish a partial result.
rejected([1], [2, 2], 8)
rejected([1, 1], [2, 1], 9)
rejected([1, 7], [1], 7)
rejected([1], [1, 9], 7)

# The compiled single-output ABI is safe even when its typed view overlaps both
# inputs. The dynamic and CPython fallbacks use ordinary Python sequences.
if compiled_kernel:
    backing = runtime.uint64_buffer(18)
    backing[2] = runtime.bigint(2)
    backing[3] = runtime.bigint(3)
    backing[4] = runtime.bigint(1)
    backing[6] = runtime.bigint(3)
    backing[7] = runtime.bigint(4)
    backing[8] = runtime.bigint(1)
    subarray = runtime.reflect.get(backing, "subarray")
    overlap_output = runtime.reflect.apply(subarray, backing, [0, 12])
    overlap_left = runtime.reflect.apply(subarray, backing, [2, 5])
    overlap_right = runtime.reflect.apply(subarray, backing, [6, 9])
    assert packed_prime_field_polynomial_xgcd(
        overlap_output,
        overlap_left,
        overlap_right,
        runtime.bigint(7),
    )
    assert [int(overlap_output[index]) for index in range(12)] == [
        1, 1, 0, 6, 0, 0, 1, 0, 0, 2, 1, 1
    ]
    shared_input = runtime.uint64_buffer([2, 3, 1])
    shared_output = runtime.uint64_buffer(12)
    assert packed_prime_field_polynomial_xgcd(
        shared_output,
        shared_input,
        shared_input,
        runtime.bigint(7),
    )
    assert [int(shared_output[index]) for index in range(12)] == [
        2, 3, 1, 0, 0, 0, 1, 0, 0, 3, 0, 1
    ]

print("compiled=" + str(compiled_kernel))
print("PACKED_PRIME_POLYNOMIAL_XGCD_OK")
`;

test("packed GF(p)[x] xgcd is source-transparent and differential", () => {
  const temporary = mkdtempSync(join(tmpdir(), "sagejs-prime-poly-xgcd-"));
  const cache = join(temporary, "cache");
  const witness = join(temporary, "witness.py");
  try {
    writeFileSync(witness, sageWitness);
    const explanation = run(sagejs, [
      "native",
      "explain",
      kernelSource,
      "--function",
      "packed_prime_field_polynomial_xgcd",
    ]);
    assert.match(explanation, /kernel: prime-field-source/);
    assert.match(explanation, /host-isolated core: yes/);
    assert.match(explanation, /0 callbacks inside core/);

    run(sagejs, ["native", "compile", kernelSource, "--cache-root", cache]);
    const native = run(sagejs, [witness], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_REQUIRED: "1",
      },
    });
    const dynamic = run(sagejs, [witness], {
      env: {
        SAGEJS_NATIVE_CACHE_DIR: cache,
        SAGEJS_NATIVE_DISABLE: "1",
      },
    });
    assert.match(native, /compiled=True/);
    assert.match(dynamic, /compiled=False/);
    assert.match(native, /PACKED_PRIME_POLYNOMIAL_XGCD_OK/);
    assert.match(dynamic, /PACKED_PRIME_POLYNOMIAL_XGCD_OK/);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("packed GF(p)[x] xgcd has an ordinary CPython fallback", () => {
  const program = [
    "import sys",
    `sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})`,
    "from sagejs.polynomial_algorithms.packed_prime_xgcd import packed_prime_field_polynomial_xgcd as xgcd",
    "def invoke(a, b, p):",
    "    n = max(1, len(a), len(b))",
    "    out = [0] * (3*n + 3)",
    "    assert xgcd(out, a, b, p)",
    "    lengths = out[3*n:]",
    "    return out[:lengths[0]], out[n:n+lengths[1]], out[2*n:2*n+lengths[2]]",
    "assert invoke([], [], 7) == ([], [], [])",
    "assert invoke([3], [], 7) == ([1], [5], [])",
    "assert invoke([2, 3, 1], [3, 4, 1], 7) == ([1, 1], [6], [1])",
    "assert invoke([1, 0, 1], [1, 1], 2) == ([1, 1], [], [1])",
    "assert invoke([4294967290, 2, 1], [17, 1], 4294967291)[0] == [1]",
    "for a, b, p in [([1], [2, 2], 8), ([1, 1], [2, 1], 9), ([1, 7], [1], 7), ([-1], [1], 7)]:",
    "    out = [91] * (3*max(1, len(a), len(b)) + 3)",
    "    assert not xgcd(out, a, b, p)",
    "    assert all(value == 91 for value in out)",
    "for p in [0, 1, 4294967296]:",
    "    out = [91]",
    "    try:",
    "        xgcd(out, [1], [1], p)",
    "    except ValueError:",
    "        pass",
    "    else:",
    "        raise AssertionError('out-of-range modulus accepted')",
    "    assert out == [91]",
    "print('cpython-ok')",
    "",
  ].join("\n");
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(run(python, ["-I", "-c", program]), "cpython-ok");
});
