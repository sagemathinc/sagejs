---
title: "Optimizing mathematics compiler laboratory"
---
# Optimizing mathematics compiler laboratory

These examples make Sage.js's guarded mathematical optimizer visible from
ordinary Sage source. They are intended to be copied into the Sage.js prompt,
a Sage.js Jupyter cell, or a `.sage` file.

For the architectural comparison with Mojo, Cython, Numba, Julia, PyPy,
Graal/Truffle, JAX, and Pythran, see
[The Sage.js optimizer in the compiler landscape](optimizing-compiler-landscape.md).

The optimizer does not replace finite-field semantics globally. It recognizes
a bounded loop region, proves its data flow, checks the live parent,
representation, and operator identities at entry, performs the loop using
unboxed JavaScript numbers, then materializes the public result. If any guard
fails, it executes the original loop.

For exploratory code that fallback is convenient. For code whose running time
matters, make the optimization an explicit compiler contract:

```python
from sagejs.compiler import optimize

@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="adaptive",
    guard_failure="error",
)
def recurrence(count, value, multiplier, increment):
    for step in range(count):
        value = value*multiplier + increment
    return value
```

This is stronger than a performance test. Compilation fails if the named pass
cannot prove every loop, and a runtime guard mismatch raises an error with a
stable reason instead of quietly executing the generic implementation. The
decorator remains ordinary CPython-parseable source and does not change the
function under CPython.

## A word-sized residue recurrence

This is the smallest useful demonstration. The first call warms both the
generated function and V8; the following calls measure ten million field
multiply-add steps each.

```sage
import time

R = Zmod(1009)

from sagejs.compiler import optimize

@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="adaptive",
    guard_failure="error",
)
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

```

On a warm contemporary x86-64 V8, the guarded loop has measured about
5--10 ns per iteration. The exact number is machine-, V8-, and thermal-state
dependent. `sagejs optimize explain` reports a guarded unboxed ring
representation and an adaptive target with V8 and isolated candidates. The
runtime cost policy normally chooses the primitive V8 loop for small scalar
work and may choose a coarse isolated call for a sufficiently large supported
region. The contract prevents this example from silently becoming generic
after a source edit.

## A general multi-state operation graph

The optimizer is not limited to the preceding affine recurrence. This example
has two loop-carried states, several operations, a local temporary, and a
branch. Its result is checked against an independently executed short prefix.

```sage
import time

R = Zmod(1009)
values = tuple(R(i^2 + 3) for i in range(1_000_000))

from sagejs.compiler import optimize

@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="error",
)
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

from sagejs.compiler import optimize

coefficients = tuple(
    K(i) + ((i + 1) % 5)*a + ((i^2 + 2) % 5)*aa
    for i in range(200_000)
)

@optimize(
    require="math.closed-ring-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="error",
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

```

The expected route is `v8-extension-tuple-stream`. Degree, characteristic,
modulus, element shape, and all used methods are guarded before this lowering
is legal.

## Ordered IEEE-754 arithmetic

Floating-point arithmetic is deliberately **not** modeled as a commutative
ring: addition is not associative, NaNs do not equal themselves, signed zero
is observable, and overflow and underflow round at specific source operations.
The numerical pass therefore has a distinct contract. Its first slice accepts
only range loops whose live scalar inputs have exact `float` annotations, then
authenticates the actual Python float values at runtime. It emits one binary64
operation for each source expression-tree node, in source order, with no
reassociation, contraction, or fast-math.

Save this as `strict-float.py`:

```python
import time
from sagejs.compiler import optimize

@optimize(
    require="math.strict-float-region.v1",
    coverage="all-loops",
    target="v8",
    guard_failure="error",
)
def recurrence(n: int, x: float, a: float, b: float) -> float:
    for index in range(n):
        x = x*a + b
    return x

n = 5_000_000
x, a, b = 0.125, 1.0000001192092896, 1e-9

recurrence(100_000, x, a, b)
for sample in range(7):
    started = time.perf_counter()
    answer = recurrence(n, x, a, b)
    elapsed = time.perf_counter() - started
    print(sample, answer, elapsed, 1e9*elapsed/n, "ns/step")
```

Run fresh optimized and generic processes:

```sh
SAGEJS_OPT_LEVEL=O2 sagejs --python strict-float.py
SAGEJS_OPT_LEVEL=O0 sagejs --python strict-float.py
```

In a Sage.js Jupyter notebook, the installed kernel defaults to Sage mode.
Prefix this numerical example with `%%python`; otherwise decimal literals are
Sage `RealLiteral` values and the strict Python-float guard correctly chooses
the generic implementation. After rebuilding Sage.js, restart an already-open
kernel before measuring. Use millions of iterations: spelling `5_000_0`, for
example, means only 50,000 and makes call and timer overhead dominate.

On the initial Node 26 x86-64 host, the guarded Number loop measured about
2.0 ns per multiply-add step, versus about 273 ns through Sage.js's generic
Python numeric dispatch and 27 ns in CPython 3.13. These are workload-specific
warm medians, not general language rankings. The repository benchmark records
the exact inputs and binary64 checksum, and also ratchets the compiler's warm
parse cost so runtime optimization cannot quietly turn into a long compilation
pause:

```sh
pnpm bench:optimizer-strict-float --check
```

On the same x86-64 host, the identical strict recurrence measured 2.00 ns/step
with Numba 0.67 and 2.03 ns/step with Julia 1.12.7; Sage.js/V8 measured about
2.02 ns/step. All three produced identical binary64 bits. This loop is a serial
dependency chain, so LLVM has essentially no additional arithmetic parallelism
to expose. Numba's first compiled call took about 216 ms, while Julia's first
call took about 4 ms after process startup. These measurements do not predict
array, SIMD, or larger-kernel performance.

The annotations are selection hints, not permission to change semantics. If a
caller supplies integers or a relevant numeric intrinsic has changed, the
guard runs the untouched Python loop. Division, powers, float literals inside
the loop, sequences, calls, and reassociation remain generic in this first
slice. A future explicitly named fast-math policy would require a separate
semantic contract; ordinary `O2` does not enable one.

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

## Ask the compiler what it proved

Put contracted code in `a.py` or `a.sage`. Checking does not execute the file:

```sh
sagejs optimize check --function recurrence a.py
sagejs optimize explain --function recurrence a.py
sagejs optimize explain --json --function recurrence a.py
```

Use the JSON form in automated tooling. It is a detached, verified compiler
report containing the contract, region identity, mathematical domain,
representation, target, guards, fallback, competing targets, cost estimates,
and stable rejection reasons. `check` exits unsuccessfully if an import-proven
contract is absent or unsatisfied. This makes it suitable for CI and for an
agent deciding whether a source change preserved a promised fast path.
`explain` is deliberately diagnostic: it still returns a verified report when
a contract is unsatisfied, marks that contract `unsatisfied`, and records such
reasons as `no-optimizer-candidate` without executing the source.

The file suffix selects the language: `.py` means Python mode and `.sage`
means Sage mode. Use `--sage` or `--python` to override that choice. Standard
input is also accepted, with `--stdin-filename` providing its logical name.

For lower-level compiler development, the older compile command exposes the
same deterministic explanation while also writing the generated JavaScript:

```sh
sagejs compile --sage --omit-baselib --explain-optimizations \
  --output a.js a.py
```

The explanation is printed to standard error. For every recognized region it
shows whether it was selected, the stable pass and region identity, source
location, semantic and mathematical operation sets, proven facts, runtime
guards, chosen representation and target, competing targets, cost model, and
the exact fallback. The JavaScript is written to `a.js` so it does not obscure
the explanation.

Without a decorator, a compiler test can still require a pass globally:

```sh
sagejs compile --sage --omit-baselib --explain-optimizations \
  --optimization-require math.closed-ring-region.v1 \
  --output a.js a.py
```

Use `--optimization-level O0` with `optimize explain` or the compile command to
see the same region recognized but rejected with
`optimization-level-too-low`. This is useful for distinguishing “the pass did
not understand my source” from “policy disabled a valid optimization.”

Every Node `SageSession.evaluate(...)` result also carries
`result.optimization` with authority `compiler-verified-static`. The Jupyter
kernel publishes the same report in execute-result metadata at
`metadata.sagejs.optimization`. That static report proves what the compiler
selected. A runtime guard can still reject particular inputs, which is why
performance-sensitive code should normally use `guard_failure="error"`.

The repository's ratcheted benchmark versions also compare generated and
generic execution, validate independent mathematical oracles, check route and
resource invariants, and enforce generous performance ceilings:

```sh
pnpm bench:optimizer-gf-p2 --check
pnpm bench:optimizer-local-temporaries --check
pnpm bench:optimizer-branching-region --check
pnpm bench:optimizer-field-horner --check
pnpm bench:optimizer-integer-constants --check
pnpm bench:optimizer-strict-float --check
```

## What should and should not optimize

The current region deliberately accepts only operations for which it has an
explicit proof and lowering. Calls, mutation through aliases, escaping local
objects, unsupported parents, oversized static programs, and changed operator
methods remain on the original path. That refusal is a correctness feature,
not a missed promise that arbitrary Sage code is already fast.

Some parents currently expose `_lastCompilerOptimizationRoute` for interactive
debugging. It is public mutable state and therefore **not evidence** that a
particular function or evaluation used an optimized path. Use an import-proven
contract plus the compiler-verified report for claims. Use the O0 comparison to
distinguish optimizer effects from ordinary V8 warmup, input construction, or
a fast algorithm elsewhere in Sage.js.
