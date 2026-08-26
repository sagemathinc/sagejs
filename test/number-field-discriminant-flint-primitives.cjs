#!/usr/bin/env node
// sagejs-test-tier: integration
"use strict";

const assert = require("node:assert/strict");
const {
  existsSync,
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
const modulePath = join(
  root,
  "src/lib/sagejs/number_fields/discriminant_flint_primitives.py",
);
const moduleSource = readFileSync(modulePath, "utf8");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 120_000,
    ...options,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

const witness = String.raw`
def readable_power(value):
    number = int(value)
    if number in (-1, 0, 1):
        return number, 1
    magnitude = abs(number)
    for exponent in range(magnitude.bit_length(), 1, -1):
        if number < 0 and exponent % 2 == 0:
            continue
        low = 1
        high = 1 << ((magnitude.bit_length() + exponent - 1) // exponent)
        while low <= high:
            middle = (low + high) // 2
            power = middle**exponent
            if power <= magnitude:
                low = middle + 1
            else:
                high = middle - 1
        if high**exponent == magnitude:
            return (-high if number < 0 else high), exponent
    return number, 1

# One FLINT call need not be maximal.  The contract repeats 4096 -> 64^2,
# 64 -> 8^2, and 8 -> 2^3 to recover the maximal exponent 12.
positive_steps = {4096: (64, 2), 64: (8, 2), 8: (2, 3)}
assert iterated_perfect_power_oracle(
    4096, lambda value: positive_steps.get(value)
) == (2, 12)
negative_steps = {-134217728: (-512, 3), -512: (-8, 3), -8: (-2, 3)}
assert iterated_perfect_power_oracle(
    -134217728, lambda value: negative_steps.get(value)
) == (-2, 27)
for special in (-1, 0, 1):
    assert iterated_perfect_power_oracle(special, lambda _value: (99, 99)) == (
        special,
        1,
    )
assert iterated_perfect_power_oracle(64, lambda _value: (4, 2)) is None
assert iterated_perfect_power_oracle(64, lambda _value: (8, 99)) is None
assert iterated_perfect_power_oracle(64, lambda _value: (64, 2)) is None
assert iterated_perfect_power_oracle(64, lambda _value: (_ for _ in ()).throw(
    RuntimeError("unavailable")
)) is None

assert perfect_power_hint(4096, readable_power, lambda _value: (2, 12)) == (2, 12)
assert perfect_power_hint(-343, readable_power, lambda _value: (-7, 3)) == (-7, 3)
assert perfect_power_hint(12, readable_power, lambda value: (value, 1)) == (12, 1)
for special in (-1, 0, 1):
    assert perfect_power_hint(
        special, readable_power, lambda _value: (_ for _ in ()).throw(RuntimeError())
    ) == (special, 1)

# Exact identity, sign, exponent capacity, and primitive-base corruption all
# select the readable caller's fallback rather than authenticating bad data.
assert perfect_power_hint(64, readable_power, lambda _value: (3, 6)) is None
assert perfect_power_hint(64, readable_power, lambda _value: (-2, 6)) is None
assert perfect_power_hint(-64, readable_power, lambda _value: (-2, 6)) is None
assert perfect_power_hint(64, readable_power, lambda _value: (4, 3)) is None
assert perfect_power_hint(64, readable_power, lambda _value: (2, 10**9)) is None
assert perfect_power_hint(64, readable_power, lambda _value: None) is None
assert perfect_power_hint(
    64, readable_power, lambda _value: (_ for _ in ()).throw(RuntimeError())
) is None

class FakeResource:
    def __init__(self, entries):
        self.entries = entries
        self.closed = False

    def close(self):
        self.closed = True

class FakeFlint:
    def __init__(self, entries, length=None):
        self.resource = FakeResource(entries)
        self.length = len(entries) if length is None else length

    def fmpz_perfect_power_data(self, _number):
        return self.resource

    def fmpz_vector_length(self, _resource):
        return self.length

    def fmpz_vector_entry(self, resource, index):
        return resource.entries[index]

good_flint = FakeFlint([2, 12])
assert _generated_perfect_power_candidate(4096, good_flint) == (2, 12)
assert good_flint.resource.closed
bad_length_flint = FakeFlint([2, 12], 3)
assert _generated_perfect_power_candidate(4096, bad_length_flint) is None
assert bad_length_flint.resource.closed
bad_entry_flint = FakeFlint([2])
bad_entry_flint.length = 2
assert _generated_perfect_power_candidate(4096, bad_entry_flint) is None
assert bad_entry_flint.resource.closed
assert _generated_perfect_power_candidate(4096, object()) is None

class FakePrimeFlint:
    def __init__(self, result):
        self.result = result

    def fmpz_is_probabprime(self, _number):
        return self.result

assert _generated_probable_prime_screen(97, FakePrimeFlint(True)) is True
assert _generated_probable_prime_screen(91, FakePrimeFlint(False)) is False
assert _generated_probable_prime_screen(91, FakePrimeFlint(0)) is False
assert _generated_probable_prime_screen(91, FakePrimeFlint(2)) is None
assert _generated_probable_prime_screen(91, object()) is None

large = (1 << 127) - 1
bases = (2, 3, 5, 7)
assert large_primality_hint(97, lambda _n, _b: False, bases, lambda _n: True) is None
survivor = large_primality_hint(
    large, lambda _n, _b: (_ for _ in ()).throw(AssertionError()), bases,
    lambda _n: True,
)
assert survivor[0] == PROBABLE_PRIME
assert survivor[1]["kind"] == "flint-probable-prime-screen"

seen = []
def third_base_witness(_number, base):
    seen.append(base)
    return base == 5
rejected = large_primality_hint(large, third_base_witness, bases, lambda _n: False)
assert rejected == (
    COMPOSITE,
    {"kind": "miller-rabin-witness", "base": 5, "scheduler": "fmpz_is_probabprime"},
)
assert seen == [2, 3, 5]

# A FLINT-only rejection (for example its Lucas phase) is not a certificate.
# Every readable base is replayed exactly once and the state remains probable.
seen = []
no_witness = large_primality_hint(
    large,
    lambda _number, base: seen.append(base) or False,
    bases,
    lambda _n: False,
)
assert no_witness[0] == PROBABLE_PRIME
assert no_witness[1]["bases"] == list(bases)
assert seen == list(bases)

# Invalid/capability-missing screen results are no-hint fallbacks.  A corrupt
# survivor can weaken scheduling only to probable; it can never say proven.
assert large_primality_hint(large, lambda _n, _b: False, bases, lambda _n: 1) is None
assert large_primality_hint(
    large,
    lambda _n, _b: False,
    bases,
    lambda _n: (_ for _ in ()).throw(RuntimeError("Windows fallback")),
) is None
corrupt_survivor = large_primality_hint(
    large * 3, lambda _n, _b: True, bases, lambda _n: True
)
assert corrupt_survivor[0] == PROBABLE_PRIME
assert corrupt_survivor[0] != "proven-prime"

print("ok")
`;

test("ordinary FLINT primitive policy is CPython-parseable", () => {
  const python = pythonExecutable();
  const bootstrap = String.raw`
import importlib.util
spec = importlib.util.spec_from_file_location("flint_policy", ${JSON.stringify(modulePath)})
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
globals().update(module.__dict__)
`;
  run(python, ["-I", "-c", `${bootstrap}\n${witness}`]);
});

test("ordinary FLINT primitive policy has the same Sage fallback semantics", {
  skip: !existsSync(join(root, "dist/tools/cli.js")) && "Sage.js is not built",
}, () => {
  const directory = mkdtempSync(join(tmpdir(), "sagejs-flint-primitives-"));
  const filename = join(directory, "witness.py");
  try {
    writeFileSync(filename, `${moduleSource}\n${witness}\n`);
    run(process.execPath, [join(root, "bin/sagejs"), filename], {
      env: { ...process.env, SAGEJS_NATIVE_DISABLE: "1" },
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("policy source stays free of eager generated-FFI imports", () => {
  assert.doesNotMatch(moduleSource, /^from sagejs\.ffi/mu);
  assert.match(moduleSource, /fmpz_is_probabprime/);
  assert.match(moduleSource, /fmpz_perfect_power_data/);
  assert.match(moduleSource, /base\*\*exponent != number/);
});
