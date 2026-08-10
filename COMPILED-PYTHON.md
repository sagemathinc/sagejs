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


@native
def sum_gcds(n: Integer) -> Integer:
    return sum(gcd(i, i + 2) for i in range(n))
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

Select an execution tier explicitly when debugging or benchmarking:

```sh
SAGEJS_NATIVE_MODE=dynamic sagejs --python my_program.py
SAGEJS_NATIVE_MODE=javascript sagejs --python my_program.py
SAGEJS_NATIVE_MODE=native sagejs --python my_program.py
```

`dynamic` uses the original function, `javascript` uses the compiler-generated
portable typed-IR kernel, and `native` requires the machine-code artifact.
The default `auto` mode resolves an artifact when present and applies its
backend policy. The older `SAGEJS_NATIVE_AUTOLOAD`, `SAGEJS_NATIVE_DISABLE`,
and `SAGEJS_NATIVE_REQUIRED` controls remain available in `auto` mode.

When implementation identity matters, make it observable instead of inferring
it from speed. `SAGEJS_NATIVE_WARN_FALLBACK=1` warns once per source file when
marked functions resolve to their dynamic bodies. `SAGEJS_NATIVE_REQUIRED=1`
fails while importing a marked function if its source-hash-matched artifact is
missing. `SAGEJS_NATIVE_TRACE=1` reports higher-level production dispatches
that can choose among several implementations.

For example, `SAGEJS_NATIVE_TRACE=1 sagejs` reports
`typed-python-isolated` for source-transparent dense-prime operations and
`declared-flint-isolated` when a packed matrix enters a declared FLINT call.
Dense matrices over small prime fields canonically own a row-major
`BigUint64Array`; they never materialize a persistent N-API matrix object.
With `SAGEJS_NATIVE_REQUIRED=1`, a missing compiled artifact fails at import
instead of silently changing the performance tier. The retained legacy N-API
matrix is a differential oracle, not a parallel production representation.

Dense `ZZ` matrices use the analogous exact representation: signed limb counts
plus caller-owned row-major 64-bit limbs. Structural operations execute the
typed bodies in `sagejs.kernels.matrix.dense_integer`; machine-sized entries stay in
checked signed words and promote per value to GMP when required. Mature
algorithms such as determinant, HNF, SNF, and characteristic polynomial enter
FLINT only through declared packed FFI. The Python `Matrix` object never owns a
FLINT/N-API integer-matrix handle. Set `SAGEJS_FORBID_ZZ_MATRIX_NAPI=1` in an
architecture test to make any regression to that legacy surface fail
immediately, and use `pnpm test:matrix:integer-performance` for the warm public
performance table.

Code can inspect this distinction without guessing from a timing:

```python
from sagejs.native import execution_mode

execution_mode(sum_gcds)          # dynamic, javascript, or native-capable
execution_mode(sum_gcds, 10**6)   # javascript or native for these arguments
```

Compilation is an optimization and distribution choice, not a condition for
mathematical correctness.

If your mental model is handwritten C/N-API, Cython, Numba, Julia, or Mojo, see
[How this differs from handwritten C and N-API](#how-this-differs-from-handwritten-c-and-n-api),
[How this differs from Cython](#how-this-differs-from-cython), [How this differs
from Numba](#how-this-differs-from-numba), [How this differs from
Julia](#how-this-differs-from-julia), and [How this differs from
Mojo](#how-this-differs-from-mojo). Similar-looking syntax and machine-code
results can hide importantly different maintenance and execution contracts.

## The fundamental promise

An accepted `@native` function has three execution tiers for one source body:

```text
                         +--> ordinary dynamic Python / Sage.js
typed Python source --> typed IR --> portable typed JavaScript kernel
                              +--> isolated native core --> host adapter
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
| `RationalBuffer` | Owned normalized exact-rational storage: parallel tagged `IntegerBuffer` numerators and positive denominators. |
| `UInt64Buffer` | Borrowed packed unsigned-64-bit storage, commonly used at library boundaries. |
| `NativeRecord` subclass | A fixed-layout value record containing checked scalars and borrowed buffers; the compiler owns its ABI layout. |

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

You do **not** need to annotate `total`. The compiler infers `Integer` from
`0`, the exact arithmetic that follows, and the return contract. You may make
the local contract explicit when it improves the explanation of the
algorithm:

```python
@native
def quadratic_sum(n: uint64) -> Integer:
    total: Integer = 0
    for k in range(n):
        total += k * k
    return total
```

`int` and `Integer` both mean exact `Integer` in a native annotation. An
explicit local annotation is checked rather than used as a cast; declaring the
integer initializer `0` as a `bool`, for example, is a compile-time type error.
Annotation-only native locals such as
`total: Integer` are rejected until definite-assignment analysis can prove
their initialization; initialize the local where it is declared.

The compiler may begin with checked machine arithmetic and promote the live
value to GMP at the operation that overflows. That representation change is an
optimization. It does not change the mathematical value and does not replay
visible effects.

This policy is crucial for pure mathematics: “fast integer” means exact by
default, not a machine integer that happens to be fast until it wraps.

### Public annotations define one checked ABI

Every parameter and result of a compiled function must have a supported native
annotation. Sage.js does not infer a public ABI from whichever values happen to
arrive first:

```python
@native
def sum_gcds(count) -> Integer:       # rejected: count has no native type
    return sum(gcd(92250, 922350 + k) for k in range(count))
```

Nor are annotations requests for a conversion of the result:

```python
@native
def sum_gcds(count: uint64) -> str:   # rejected: unsupported ABI result
    return sum(gcd(92250, 922350 + k) for k in range(count))
```

If strings become a supported result type, this body will still fail because
the inferred result is `Integer`, not `str`. This is deliberately stricter
than ordinary Python, which records annotations but does not enforce them.

At a compiled `uint64` entry, an exact integer from `0` through `2**64 - 1` is
accepted. A float—including an integral-valued `1.0`—or string raises
`TypeError`; a negative or too-large exact integer raises `OverflowError`.
Validation happens once in the thin public
adapter before the isolated core starts. The portable dynamic fallback remains
ordinary Python and can therefore fail differently when given values outside
the declared contract. Programs should regard such calls as invalid in every
mode.

There is no annotation-based overloading or multiple dispatch. One `@native`
function name has one ABI signature. When a public operation accepts genuinely
different domains, keep the dispatcher ordinary Python and call separately
named kernels after validation and conversion:

```python
def parse_and_sum(value):
    if isinstance(value, str):
        return sum_gcds_from_decimal(value)
    if isinstance(value, int):
        return sum_gcds_uint64(value)
    raise TypeError("expected int or str")
```

This keeps dispatch policy, error messages, and conversions visible instead of
building an implicit runtime method table into the kernel ABI.

### Put loops over packed data inside the kernel

Crossing a host boundary for every scalar operation defeats compilation.
Prefer a packed buffer and one coarse-grained call:

```python
from math import sqrt

from sagejs.native import (
    Float64Buffer,
    float64_record,
    kernel_float64_buffer,
    native,
    uint64,
)


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


state = kernel_float64_buffer(
    kinetic_energy,
    [0, 0, 0, 3, 4, 0, 2],
)
assert kinetic_energy(state, 1) == 25.0
```

`Float64Buffer` is an annotation describing storage; it is not a constructor.
`kernel_float64_buffer(kernel, iterable)` returns an ordinary list for the
dynamic fallback and packed storage when `kernel` resolves to a compiled
artifact. `kernel_float64_zeros(kernel, length)` similarly allocates reusable
caller-owned output. Passing a list directly is also correct, but a compiled
call must pack it temporarily, so repeated calls should normally pack once and
reuse the result.

A record is a bounded view, not a pointer exposed to Python. Constructing
`float64_record(state, start, length)` raises `IndexError` if the requested
span is outside `state`; accessing `body[100]` raises `IndexError` when the
record has fewer than 101 entries. Generated C checks both conditions and
reports a status through the adapter—it does not perform an unchecked pointer
read. The compiler may eliminate a check only after proving it from shapes and
loop bounds.

Ordinary lists are useful for the fallback and small calls. Long-running code
should generally pack data once, reuse storage across calls, and avoid
repeated object conversion.

Exact rational aggregates use the same principle. A `RationalBuffer` owns two
equal-length `IntegerBuffer` components, with coprime numerator/denominator
pairs, positive denominators, and the unique zero representation `0/1`.
Current structural kernels take the two component buffers as explicit
arguments because composite rational records are not yet admitted in public
kernel signatures. The surrounding mathematical object owns them as one
aggregate, so growth and mutation cannot replace only one component. This is
an exposed ABI staging choice, not a foreign `fmpq` pointer or a pair of
unrelated caches.

### Group related values with compiler-owned records

Small mathematical data structures should not force every helper to accept a
long, error-prone list of parallel arguments. Define their schema using an
ordinary CPython-parseable class:

```python
from sagejs.native import (
    NativeRecord,
    PrimeFieldModulus,
    UInt64Buffer,
    native,
    uint64,
)


class DensePrimeMatrix(NativeRecord):
    entries: UInt64Buffer
    rows: uint64
    columns: uint64
    modulus: PrimeFieldModulus


@native
def trace(matrix: DensePrimeMatrix) -> uint64:
    if matrix.rows != matrix.columns:
        raise ValueError("trace requires a square matrix")
    total = 0
    for index in range(matrix.rows):
        total += matrix.entries[index * matrix.columns + index]
    return total % matrix.modulus
```

In fallback execution, `DensePrimeMatrix(entries, rows, columns, modulus)` is
a normal Python object with those attributes. In native execution it is a
compiler-generated C value struct. Passing it to another compiled function is
a direct by-value core call: no dictionary lookup, host callback, allocation,
or object-at-a-time N-API work occurs inside the kernel.

This is intentionally not a public spelling for a C pointer. In the initial
record model:

- fields currently use `uint64`, `PrimeFieldModulus`, or `UInt64Buffer`;
  additional scalar and packed-storage fields should extend the same general
  record mechanism rather than introduce domain-specific struct intrinsics;
- the schema contains checked scalar values and borrowed typed buffers;
- fields have a fixed order and type, and have no defaults;
- records may be constructed and read inside a kernel;
- a borrowed buffer field's contents may be mutated, with the same checked
  copy-back contract as a direct buffer argument, but fields cannot be rebound;
- the record value and every borrowed field are valid only for the synchronous
  call and may not be returned or retained; and
- unknown fields, unsupported field types, methods, defaults, and escaping
  records fail compilation.

The host adapter accepts the fallback class instance or any object exposing
the declared fields, validates each field once, and roots the underlying
packed buffers until the call returns. The isolated core sees only the fixed C
struct. This solves the useful part of the C “pointer to a dimensions-and-data
struct” idiom without making pointer arithmetic, destructors, or borrowed
lifetime bookkeeping part of mathematical source.

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
    return sum(gcd(92250, 922350 + k) for k in range(count))
```

The compiler builds the dependency graph and emits a direct private native
call. It does not return through a Python wrapper between `sum_gcds` and
`gcd`. Recursion follows the same rule when its types and effects are accepted.

### Natural reductions stay inside the kernel

Exact `sum` over a one-clause `range` generator or list comprehension lowers
to a counted accumulator loop; it does not construct a Python generator, list,
or call back to the host's `sum`. The optional positional or keyword `start`
and a comprehension filter are supported:

```python
@native
def odd_square_sum(n: Integer, start: Integer = 0) -> Integer:
    return sum(
        (k * k for k in range(1, n) if k % 2),
        start=start,
    )
```

Comprehension indices have Python 3 scope and do not overwrite a surrounding
local with the same spelling. `native explain` reports the resulting range
loop and direct dependency graph. Nested clauses and reductions whose empty
case requires a new exception contract remain explicit compile-time
rejections rather than hidden dynamic execution.

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

### Declaration-author experience

The authoring format is a small CPython-parseable declaration language. Sage.js
parses it statically—it never executes imports, decorators, or arbitrary code
during a build. A declaration looks like this:

```python
from sagejs.ffi.declare import Direct, Effects, Library, in_, out

flint = Library(
    id="flint",
    python_module="sagejs.ffi.flint",
    package="@sagemath/sagejs-flint",
    headers=["flint/fmpz.h"],
    link_unix=["libflint.a"],
    link_windows=["flint.lib"],
    dependencies=["GMP"],
    prefix_environment="SAGEJS_FLINT_PREFIX",
    unix_default="packages/flint/.native/prefix",
    windows_default="packages/flint/.native/prefix",
)


@flint.function(
    dynamic="gcd",
    symbol="fmpz_gcd",
    returns=void,
    abi=[
        out("result", fmpz_t),
        in_("left", fmpz_t),
        in_("right", fmpz_t),
    ],
    effects=Effects(pure=True, allocates=True),
    result=Direct(),
    wasm=True,
)
def fmpz_gcd(left: Integer, right: Integer) -> Integer:
    ...
```

The complete production declarations are in `ffi/flint.ffi.py` and
`ffi/igraph.ffi.py`. Their important properties are:

1. a human can understand the call, shapes, effects, and errors in one place;
2. an agent can do the tedious one-time work of matching headers, platforms,
   ownership, and upstream tests;
3. `sagejs ffi emit-json` normalizes it deterministically into the checked JSON
   call plan;
4. generated dynamic and native adapters consume that one plan; and
5. neither the declaration nor the compiler contains a second implementation
   of the mathematical algorithm.

The normalized JSON remains inspectable build IR. Humans should normally write
or review the declaration source and `sagejs ffi explain` output. Agents may
inspect every layer and are especially well suited to generating exhaustive
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

**A valid function admitted to the safe `@native` subset must not segfault,
use freed memory, double-free, or leak. If it does, that is a bug in the Sage.js
compiler, generated runtime/ABI support, toolchain, or declared external C/C++
library—not an accepted consequence of the user's typed Python.** An explicit
architecture exception containing handwritten native code is itself part of
that trusted unsafe implementation and must be classified and audited.

From the kernel author's perspective, this is closer to Go's safe-default
programming model than to writing Rust, Zig, C, or low-level Cython. Authors do
not manipulate pointers, write destructors, prove lifetimes with source-level
borrow syntax, or manually pair allocations and frees. Unlike Go, an isolated
kernel does not rely on a garbage collector while it runs: bounded borrowed
spans, lexical values, compiler-generated cleanup, and declared FFI ownership
make the closed native lifetime explicit. Sage.js therefore owes users the
same practical outcome—a memory-safe accepted program—without asking every
mathematical author to become a memory-management programmer.

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

In particular, distinguish a packed-kernel benchmark from a public matrix
benchmark. If the public object is stored by a foreign library, exporting its
entries, validating buffers, and reconstructing the result are part of the
operation. Use `SAGEJS_NATIVE_TRACE=1` to record which production matrix
implementation ran alongside the timing.

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

## Why build on JavaScript and V8?

Sage.js does not use JavaScript because JavaScript is the ideal notation for
every mathematical algorithm. The mathematical library is ordinary
CPython-parseable Python, and performance-critical closed computations can
become host-independent native cores. JavaScript is the mature, portable host
between those layers.

That host provides a great deal which would otherwise have to become part of a
new computer-algebra runtime:

- a highly optimized garbage-collected dynamic engine, with V8 able to make
  ordinary orchestration and fallback code surprisingly fast;
- Linux, macOS, native Windows, server, desktop, and browser deployment from a
  broadly shared language and tooling ecosystem;
- modules, promises, workers, networking, visualization, databases, editors,
  testing tools, profilers, debuggers, and package distribution;
- the Node ecosystem for applications and services, plus direct access to the
  browser ecosystem for interactive mathematics; and
- continuing engineering by several competing JavaScript engines and a much
  larger community than a bespoke mathematics VM could support.

The ecosystem also has a conspicuous gap: it has superb application and web
infrastructure but comparatively little deep exact mathematics and computer
algebra. Sage.js can fill that gap without recreating the surrounding platform.

Building the whole system from scratch—even in a memory-safe implementation
language—would mean owning an object model, garbage collector, module loader,
event loop, debugger, profiler, package system, browser story, platform ports,
and application ecosystem before those efforts improve a single mathematical
algorithm. Rust can be excellent for a runtime component or foreign adapter,
but choosing Rust as the implementation language would not by itself provide
the Python source model, same-body fallback, or existing JavaScript platform.

Building directly on CPython would provide the mature Python ecosystem and is
an important compatibility reference. It would, however, center native output
on the CPython process and extension ABI, and would not directly give Sage.js
its browser, JavaScript-application, or single-executable distribution model.
The current design instead keeps mathematical source CPython-parseable while
allowing the dynamic implementation to live naturally in the JavaScript host.
CPython remains an essential differential oracle rather than the required
runtime of every deployed kernel.

This is not lock-in to V8. The architecture deliberately separates:

```text
ordinary Python/Sage.js API and orchestration
                    |
          JavaScript host and adapters
                    |
       versioned host-isolated kernel ABI
              /                 \
      compiled typed core    declared libraries
```

Node is one adapter to an isolated core; WebAssembly, a standalone C program,
or a future accelerator host can use another. JavaScript therefore supplies a
mature default platform without becoming an invisible callback dependency
inside accepted native kernels.

## How this differs from handwritten C and N-API

Handwritten C or C++ exposed through N-API can be extremely fast. It also gives
an expert complete control over representation, allocation, vectorization,
library calls, and platform-specific instructions. Sage.js used this pattern
for much of its early native functionality, and it remains an important escape
hatch. The question is not whether generated code can make C unnecessary. It
is where the mathematical algorithm should normally be maintained.

A direct N-API implementation commonly combines four concerns in one native
codebase:

1. the mathematical algorithm;
2. low-level representations, allocation, and cleanup;
3. conversion between JavaScript values and native storage; and
4. Node/N-API error and lifecycle rules.

The same operation usually still needs a separate portable implementation for
the browser or a build without the addon. The result may be a fast native
implementation, a readable fallback, and binding code whose agreement must be
maintained manually.

Compiled Python moves the algorithm back to one readable source body. The
compiler lowers it into a host-independent core, while generated adapters own
validation, conversion, statuses, and cleanup. The original body remains the
dynamic fallback.

| Question | Handwritten C/C++ plus N-API | Sage.js compiled-Python target |
|---|---|---|
| Where is the algorithm? | In a native implementation, often separate from the Python/JavaScript fallback. | In one ordinary Python body used by every execution tier. |
| What must an author review? | Pointer arithmetic, allocation, cleanup, N-API handles, errors, and the algorithm. | The algorithm, types, effects, compiler explanation, and boundary contract; raw machinery is generated. |
| Can normal algorithm code corrupt memory? | Yes. An incorrect index, lifetime, cast, or cleanup path can crash or leak. | The accepted language exposes bounded values and views, not raw pointers or manual allocation. A crash or leak is a compiler, generated-adapter, or foreign-library defect. |
| How are exact integers optimized? | Each implementation chooses and maintains its own machine-word/GMP strategy and overflow paths. | `Integer` uses compiler-managed checked machine words with exact GMP promotion. |
| How are repeated optimizations shared? | Through manually designed C helper libraries and coding conventions. | Through compiler passes and representation rules which benefit every accepted kernel. |
| How is equivalence checked? | Native and fallback implementations require hand-maintained cross-tests. | The same source provenance supports routine differential execution across dynamic, JavaScript, and native tiers. |
| Where can formal reasoning focus? | On both the algorithm and C's pointer, aliasing, overflow, and lifetime behavior. | On the typed algorithm and explicit effects, plus reusable proofs of compiler lowerings and stated assumptions about foreign libraries. |
| What is the host dependency? | Usually a Node addon coupled to N-API, plus any linked libraries. Reusing it from CPython requires another binding layer and may require separating algorithm code that assumed Node values or lifetimes. | A host-independent core and host-neutral FFI contract with a thin Node adapter; other adapters can target standalone C, WebAssembly, or a future CPython-hosted `sage.py`. |
| What happens without a native artifact? | A separate fallback must exist or the feature is unavailable. | The same source body remains the required dynamic fallback. |
| What happens when the compiler lacks a construct? | Not applicable; the C author implements it directly. | Compilation rejects the function clearly; use the fallback, improve a general compiler capability, call a declared library, or record a narrow C exception. |

The “implement once” point is central. Checked machine-word arithmetic with GMP
promotion is only one example. Escape analysis, scratch-storage reuse, direct
calls between kernels, bounds-check elimination, packed-record layout,
transactional outputs, vectorization, parallel scheduling, and target-specific
code selection can all become compiler capabilities. Once proved and tested,
each capability applies to many clear Python algorithms. With handwritten C,
every algorithm author must notice, implement, test, and preserve the same
optimization without introducing a rare overflow or ownership bug.

This also changes how optimization work compounds. Improving one C function
makes one C function better. Improving a sound compiler lowering can make an
entire mathematical corpus better while leaving its reviewed source unchanged.
The compiler is therefore infrastructure, not merely a convenient C generator.

Host independence is also source-code leverage. Sage.js currently uses Node
and JavaScript as its default dynamic host, but neither N-API nor V8 is part of
an accepted kernel's mathematical semantics. The same CPython-parseable
algorithm body, isolated kernel ABI, and declarative foreign-library contract
could later be used by a CPython extension adapter. This does not make a
complete `sage.py` distribution automatic: its dynamic object model, packaging,
and generated bindings would still be substantial work. It does mean the
mathematical corpus would not first have to be extracted from thousands of
Node-specific C callbacks. N-API is a replaceable edge of the architecture,
not the permanent owner of the algorithms.

There are still cases where C or C++ is the right layer:

- a thin host adapter or foreign-library shim;
- a representation primitive shared by generated kernels;
- architecture-specific intrinsics which the compiler cannot yet express;
- integration with an existing mature native library; or
- a measured compiler limitation whose workaround would make the Python less
  clear or materially slower.

Those cases should be explicit and classified. A benchmark showing that one
handwritten kernel is faster is evidence for a compiler improvement or a
documented exception—not a reason to quietly move the entire mathematical
implementation into an N-API addon.

## How this differs from Cython

Cython demonstrated that Python-shaped native programming can transform a
mathematical ecosystem. Sage.js compiled Python deliberately makes a different
tradeoff.

Cython spans a continuum: ordinary Python operations can coexist with typed C
operations, and carefully written `nogil` regions can avoid the Python runtime.
That flexibility is valuable, but high-performance Cython commonly introduces
Cython-only declarations, extension types, pointers, manual library APIs, or a
separate pure-Python implementation. Sage.js instead makes host isolation and
same-body fallback admission requirements for every accepted kernel. It is not
“Cython with a different code generator.”

| Question | Typical Cython model | Sage.js compiled-Python target |
|---|---|---|
| What is maintained? | Python-like code that may freely mix Python/C API and C-level operations. | Ordinary Python containing the actual mathematical algorithm. |
| Can compiled code call the interpreter? | Yes; mixed Python and native regions are fundamental. | Not after entering an accepted isolated kernel. |
| What happens to an unsupported operation? | It may remain a Python operation. | Compilation fails unless the operation has a native or declared-FFI lowering. |
| What does `Integer` mean? | Usually a Python object unless manually mapped to a native library. | Exact arithmetic with compiler-managed machine-word/GMP representation. |
| Does the source run without compilation? | Pure-Python mode can; many Cython-specific programs cannot. | The same body is required to retain a correct fallback. |
| How are internal native calls expressed? | `cdef`/`cpdef` and Cython declarations. | Ordinary typed functions in a compiler-built dependency graph. |
| What is the native artifact? | Usually a CPython extension module. | A host-independent isolated core plus thin adapters. |
| Who handles memory safety? | Authors using C-level constructs can manipulate pointers and resource lifetimes directly. | The accepted language exposes no raw pointer or manual lifetime; a crash or leak is an implementation defect. |

This stricter subset gives up transparent compilation of arbitrary Python in
exchange for a clearer performance model, portable kernel boundary, and a
smaller semantic gap between the code people read and the code that runs.

## How this differs from Numba

Numba is one of the strongest demonstrations that ordinary-looking Python can
become excellent machine code without first translating an algorithm by hand
into C. Its central interface is a decorator such as `@jit` or `@njit`.
Typically, Numba specializes a function for the concrete argument types seen
on its first calls, caches those specializations in memory, and may cache
compiled code on disk. Explicit signatures can instead request eager
compilation. Its especially successful domain is numerical Python: loops over
fixed-width scalars and NumPy arrays. See Numba's official
[five-minute guide](https://numba.readthedocs.io/en/stable/user/5minguide.html)
and [`@jit` reference](https://numba.readthedocs.io/en/stable/user/jit.html).

That makes Numba an important predecessor and a useful benchmark, but Sage.js
compiled Python is not intended to be a Numba clone:

| Question | Typical Numba model | Sage.js compiled-Python target |
|---|---|---|
| What system does it extend? | CPython and the scientific-Python ecosystem, especially NumPy. | Sage.js's Python/Sage language, mathematical object model, JavaScript fallback, and isolated kernel ABI. |
| When is compilation normally performed? | Lazily for runtime argument-type specializations, although explicit signatures and ahead-of-time workflows also exist. | Explicitly ahead of execution with `sagejs native compile`; the content-addressed artifact and its ABI are first-class outputs. |
| What determines the native signature? | Runtime argument types or an optional explicit Numba signature; one function may have several compiled overloads. | One declared ABI signature per accepted `@native` function. Sage.js deliberately does not add Julia-style multiple dispatch. |
| Can compiled execution use Python objects? | Numba's fast nopython mode avoids the interpreter; object mode and object-mode loop lifting are separate compatibility mechanisms. Modern `@jit` defaults to nopython compilation. | No host-object mode exists inside an accepted kernel. An unsupported operation rejects compilation; the original whole function remains the dynamic fallback outside the artifact. |
| What arithmetic is central? | Fixed-width CPU scalars, NumPy dtypes, arrays, and numerical operations. Python integer behavior inside compiled code depends on Numba's supported typing and lowering rules. | Exact computer-algebra types are part of the contract. `Integer`, for example, uses checked machine words with transparent GMP promotion rather than silent fixed-width overflow. |
| What is the data boundary? | Primarily Python/NumPy values managed by the CPython and NumPy runtimes. | Versioned scalar, packed-buffer, record, ownership, status, and declared-FFI contracts designed to be callable without Python, JavaScript, Node, or Sage.js in the core. |
| Is the artifact intended to be host independent? | Numba normally accelerates functions within a CPython process and uses its runtime machinery for dispatch and integration. | Yes. A compiled core is intended to be callable from Node, standalone C, WebAssembly, a future CPython-hosted `sage.py`, or an accelerator adapter. |
| What happens without compilation? | The undecorated Python function can run, but a decorated function's normal execution goes through Numba's dispatcher and compilation policy. | The exact decorated source body is required to remain a correct ordinary Python/Sage.js implementation, and native execution can be disabled explicitly. |

The phrase “nopython mode” can make the two systems sound identical. At the
innermost loop they may indeed have the same desirable property: neither is
executing Python bytecode. The architectural boundary is different. Numba's
native code is normally a specialization managed by a CPython extension and
Numba runtime. Sage.js treats the closed, host-isolated core and its small ABI
as the product. The JavaScript or Python host chooses a kernel and validates
its boundary, but an accepted kernel cannot pause midway to ask that host to
perform a dynamic operation.

The exact-mathematics emphasis is equally important. Numba should remain an
excellent option for existing NumPy algorithms, and Sage.js should not try to
duplicate its enormous supported NumPy surface merely to claim breadth. The
Sage.js compiler should concentrate on representations and transformations
that a pure-math system repeatedly needs: exact-integer promotion, finite-field
arithmetic, packed mathematical records, reusable scratch storage, declared
FLINT/PARI-style calls, and differential execution against the same readable
source body.

Numba also sets standards Sage.js should learn from. It has mature type-driven
specialization, cache controls, parallel-loop transformations, `nogil`
execution, diagnostics, and a long history of discovering where Python syntax
helps or obscures optimization. Sage.js's narrower admission rule is not a
claim that it is already broader or more mature. It is a deliberate foundation
for artifacts with stronger exactness, provenance, fallback, and host-isolation
guarantees.

## How this differs from Julia

Julia is the closest comparison in spirit. It was designed for technical
computing, can express generic mathematical algorithms at a high level, and
specializes methods into efficient native code. Its
[multiple dispatch](https://docs.julialang.org/en/v1/manual/methods/) is a
particularly powerful way to organize a mathematical library. Mature systems
such as Nemo and Oscar also demonstrate that Julia can be an excellent host
for serious computer algebra.

Sage.js compiled Python is nevertheless not “Julia with Python syntax.” The
two systems choose different language, arithmetic, compilation, and runtime
contracts:

| Question | Julia | Sage.js compiled-Python target |
|---|---|---|
| What language is maintained? | Julia, a distinct dynamic language designed for technical computing. | A strict subset of ordinary CPython-parseable Python; the file remains a Python module. |
| What happens without native compilation? | The source executes as Julia and is normally specialized by Julia's compiler when called. | The original function body remains the required dynamic Python/Sage.js implementation. |
| When is code compiled? | Concrete method specializations are normally compiled just in time; Julia also supports AOT system and package images. | `sagejs native compile` explicitly lowers a declared function graph ahead of execution into a content-addressed isolated core. |
| Does an AOT artifact require the language runtime? | A Julia image contains native code plus Julia types, methods, and runtime state restored by Julia. | The isolated core has a small versioned C ABI and no Python, JavaScript, Node, or Sage.js runtime dependency. Arithmetic libraries such as GMP and declared foreign libraries may still be dependencies. |
| Is there multiple dispatch? | Yes. Dispatch on all argument types is central to the language and library architecture. | No. Each accepted `@native` function has one explicit ABI signature. Put rich dispatch in ordinary Python and call a selected typed kernel. |
| What does an integer mean? | `Int` is machine-sized and wraps on overflow; exact unbounded arithmetic uses an explicitly selected `BigInt`. | `Integer` is exact and automatically promotes from checked machine-word storage to GMP. Bounded types such as `uint64` are explicit alternatives. |
| How is generic code optimized? | The compiler specializes generic methods for concrete argument types, often allowing abstractions to disappear. | The compiler accepts a deliberately bounded typed subset and builds a closed dependency graph; unsupported dynamic behavior is a compile-time error. |
| What owns memory? | Julia garbage-collects managed objects. Its C interface also exposes pointers and operations whose correctness depends on signatures, rooting, and lifetimes. | Kernel authors see values, records, and bounded buffers rather than raw pointers. Generated call plans enforce declared ownership; a leak or crash is a compiler, adapter, or foreign-library defect. |
| How are C libraries called? | Directly through `@ccall`/`ccall`, with safe wrappers commonly built in Julia around lower-level declarations. | Through auditable Sage FFI declarations that generate checked host and isolated-core adapters, ownership cleanup, status handling, and dynamic fallbacks. |
| How is generated code inspected? | Julia provides mature introspection including method tables, typed IR, LLVM IR, and native code. | `native explain`, `native ir`, `native emit-c`, source maps, and differential benchmarks are required developer interfaces. |
| How broad is the compiler? | A mature general technical-computing compiler with parametric types, dynamic dispatch, metaprogramming, concurrency, and accelerator ecosystems. | An experimental mathematics-specific kernel compiler. Dynamic orchestration deliberately stays outside its smaller accepted language. |

The integer distinction deserves emphasis. Julia documents that overflowing a
fixed-width integer wraps and recommends checked operations or `BigInt` when
overflow is unacceptable; conversion to arbitrary precision must be chosen
explicitly. Sage.js `Integer` instead encodes the computer-algebra expectation
that an integer remains mathematically exact while the compiler may represent
each value as a machine word until promotion is necessary. This is not
inherently faster than every Julia implementation: it is a different default
semantic contract that the compiler is designed to optimize.

The compilation distinction is equally important. Julia
[normally specializes methods at runtime](https://docs.julialang.org/en/v1/manual/methods/#Method-specializations),
although it also has an
[AOT image pipeline](https://docs.julialang.org/en/v1/devdocs/aot/). A Julia
image preserves Julia method and runtime state. A Sage.js isolated artifact is
instead intended to be a small standalone mathematical kernel with an explicit
ABI. It can be called by Sage.js, a C program, WebAssembly, or another future
host without bringing an interpreter into the core.

Julia is substantially more expressive inside optimized code today. Sage.js
should not recreate multiple dispatch, unconstrained dynamic types, or Julia's
entire compiler inside `@native`. If an algorithm naturally requires rich
dispatch, keep that policy in readable ordinary Python and make the selected
kernel call coarse-grained. That separation is a design feature, not an
embarrassing compiler failure.

Likewise, benchmark claims must remain narrow. A result showing one Sage.js
kernel beating one Julia implementation establishes something about those
implementations, input distributions, and arithmetic contracts—not a general
limit on Julia. The meaningful Sage.js goal is more concrete: source-transparent
typed Python should approach excellent handwritten native implementations for
important mathematical kernels while preserving exact semantics and a correct
same-body fallback.

## How this differs from Mojo

Mojo is an ambitious systems language with Pythonic syntax, bidirectional
Python interoperability, a rich struct/trait type system, explicit value
ownership, and first-class heterogeneous CPU/GPU compilation. Its own manual
describes it as a language for high-performance AI infrastructure and
heterogeneous hardware, built on MLIR. See the current [Mojo
Manual](https://docs.modular.com/mojo/manual/), [ownership
model](https://docs.modular.com/mojo/manual/values/ownership/), and
[compilation targets](https://docs.modular.com/mojo/tools/compilation/).

Sage.js compiled Python is not an attempt to reproduce that general-purpose
systems language. It makes a narrower trade:

| Question | Mojo | Sage.js compiled-Python target |
|---|---|---|
| What language is maintained? | A distinct Python-family systems language that adopts and extends Python syntax. | A strict subset of ordinary CPython-parseable Python; the file remains a Python module. |
| What is the primary domain? | AI infrastructure, systems programming, and heterogeneous CPU/GPU hardware. | Exact and numerical mathematics, computer algebra, and readable mathematical algorithms. |
| Is the source itself the fallback? | Python interoperability can call existing Python, but a Mojo function is not itself an ordinary Python function. | Yes. The original body is the required dynamic Python/Sage.js implementation. |
| How broad is the type system? | User-defined structs, traits, parameters, ownership conventions, lifetimes, and low-level control. | A deliberately small mathematical and storage vocabulary with checked ABI semantics. |
| Who expresses ownership? | The language gives authors explicit ownership and reference conventions. | Kernel authors use values and bounded storage; the compiler and FFI call plan generate native ownership and cleanup. |
| What happens inside compiled code? | Native Mojo code may use its systems runtime and supported Python/C interoperability according to the target. | An accepted isolated kernel has no Python, JavaScript, Node, or interpreter callback in its transitive core. |
| What does an integer annotation promise? | The selected Mojo type's declared systems semantics. | `Integer` specifically promises exact machine-word/GMP promotion without silent wrap; `uint64` specifically promises a checked bounded ABI value. |
| How are mature math libraries used? | Through Mojo's interoperability and bindings. | Through Sage.js declarations carrying shapes, ownership, effects, errors, dynamic fallback, and direct isolated-core lowering. |
| Accelerator status | A central, shipping compiler capability across supported GPU targets. | A future backend made possible by isolated cores and packed ABI storage; not yet a claim of comparable GPU support. |

The central positioning difference is therefore not “our compiler versus their
compiler.” Mojo asks developers to adopt a new systems language in exchange
for broad low-level and accelerator power. Sage.js asks mathematical library
authors to identify a statically meaningful subset of the Python they already
maintain, preserving that Python as the executable specification while adding
mathematics-specific compilation semantics.

There is room for both approaches. Mojo is a useful standard against which to
measure compiler diagnostics, ownership design, target support, and generated
performance. Sage.js should not imitate its language breadth at the cost of
the same-source fallback or the exact-mathematics contract that makes this
architecture distinctive.

## Frequently asked questions

### Should I decorate an entire package?

Usually not. Begin with a hot, coarse-grained algorithm and its typed helper
graph. Keep orchestration, rich objects, display, caching policy, and uncommon
branches in ordinary Python until measurements justify moving a boundary.

### What if compilation is slower than the fallback?

Keep the fallback, record the benchmark, and inspect packing, call size,
algorithm choice, bounds checks, and backend selection. `@native` is not a
promise that every accepted function wins at every input size.

The simplest counterexample is a function whose body is cheaper than crossing
the native boundary:

```python
@native
def add_one(value: Integer) -> Integer:
    return value + 1
```

A call must still validate and convert the argument, enter the adapter, execute
the core, check its status, and convert the result. The dynamic fallback may do
the single addition faster. Calling this tiny kernel repeatedly from dynamic
Python makes the boundary problem worse:

```python
sum(add_one(k) for k in range(count))  # one boundary crossing per item
```

Move the loop across the boundary instead:

```python
@native
def sum_successors(count: uint64) -> Integer:
    return sum(k + 1 for k in range(count))
```

Now one checked call contains the entire reduction, giving the compiler enough
work to repay the boundary cost. The useful question is therefore not merely
“is this function native?” but “how much work occurs per native call?”

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

### Can Magma, Mathematica, Maple, Macaulay2, or Matlab source be compiled?

Not by the native compiler today. Sage.js can parse and execute useful subsets
of several foreign mathematical notations, but `@native` currently accepts
typed Python only. Foreign-language input does not silently become a native
kernel merely because Sage.js can run it.

It is technically possible. A future language frontend could lower a small,
statically meaningful subset into the same typed IR and host-isolated kernel
ABI, either directly or through source-mapped typed Python. It would still have
to satisfy the normal native contract: a correct dynamic execution path,
explicit types and effects, no callbacks after entering the isolated core,
inspectable lowering, and differential tests.

This must not be implemented as superficial syntax substitution. These
languages disagree about important semantics: one-based indexing, inclusive
ranges, scalar and matrix arithmetic, exact versus machine integers, coercion
and parent systems, mutation, evaluation, symbolic expressions, and error
behavior. Magma or Macaulay2 code should retain Magma or Macaulay2 semantics;
Matlab code should retain Matlab array and numerical semantics. If those rules
cannot be represented exactly, native compilation should reject the program.

The likely architecture is therefore one shared optimizer and set of native
backends with several deliberately small frontends—not five independent native
compilers. Typed Python remains the first and canonical mathematical library
language. Another notation should gain native lowering only when a compelling
real corpus shows that doing so is clearer than translating the algorithm to
maintained Python.

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
- [Numba source](https://github.com/numba/numba) — a mature BSD-2-Clause
  reference for Python type specialization, caching, loop analysis, and
  diagnostics. Sage.js contributors may compare mechanisms without importing
  Numba's CPython/NumPy runtime assumptions into the isolated-kernel contract.
