---
title: "Optimizing mathematics compiler laboratory"
---

# Optimizing mathematics compiler laboratory

These examples make Sage.js's guarded mathematical optimizer visible from
ordinary Sage source. They are intended to be copied into the Sage.js prompt,
a Sage.js Jupyter cell, or a `.sage` file.

The optimizer does not replace finite-field semantics globally. It recognizes
a bounded loop region, proves its data flow, checks the live parent,
representation, and operator identities at entry, performs the loop using
unboxed JavaScript numbers, then materializes the public result. If any guard
fails, it executes the original loop.

## A word-sized residue recurrence

This is the smallest useful demonstration. The first call warms both the
generated function and V8; the following calls measure ten million field
multiply-add steps each.

```sage
import time

R = Zmod(1009)

def recurrence(count, value, multiplier, increment):
    for step in range(count):
        value = value*multiplier + increment
    return value

n = 10_000_000
value, multiplier, increment = R(1), R(37), R(11)

# Untimed warmup: do not mix JIT compilation with steady-state execution.
recurrence(n, value, multiplier, increment)

for sample in range(7):
    started = time.time()
    answer = recurrence(n, value, multiplier, increment)
    elapsed = time.time() - started
    print(sample, answer, elapsed, 1e9*elapsed/n, "ns/field step")

print("route:", R._lastCompilerOptimizationRoute)
```

On a warm contemporary x86-64 V8, the guarded loop has measured about
5--10 ns per iteration. The exact number is machine-, V8-, and thermal-state
dependent. The route should be `v8-number-residue`; `generic` means the entry
proof did not select the optimized representation.

## A general multi-state operation graph

The optimizer is not limited to the preceding affine recurrence. This example
has two loop-carried states, several operations, a local temporary, and a
branch. Its result is checked against an independently executed short prefix.

```sage
import time

R = Zmod(1009)
values = tuple(R(i^2 + 3) for i in range(1_000_000))

def checksum(values, left, right, pivot):
    for value in values:
        square = value*value
        if value == pivot:
            left = left + right
            right = right - value
        else:
            left = left*right + square
            right = right + left
    return left, right

checksum(values, R(5), R(7), R(17))
for sample in range(5):
    started = time.time()
    answer = checksum(values, R(5), R(7), R(17))
    elapsed = time.time() - started
    print(sample, answer, elapsed, 1e9*elapsed/len(values), "ns/item")

print("route:", R._lastCompilerOptimizationRoute)
```

The expected route is `v8-number-residue-stream`. Sequence elements are
validated transactionally as they are consumed; an invalid later element
restarts the untouched source loop rather than exposing a partial update.

## Horner evaluation in a cubic extension field

For small extension fields, one field element becomes a fixed tuple of Number
coordinates during the loop. This is substantially more work per iteration
than a prime-field residue, but it still avoids public element allocation and
foreign-function crossings in the inner loop.

```sage
import time

P.<x> = PolynomialRing(GF(5))
K.<a> = GF(5^3, modulus=x^3 + x + 1)
aa = a*a

coefficients = tuple(
    K(i) + ((i + 1) % 5)*a + ((i^2 + 2) % 5)*aa
    for i in range(200_000)
)

def horner(coefficients, point, value):
    for coefficient in coefficients:
        value = value*point + coefficient
    return value

point = K(2) + 3*a + 4*aa
initial = K(1) + a + aa

horner(coefficients, point, initial)
for sample in range(5):
    started = time.time()
    answer = horner(coefficients, point, initial)
    elapsed = time.time() - started
    print(sample, answer, elapsed, 1e9*elapsed/len(coefficients), "ns/item")

print("route:", K._lastCompilerOptimizationRoute)
```

The expected route is `v8-extension-tuple-stream`. Degree, characteristic,
modulus, element shape, and all used methods are guarded before this lowering
is legal.

## Compare with the exact generic implementation

Optimization level is fixed when a Sage.js runtime is created. Put one of the
examples in `optimizer-lab.sage`, then run it in fresh processes:

```sh
SAGEJS_OPT_LEVEL=O2 sagejs optimizer-lab.sage
SAGEJS_OPT_LEVEL=O0 sagejs optimizer-lab.sage
```

For a very slow generic loop, reduce `n` or the coefficient count in the O0
run and scale the elapsed time linearly. Do not infer a ratio from one cold
sample: warm each path, take several observations, compare exact answers, and
report the median.

The repository's ratcheted benchmark versions also compare generated and
generic execution, validate independent mathematical oracles, check route and
resource invariants, and enforce generous performance ceilings:

```sh
pnpm bench:optimizer-gf-p2 --check
pnpm bench:optimizer-local-temporaries --check
pnpm bench:optimizer-branching-region --check
pnpm bench:optimizer-field-horner --check
```

## What should and should not optimize

The current region deliberately accepts only operations for which it has an
explicit proof and lowering. Calls, mutation through aliases, escaping local
objects, unsupported parents, oversized static programs, and changed operator
methods remain on the original path. That refusal is a correctness feature,
not a missed promise that arbitrary Sage code is already fast.

Inspect `parent._lastCompilerOptimizationRoute` after a call when experimenting.
Use the O0 comparison to distinguish optimizer effects from ordinary V8
warmup, input construction, or a fast algorithm elsewhere in Sage.js.

