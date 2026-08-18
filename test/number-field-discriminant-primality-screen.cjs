#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const { join } = require("node:path");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { pythonExecutable } = require("../tools/python-executable.cjs");

const root = join(__dirname, "..");

const differentialSource = String.raw`
import sagejs.number_fields.discriminant_primality_kernel as screen
from sagejs.native import execution_mode
from sagejs.number_fields.discriminant_components import _miller_rabin_witness

bases = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41]
packed = screen.packed_strong_probable_prime_screen_in_place
dynamic = getattr(packed, "__sagejs_native_source__", packed)

def readable(number):
    for index, base in enumerate(bases):
        if _miller_rabin_witness(number, base):
            return ("witness", index, base)
    return ("survivor", -1, -1)

def normalized(result):
    if result is None:
        return None
    if result["status"] == "witness":
        return ("witness", int(result["index"]), int(result["base"]))
    return ("survivor", -1, -1)

cases = [
    # First-base witness.
    18446744073709551619,
    # 2 is a strong liar for F_5; base 3 is the first witness.
    18446744073709551617,
    # Large survivors remain no-hint outcomes even when known prime.
    18446744073709551629,
    170141183460469231731687303715884105727,
]
for number in cases:
    expected = readable(number)
    dynamic_result = screen.validated_strong_probable_prime_screen(
        number, bases, _miller_rabin_witness, kernel=dynamic
    )
    packed_result = screen.validated_strong_probable_prime_screen(
        number, bases, _miller_rabin_witness, kernel=packed
    )
    assert normalized(dynamic_result) == expected
    assert normalized(packed_result) == expected

# Genuine witness publication is replayed exactly once.
replays = []
def counted_replay(number, base):
    replays.append((number, base))
    return _miller_rabin_witness(number, base)
result = screen.validated_strong_probable_prime_screen(
    18446744073709551617, bases, counted_replay, kernel=packed
)
assert normalized(result) == ("witness", 1, 3)
assert replays == [(18446744073709551617, 3)]

# Invalid storage/domain is transactional in dynamic and compiled modes.
for candidate in (dynamic, packed):
    control = screen.kernel_uint64_zeros(candidate, 2)
    packed_bases = screen.kernel_uint64_buffer(candidate, bases)
    assert not candidate(control, packed_bases, 42, len(bases))
    assert list(screen.integer_buffer_values(control)) == [
        screen.PRIMALITY_SCREEN_INVALID,
        0,
    ]

# A corrupt out-of-range index never reaches the replay predicate.
def bad_index(control, packed_bases, number, base_count):
    control[0] = screen.PRIMALITY_SCREEN_WITNESS
    control[1] = base_count
    return True
replays = []
assert screen.validated_strong_probable_prime_screen(
    cases[0], bases, counted_replay, kernel=bad_index
) is None
assert replays == []

# A corrupt false witness is replayed once, rejected, and requests fallback.
def false_witness(control, packed_bases, number, base_count):
    control[0] = screen.PRIMALITY_SCREEN_WITNESS
    control[1] = 0
    return True
replays = []
assert screen.validated_strong_probable_prime_screen(
    18446744073709551629, bases, counted_replay, kernel=false_witness
) is None
assert replays == [(18446744073709551629, 2)]

# Survivor is deliberately a no-hint and performs no witness replay.
def survivor(control, packed_bases, number, base_count):
    control[0] = screen.PRIMALITY_SCREEN_SURVIVOR
    control[1] = 0
    return True
replays = []
assert normalized(screen.validated_strong_probable_prime_screen(
    cases[0], bases, counted_replay, kernel=survivor
)) == ("survivor", -1, -1)
assert replays == []

# Uncompiled platforms, including native Windows fallback, select the readable path.
saved_is_compiled = screen.is_compiled
screen.is_compiled = lambda function: False
replays = []
try:
    assert screen.compiled_strong_probable_prime_screen(
        cases[0], bases, counted_replay
    ) is None
finally:
    screen.is_compiled = saved_is_compiled
assert replays == []
`;

test("CPython batched primality source matches readable witnesses", () => {
  const source = String.raw`
import sys
sys.path.insert(0, ${JSON.stringify(join(root, "src", "lib"))})
${differentialSource}
assert execution_mode(packed) == "dynamic"
`;
  const result = spawnSync(pythonExecutable(), ["-c", source], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test("compiled batched screen matches dynamic and replays witnesses", async () => {
  const { createSage } = require("../dist/tools/kernel.js");
  const session = await createSage();
  try {
    const result = await session.evaluate(String.raw`
${differentialSource}
execution_mode(packed)
`);
    assert.equal(result.stderr ?? "", "");
    assert.match(result.repr, /^(?:'native-capable'|'compiled'|'native')$/);
  } finally {
    await session.close();
  }
});
