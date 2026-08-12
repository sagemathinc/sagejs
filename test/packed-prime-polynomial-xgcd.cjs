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
    gcd_output = buffer(capacity)
    left_output = buffer(capacity)
    right_output = buffer(capacity)
    lengths = buffer(3)
    workspace = buffer(7 * capacity)
    exact_prime = runtime.bigint(prime) if compiled_kernel else prime
    accepted = packed_prime_field_polynomial_xgcd(
        gcd_output,
        left_output,
        right_output,
        lengths,
        buffer(left),
        buffer(right),
        workspace,
        exact_prime,
    )
    assert accepted
    return (
        [int(gcd_output[index]) for index in range(int(lengths[0]))],
        [int(left_output[index]) for index in range(int(lengths[1]))],
        [int(right_output[index]) for index in range(int(lengths[2]))],
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
assert invoke([], [], 7) == ([], [], [1])
assert invoke([], [2, 1], 7) == ([2, 1], [], [1])
assert invoke([2, 1], [], 7) == ([2, 1], [1], [])
assert invoke([2, 3, 1], [3, 4, 1], 7) == ([1, 1], [6], [1])
assert invoke([1, 0, 1], [1, 1], 2) == ([1, 1], [], [1])
assert invoke([6, 2, 5, 1], [3, 4, 1], 7) == (
    [1], [4, 3], [4, 0, 4]
)
assert invoke([17, 3, 999, 1], [81, 42, 7, 1], 65521) == (
    [1], [62452, 65308, 49434], [50796, 36914, 16087]
)

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

# Shape rejection is transactional for all public outputs.
gcd_output = buffer([91, 92])
left_output = buffer([81, 82])
right_output = buffer([71, 72])
lengths = buffer([61, 62, 63])
assert not packed_prime_field_polynomial_xgcd(
    gcd_output,
    left_output,
    right_output,
    lengths,
    buffer([1, 1]),
    buffer([1]),
    buffer(13),
    7,
)
assert [int(value) for value in gcd_output] == [91, 92]
assert [int(value) for value in left_output] == [81, 82]
assert [int(value) for value in right_output] == [71, 72]
assert [int(value) for value in lengths] == [61, 62, 63]

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
    "    g, s, t, lengths, work = [0]*n, [0]*n, [0]*n, [0]*3, [0]*(7*n)",
    "    assert xgcd(g, s, t, lengths, a, b, work, p)",
    "    return g[:lengths[0]], s[:lengths[1]], t[:lengths[2]]",
    "assert invoke([], [], 7) == ([], [], [1])",
    "assert invoke([2, 3, 1], [3, 4, 1], 7) == ([1, 1], [6], [1])",
    "assert invoke([1, 0, 1], [1, 1], 2) == ([1, 1], [], [1])",
    "print('cpython-ok')",
    "",
  ].join("\n");
  const python = process.env.PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  assert.equal(run(python, ["-I", "-c", program]), "cpython-ok");
});
