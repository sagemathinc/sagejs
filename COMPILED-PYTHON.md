# Sage.js Compiled Python: A User's Guide

> **Status: design target and user-facing specification.** This guide describes
> the experience Sage.js is trying to provide. Some examples work today, some
> describe the intended stable interface, and details may change while the
> compiler matures. `sagejs native explain` is the authority on what a particular
> installed version can compile.

Sage.js compiled Python turns selected, typed Python functions into small
ahead-of-time compiled mathematical kernels. The original Python remains the
readable implementation and the correct portable fallback. The compiled kernel
contains the same algorithm, but it runs without calling Python, JavaScript,
Node, or another interpreter after entering the kernel.

The goal is not to compile every Python program. The goal is to make important
mathematical algorithms simultaneously:

- pleasant for humans to read and review;
- straightforward for coding agents to write, test, and improve;
- fast enough to compete with carefully written native code;
- usable without compilation through the same-source Python fallback;
- inspectable from typed source through generated machine-oriented code; and
- structured so that future correctness proofs have explicit assumptions and
  proof obligations.

## Five-minute example

Create `euclid.py`:

```python
from __future__ import annotations

from sagejs.native import native


@native
def gcd(a: Integer, b: Integer) -> Integer:
    while b:
        a, b = b, a % b
    return abs(a)
```

This is ordinary CPython-parseable Python. The decorator is a no-op when no
compiled artifact is available, so `gcd(18, 30)` still returns `6`.

Ask the compiler what it sees:

```sh
sagejs native explain euclid.py --function gcd
```

Compile it:

```sh
sagejs native compile euclid.py
```

Import and call `gcd` normally. Sage.js finds the source-hash-matched artifact
automatically. No second public function such as `gcd_fast` is required.

Before trusting the result, inspect and compare it:

```sh
sagejs native ir euclid.py --function gcd
sagejs native emit-core-c euclid.py --function gcd
sagejs native benchmark euclid.py --function gcd --args '[92250, 922350]'
```

Force the portable implementation when debugging:

```sh
SAGEJS_NATIVE_DISABLE=1 sagejs --python my_program.py
```

Compilation is an optimization and distribution choice, not a condition for
mathematical correctness.

## The fundamental promise

An accepted `@native` function has two implementations of one source body:

```text
                         +--> ordinary Python / JavaScript fallback
typed Python source ----+
                         +--> typed IR --> isolated native core --> host adapter
```

The isolated core is a real compiled program. Its transitive call graph may
call other compiled functions and explicitly declared native libraries, but it
may not pause and ask the Python or JavaScript runtime to perform an operation.

If the compiler cannot lower an operation while preserving the contract, it
rejects the function and explains why. It does not quietly insert a slow host
callback into a hot loop.

This line is intentionally stronger than “usually runs without the
interpreter.” It gives kernels useful standalone, WebAssembly, parallel, and
accelerator potential.

## Types describe mathematics and storage

Annotations are part of the native contract. They are not merely hints, and
they do not all mean “use the corresponding C primitive.”

| Type | Intended meaning inside a kernel |
|---|---|
| `Integer` | An arbitrary-precision exact integer, represented cheaply as a machine word when possible and promoted without loss when necessary. |
| `uint64` | A checked nonnegative 64-bit count, size, index, or modulus. |
| `float` | IEEE binary64 arithmetic with explicit floating-point semantics. |
| `RealField`, `RealNumber` | A parent and element using MPFR precision. |
| `ComplexField`, `ComplexNumber` | A parent and element using MPC/MPFR precision. |
| `Float64Buffer` | Borrowed packed binary64 storage. |
| `Int64Buffer` | Borrowed packed signed-64-bit exact storage; an unrepresentable write raises rather than truncates. |
| `IntegerBuffer` | Packed arbitrary-precision exact integer storage with explicit capacity. |
| `UInt64Buffer` | Borrowed packed unsigned-64-bit storage, commonly used at library boundaries. |

The type vocabulary should grow in response to real mathematical code. A new
type must specify:

- Python fallback behavior;
- native representation and arithmetic semantics;
- ownership, aliasing, and mutation rules;
- error behavior and boundary validation;
- supported targets; and
- how to test the compiled and fallback forms against each other.

### Exact integers do not silently wrap

This function returns an exact Python/Sage integer even when the loop crosses a
machine-word boundary:

```python
@native
def quadratic_sum(n: uint64) -> Integer:
    total = 0
    for k in range(n):
        total += k * k
    return total
```

The compiler may begin with checked machine arithmetic and promote the live
value to GMP at the operation that overflows. That representation change is an
optimization. It does not change the mathematical value and does not replay
visible effects.

This policy is crucial for pure mathematics: “fast integer” means exact by
default, not a machine integer that happens to be fast until it wraps.

### Put loops over packed data inside the kernel

Crossing a host boundary for every scalar operation defeats compilation.
Prefer a packed buffer and one coarse-grained call:

```python
from math import sqrt

from sagejs.native import Float64Buffer, float64_record, native, uint64


@native
def kinetic_energy(state: Float64Buffer, bodies: uint64) -> float:
    energy = 0.0
    for index in range(bodies):
        body = float64_record(state, index * 7, 7)
        energy += body[6] * (
            body[3] * body[3]
            + body[4] * body[4]
            + body[5] * body[5]
        ) / 2.0
    return energy
```

A record is a bounded view, not a pointer exposed to Python. The compiler may
prove repeated bounds checks unnecessary, but the fallback and native entry
still share one checked shape contract.

Ordinary lists are useful for the fallback and small calls. Long-running code
should generally pack data once, reuse storage across calls, and avoid
repeated object conversion.

## Compiled functions call each other directly

There is no `cdef`/`cpdef` split. A typed dependency is ordinary Python too:

```python
@native
def gcd(a: Integer, b: Integer) -> Integer:
    while b:
        a, b = b, a % b
    return abs(a)


@native
def sum_gcds(count: uint64) -> Integer:
    total = 0
    for k in range(count):
        total += gcd(92250, 922350 + k)
    return total
```

The compiler builds the dependency graph and emits a direct private native
call. It does not return through a Python wrapper between `sum_gcds` and
`gcd`. Recursion follows the same rule when its types and effects are accepted.

## Calling FLINT, PARI, igraph, msolve, and other libraries

Mature mathematical libraries remain essential. A compiled function may call
a library function only through a checked Sage.js FFI declaration:

```python
from sagejs.ffi.flint import nmod_poly_mul
from sagejs.native import UInt64Buffer, native, uint64


@native
def multiply_mod_p(
    output: UInt64Buffer,
    left: UInt64Buffer,
    right: UInt64Buffer,
    output_length: uint64,
    left_length: uint64,
    right_length: uint64,
    modulus: uint64,
) -> bool:
    return nmod_poly_mul(
        output,
        left,
        right,
        output_length,
        left_length,
        right_length,
        modulus,
    )
```

In ordinary execution, the generated wrapper validates values and calls the
dynamic library adapter. In native execution, the compiler consumes the same
declaration and emits a direct call inside the isolated core. Mathematical
source never names a raw pointer, performs `memset`, or remembers a destructor.

### Intended declaration-author experience

Today, the normalized FFI specification is explicit JSON because strict,
machine-readable declarations made it possible to establish the architecture
quickly. JSON is useful for validation, reproducible builds, audits, and coding
agents. It should not be the only pleasant authoring interface.

The intended direction is a small CPython-parseable declaration language. A
future declaration might look approximately like this:

```python
from sagejs.ffi.declare import (
    Library, UInt64, buffer, effects, out, shape, status,
)

flint = Library(
    "flint",
    headers=["flint/nmod_poly.h", "sagejs/ffi_algorithms.h"],
    package="@sagemath/sagejs-flint",
)


@flint.function(
    symbol="sagejs_flint_nmod_poly_mul_packed",
    effects=effects(allocates=True, writes="output", deterministic=True),
)
def nmod_poly_mul(
    output: out[buffer[UInt64], shape("output_length")],
    left: buffer[UInt64, shape("left_length")],
    right: buffer[UInt64, shape("right_length")],
    output_length: UInt64,
    left_length: UInt64,
    right_length: UInt64,
    modulus: UInt64,
) -> status[ValueError, "invalid polynomial multiplication"]:
    ...
```

This syntax is illustrative, not yet a compatibility promise. Its important
properties are:

1. a human can understand the call, shapes, effects, and errors in one place;
2. an agent can do the tedious one-time work of matching headers, platforms,
   ownership, and upstream tests;
3. it normalizes deterministically into the checked JSON call plan;
4. generated dynamic and native adapters consume that one plan; and
5. neither the declaration nor the compiler contains a second implementation
   of the mathematical algorithm.

The normalized JSON should remain inspectable build IR. Humans should normally
write or review the declaration source and `sagejs ffi explain` output. Agents
may inspect every layer and are especially well suited to generating exhaustive
bindings and adversarial lifecycle tests.

## Memory and ownership

Compiled mathematical Python does not expose general pointer arithmetic.

- Scalar arguments are values or checked exact numbers.
- Buffers are borrowed for the duration of a call and cannot be retained.
- Record and slice views are bounded and do not own their storage.
- Mutable foreign outputs are staged and committed only after success when the
  declaration requires transactional behavior.
- Owned foreign resources have generated initialization and all-exit cleanup.
- Unsupported escaping or cyclic ownership fails declaration validation or
  compilation.

This does not make foreign C libraries incapable of having bugs. It moves the
unsafe surface into small, explicit, sanitizer-tested adapters instead of
spreading pointers and cleanup conventions throughout the mathematical code.
The aim is useful safety and reviewability, not a new general-purpose borrow
checker.

## Errors and observable effects

Python-visible behavior remains part of the contract.

- Division by zero, invalid dimensions, failed foreign status results, and
  unrepresentable bounded writes become specified Python exceptions.
- The core reports a typed status to its host adapter; it does not construct a
  Python exception by calling the interpreter from inside the kernel.
- Exact-integer promotion is not an error.
- Mutating an output is an explicit effect recorded in compiler analysis.
- Optimizations may not replay or reorder visible effects without proof.

I/O is deliberately not an accidental escape hatch. A plain `print` inside a
kernel should either fail compilation or lower to a documented native I/O
effect with standalone semantics. It must never silently become a JavaScript
callback. Compute kernels are usually clearer when they return diagnostic data
and print outside the compiled boundary.

## What happens when code cannot compile?

Compilation is strict and explainable. For example, an arbitrary Python object
lookup, generator, monkey-patched method, dynamically imported function, or
call into uncompiled Python may be meaningful in the fallback but have no
host-isolated lowering.

Use:

```sh
sagejs native audit package_or_module
sagejs native explain module.py --function function_name
```

A useful rejection should identify:

- the source span and operation;
- the inferred type, storage, ownership, and effects;
- the missing compiler capability or ambiguous contract;
- whether a smaller kernel boundary would work; and
- the relevant supported replacement, such as packed storage or a declared
  FFI call.

Do not “fix” rejection by hiding a Python call behind a compiler intrinsic
selected from the function's name. Either teach the compiler the general
source construct, declare the foreign operation, or keep that region dynamic.

## Inspecting and debugging a kernel

The compiler is intended to be transparent enough that both a human and an
agent can answer “why did this compile, and what will it do?”

```sh
sagejs native explain module.py
sagejs native ir module.py
sagejs native emit-c module.py
sagejs native emit-core-c module.py
sagejs native emit-header module.py
sagejs native compile module.py
sagejs native benchmark module.py --function f --args '[1000]'
```

These interfaces should expose:

- the selected function and transitive dependency graph;
- source-derived types, shapes, effects, and representation choices;
- bounds and overflow proofs or runtime guards;
- imported FFI declaration identities;
- every generated operation's original Python source span;
- host-isolation certification;
- cache identity and toolchain; and
- reasons rejected functions remain dynamic.

Generated C is an important audit and compiler-debugging artifact, but it is
not the maintained mathematical source.

## Correctness workflow

Fast code is useful only when its mathematical contract is convincing. Every
production kernel should normally have four layers of evidence:

1. **Portable execution.** The source runs as ordinary Python/Sage.js and has
   focused tests.
2. **Differential execution.** Fallback and every native backend agree over a
   corpus containing boundary values, aliasing, failures, and large values.
3. **Independent oracle.** CPython, SageMath, FLINT, PARI, Magma, or another
   mature implementation checks representative mathematical results.
4. **Structural checks.** Compiler analysis certifies isolation, ownership,
   shapes, effects, source provenance, and generated cleanup.

Property-based testing and sanitizer-backed lifecycle fuzzing are especially
valuable at representation and FFI boundaries.

### Direction for formal verification

Typed mathematical Python is not automatically proven correct. It does,
however, provide a promising proof boundary. The maintained algorithm exposes
loops, branches, and mathematical operations without manual allocation and
pointer bookkeeping mixed through every line.

Over time, a compiler certificate could state obligations such as:

- all indexed accesses satisfy declared shape constraints;
- machine-word operations either fit or promote exactly;
- mutable aliases obey the declared policy;
- owned values are initialized and cleared exactly once;
- the core has no undeclared host effects;
- foreign calls satisfy their declared preconditions; and
- each IR and target operation retains source provenance.

Any proof is conditional on clearly named trusted components: the parser and
lowering rules, arithmetic libraries, foreign declarations, C or Wasm
toolchain, and hardware semantics. Making those assumptions explicit is much
more useful than merely describing generated native code as “fast.”

## A workflow for humans and coding agents

The recommended implementation loop is:

1. Write the clearest correct ordinary Python algorithm.
2. Test it against mathematical examples and an independent oracle.
3. Profile and select a coarse-grained hot function or closed call graph.
4. Add mathematical and storage types without rewriting the algorithm in C.
5. Run `native explain`; reduce dynamic objects and boundary crossings.
6. Improve a general compiler capability when real source exposes a gap.
7. Use the declared FFI for mature external algorithms rather than recreating
   them solely to avoid a binding.
8. Inspect IR, core C, effects, source maps, and artifact size.
9. Differentially test fallback and native forms, including failure paths.
10. Benchmark the complete public operation on an otherwise idle machine.

Humans should be able to spend most review time on the Python algorithm,
public contract, and benchmark methodology. Agents can cheaply perform work
that was historically neglected because it was tedious: enumerate ABI details,
generate test corpora, compare headers across platforms, inspect every cleanup
path, minimize compiler failures, and rerun differential suites after each
change.

Agent-written does not mean opaque. A change is better when it leaves a future
human or agent with fewer representations to reconcile and a smaller trusted
surface.

## Benchmarking honestly

Report at least:

- the exact source and arguments;
- native, same-source fallback, and relevant established implementations;
- cold compilation separately from warm execution;
- warmup, sample count, and reported statistic;
- correctness checks and output equivalence;
- CPU, operating system, compiler, and library versions;
- allocation and packing included or excluded; and
- generated source, object, and distributable sizes.

A 50-microsecond kernel that excludes 500 milliseconds of setup is not an
end-to-end 10,000-fold speedup. Microbenchmarks diagnose compiler behavior;
public-operation benchmarks guide architecture.

## Compilation, caching, and distribution

`sagejs native compile` produces content-addressed artifacts. The identity
includes source, typed IR, compiler and ABI versions, foreign declarations,
toolchain, target, and relevant tuning policy. Artifacts are disposable and
can be regenerated.

The intended distribution model has three levels:

1. Sage.js ships trusted, precompiled kernels for supported platforms.
2. Users with a compiler can build their own kernels and cache them locally.
3. Users without a compiler always retain the correct dynamic implementation.

A compiler-enabled Sage.js distribution may bundle a portable toolchain, but
the ordinary runtime need not carry that size. Release builds should share
runtime support, eliminate unreachable code, and garbage-collect unused cache
entries instead of embedding a private copy of every helper in every kernel.

### Standalone C, WebAssembly, and accelerators

The canonical product of compilation is a host-independent core and a versioned
ABI, not a Node addon. Node is one adapter.

- A standalone C program can link the core and use its status-returning API.
- A WebAssembly build can compile the same core when its arithmetic libraries
  and ABI types are available for the target.
- A future GPU or other accelerator backend can consume suitable typed IR and
  packed storage without introducing Python callbacks.

Not every kernel suits every target. Target availability and required foreign
libraries are explicit capabilities, not silent fallbacks to different
arithmetic.

## How this differs from Cython

Cython demonstrated that Python-shaped native programming can transform a
mathematical ecosystem. Sage.js compiled Python deliberately makes a different
tradeoff.

| Question | Typical Cython model | Sage.js compiled-Python target |
|---|---|---|
| What is maintained? | Python-like code that may freely mix Python/C API and C-level operations. | Ordinary Python containing the actual mathematical algorithm. |
| Can compiled code call the interpreter? | Yes; mixed Python and native regions are fundamental. | Not after entering an accepted isolated kernel. |
| What happens to an unsupported operation? | It may remain a Python operation. | Compilation fails unless the operation has a native or declared-FFI lowering. |
| What does `Integer` mean? | Usually a Python object unless manually mapped to a native library. | Exact arithmetic with compiler-managed machine-word/GMP representation. |
| Does the source run without compilation? | Pure-Python mode can; many Cython-specific programs cannot. | The same body is required to retain a correct fallback. |
| How are internal native calls expressed? | `cdef`/`cpdef` and Cython declarations. | Ordinary typed functions in a compiler-built dependency graph. |
| What is the native artifact? | Usually a CPython extension module. | A host-independent isolated core plus thin adapters. |

This stricter subset gives up transparent compilation of arbitrary Python in
exchange for a clearer performance model, portable kernel boundary, and a
smaller semantic gap between the code people read and the code that runs.

## Frequently asked questions

### Should I decorate an entire package?

Usually not. Begin with a hot, coarse-grained algorithm and its typed helper
graph. Keep orchestration, rich objects, display, caching policy, and uncommon
branches in ordinary Python until measurements justify moving a boundary.

### What if compilation is slower than the fallback?

Keep the fallback, record the benchmark, and inspect packing, call size,
algorithm choice, bounds checks, and backend selection. `@native` is not a
promise that every accepted function wins at every input size.

### Can a compiled kernel segfault?

Generated code and foreign libraries are still native software, so yes, bugs
are possible. The architecture reduces risk with checked ABIs, no public raw
pointers, generated ownership, transactional outputs, sanitizers, and small
audited adapters. It does not claim memory safety by magic.

### Can I use a C or C++ library function?

Yes, after adding it to a checked library declaration with dynamic and native
adapters, ownership/effect/error information, target capabilities, and
differential tests. Arbitrary `dlopen` or pointer calls are not admitted inside
mathematical kernels.

### Is generated code useful outside Sage.js?

Potentially. The isolated core and header are designed to be standalone. A
consumer must still honor the ABI, ownership, status, and foreign-library
requirements recorded in the artifact.

### Does this replace FLINT, PARI, or specialized C?

No. It should make readable typed Python an excellent place to implement and
optimize mathematical algorithms, while making mature external libraries easy
and safe to call. Handwritten native primitives remain appropriate when they
measurably express something the compiler cannot yet represent cleanly.

### Does it replace ordinary Sage.js Python?

No. Ordinary Python is the semantic foundation, fallback, orchestration layer,
and best implementation for much code. Compiled kernels are a disciplined way
to move selected closed computations near native speed.

## The standard to hold

A successful Sage.js compiled kernel should leave one obvious answer to each
question:

- Where is the mathematical algorithm? In the Python body.
- What executes dynamically? The same body and public API.
- What executes natively? The inspectable lowering of that body.
- Can it call the host midway through? No.
- How are foreign calls admitted? Through checked declarations.
- Who owns each value? The type, call plan, and generated cleanup say so.
- What happens on overflow or failure? The declared mathematical semantics.
- How was speed established? A reproducible, correctness-checked benchmark.
- What must be trusted? An explicit and progressively reducible list.

That is the architecture: readable mathematical Python at the center, agents
doing the exhaustive engineering around it, and native speed without turning
the library into an invisible second codebase.

## Further reading

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — normative implementation policy.
- [`FFI.md`](FFI.md) — current foreign-library declaration system.
- [`bench/NATIVE-COMPILER.md`](bench/NATIVE-COMPILER.md) — detailed compiler
  status, supported constructs, and benchmark history.
- [`architecture/decisions/0001-three-layer-mathematics.md`](architecture/decisions/0001-three-layer-mathematics.md)
  — rationale for the mathematical implementation layers.
