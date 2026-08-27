---
title: "The Sage.js optimizer in the compiler landscape"
---
# The Sage.js optimizer in the compiler landscape

Sage.js is building a guarded, multi-level optimizer for **mathematical
semantics**, not a general replacement for a Python implementation or a new
systems language. That distinction explains both what it can learn from other
compilers and why none of them is a drop-in solution.

The optimizer starts with ordinary Sage/Python source. It recognizes a region
whose parent, coercions, effects, aliases, and escapes it can prove; preserves
those facts in an inspectable mathematical IR; selects a private
representation; emits guards over the live runtime contract; and chooses among
V8 JavaScript, resident or packed WebAssembly, source-transparent `@native`,
or the original generic program. If a guard fails, the untouched program runs.

This document compares architecture and contracts. It is not a benchmark
ranking: all of these systems can win spectacularly in their intended domain,
and measurements from one workload do not transfer automatically to another.

## One-page comparison

| System | What the programmer supplies | Principal specialization unit | Important IR or backend | What happens outside the fast subset | Central difference from Sage.js |
| --- | --- | --- | --- | --- | --- |
| **Sage.js optimizer** | Ordinary Sage/Python mathematical source | A proved region with a stable parent, coercion model, effects, and representation | Versioned semantic, mathematical, representation, and target plans; V8, Wasm, or `@native` | Entry guard selects the untouched source region; unsupported source is never rewritten | Must preserve Sage parent/coercion semantics while removing public objects inside a region |
| **Mojo** | A distinct statically compiled language with Pythonic syntax and explicit systems facilities | Parametric functions and concrete types/layouts | Layered MLIR lowering to CPUs, GPUs, and accelerators | Code must satisfy Mojo's language and type rules; Python interoperability crosses into a different runtime | Mojo can design ownership, types, and layouts into its language; Sage.js must prove facts about existing dynamic source |
| **Cython** | Python-like source plus Cython declarations, annotations, or `.pxd` augmentation | Statically typed functions, variables, loops, and extension types | Generated C/C++ and a CPython extension module | Untyped operations generally keep Python C-API behavior and overhead | Cython asks the author for a C-level contract; Sage.js tries to infer a guarded mathematical contract |
| **Numba** | Python functions, commonly marked with `@jit`/`@njit`, over supported types and operations | A function specialized for an argument-type signature | Typed compiler IR and LLVM machine code | Compilation rejects unsupported `nopython` code or follows the explicitly selected fallback policy | Numba specializes numerical Python types; Sage.js additionally has algebraic parents and a global coercion model to prove |
| **Julia** | Julia source written in a language designed for multiple dispatch and specialization | A method instance for concrete argument types | Julia-specific typed SSA IR, then LLVM/JIT | Dynamic dispatch remains where inference cannot determine a concrete target | Julia's dispatch and type model were designed with specialization in mind; Sage.js overlays specialization on Sage/Python semantics |
| **PyPy tracing JIT** | Ordinary Python executed by PyPy | A hot execution trace through the interpreter | Traces of residual operations, optimizer, machine-code backend | Guards leave a trace and execute or compile another path | PyPy specializes observed general-Python behavior; Sage.js recognizes a mathematical region and records a domain proof before execution |
| **Graal/Truffle** | A language interpreter written against Truffle APIs | Self-optimizing AST/bytecode call targets and observed shapes | Partial evaluation into Graal IR and machine code | Deoptimization transfers execution back to the interpreter | Truffle is a framework for building an entire adaptive language VM; Sage.js uses V8 and adds a smaller mathematical middle end |
| **JAX** | Traceable, mostly functional array programs transformed with `jit` and related APIs | A function specialized for array shapes, dtypes, and static arguments | `jaxpr`, then XLA for CPU/GPU/TPU | Data-dependent Python behavior that tracing cannot stage is rejected or must be expressed with JAX control flow | JAX deliberately stages array computations; Sage.js keeps interactive scalar algebra and exact parent/coercion behavior |
| **Pythran** | A supported Python subset with exported type signatures | An exported function instantiated for concrete types | Python AST analyses and transformations, templated C++17, native extension | Unsupported Python is outside the compiled subset; the `.py` implementation can remain the separately used fallback | Pythran is an AOT numerical subset compiler; Sage.js needs runtime guards and browser-capable target selection |

## Sage.js's unusual contract

Consider this ordinary source:

```python
R = Zmod(1009)

def recurrence(count, x, a, b):
    for _ in range(count):
        x = a*x + b
    return x
```

The generic meaning is not merely integer multiplication and reduction. It
includes the identities of `R`, its element representation, Sage's binary
operator dispatch, the coercion from `ZZ`, potentially mutable methods, and
the absence of observable intermediate objects. Sage.js may use primitive
JavaScript numbers only after it has proved the relevant conditions and
installed guards that make those conditions true at entry.

That leads to four separations which are easy to blur in an ad hoc optimizer:

1. **Legality:** is replacing the region observationally equivalent?
2. **Representation:** may an element be a Number, coordinate tuple, packed
   buffer, or resident foreign resource inside the region?
3. **Target:** should that representation execute in V8, Wasm, `@native`, or a
   mature library?
4. **Profitability:** is conversion plus guard cost smaller than the work
   removed for this region?

The same proved mathematical operation graph can have several legal targets.
A tiny word-prime recurrence often favors monomorphic Number locals optimized
by V8. A longer fixed-degree extension-field computation might favor tuple
locals or a resident Wasm loop. A large FLINT object normally favors a coarse
native or Wasm library call. Target choice is evidence, not identity.

Numerical code requires a neighboring but different mathematical IR. IEEE-754
addition is not associative, NaNs and signed zero are observable, and a source
multiply followed by an add is not automatically a fused multiply-add. The
strict numerical region therefore records an ordered binary64 program rather
than claiming commutative-ring laws. This resembles the conservative semantic
mode of numerical subset compilers; any future reassociation or fast-math must
be an explicit, separately tested policy rather than a consequence of choosing
V8, Wasm, or native code.

The initial ordered multiply-add measurement illustrates the difference
between backend reputation and a specific lowered graph. On one Node 26
x86-64 host, Sage.js/V8, Numba 0.67/LLVM, and Julia 1.12.7/LLVM all took about
2.0 ns per serial multiply-add step and produced identical binary64 bits. The
loop-carried dependency, rather than dispatch or code generation, was the
remaining limit. Numba paid roughly 216 ms on its first compiled call; the
Sage.js optimizer added only a small AST-analysis cost before V8's ordinary
tiering. Array loops and SIMD kernels can have a very different ordering.

## Mojo and MLIR: layered lowering

Mojo is a new compiled language, not an implementation of Python. Its manual
describes a language built around MLIR, compile-time parameterization, and
heterogeneous CPU/GPU targets. Its ownership and lifetime model is part of the
language and compiler contract. The compiler can therefore require facts that
Sage.js must infer and guard.

The strongest lesson for Sage.js is structural: retain domain information in
multiple IR levels instead of lowering immediately to generic JavaScript.
Parent identity and ring operations should still be visible while algebraic
passes run; representation and ownership should still be visible while a
backend is chosen. Mojo also reinforces the value of inspectable IR and
target code.

Sage.js should not adopt Mojo syntax or MLIR merely because those layers are
well designed. Its compiler is much smaller, its primary runtime is already
V8, and its central problem is preserving dynamic Sage semantics. MLIR becomes
interesting only if a real backend needs its ecosystem badly enough to repay
the build size, toolchain, and maintenance cost.

References: the [Mojo manual](https://docs.modular.com/mojo/manual/),
[compilation targets](https://docs.modular.com/mojo/tools/compilation/), and
[lifetime/origin model](https://docs.modular.com/mojo/manual/values/lifetimes).
The repository RFC also records specific lessons from the open-source compiler
in [`agents/optimizing-mathematics-compiler-rfc.md`](../agents/optimizing-mathematics-compiler-rfc.md).

## Cython: explicit C-level contracts

Cython demonstrates how much performance appears once Python object operations
become typed C operations. Its pure-Python mode can keep source interpretable,
but the programmer still supplies Cython annotations, declarations, memory
layout, GIL, bounds-checking, and error-contract information when maximum
performance matters. Its annotation view makes remaining Python interaction
visible.

Sage.js should borrow that visibility. An optimizer report should make every
remaining generic operation or boundary obvious, just as Cython's annotated
HTML exposes Python C-API interaction. Sage.js should also emulate Cython's
honesty that merely translating untyped source does not erase object overhead.

The semantic contract differs. A declaration such as `cython.int` tells Cython
what machine operation the author accepts. A Sage.js residue-ring local still
has exact mathematical and coercion semantics. Sage.js must derive a private
machine representation and prove it is observationally equivalent; silently
treating it as a C integer would be wrong.

References: Cython's [pure Python mode](https://docs.cython.org/en/latest/src/tutorial/pure.html)
and [NumPy tutorial and annotation workflow](https://docs.cython.org/en/latest/src/userguide/numpy_tutorial.html).

## Numba: typed function specialization

Numba is the closest familiar example of specializing Python numerical code
for concrete argument types. Its `nopython` pipeline types a function and
lowers supported operations without relying on the Python runtime. This makes
its fail-fast boundary important: unsupported or ambiguous code must not
silently masquerade as the fast path.

Sage.js should borrow signature-keyed caching, typed-IR discipline, explicit
failure explanations, and a clean distinction between compilation and
execution. It should not equate a Python class with a mathematical
representation. Two Sage elements may have the same implementation class yet
belong to different parents, and binary operations may legally invoke the
coercion model. Parent, modulus, defining polynomial, method identity, and
effect/escape facts are therefore part of a Sage.js specialization key.

Reference: Numba's [compiler architecture](https://numba.readthedocs.io/en/stable/developer/architecture.html)
and [JIT compilation reference](https://numba.readthedocs.io/en/stable/reference/jit-compilation.html).

## Julia: specialization designed into the language

Julia provides perhaps the clearest demonstration that high-level generic
mathematical code can become excellent machine code. Multiple dispatch,
concrete immutable values, inference, and method-instance specialization are
language/runtime concepts rather than an added escape hatch. Julia performs
domain-specific optimization in a Julia SSA IR before translating inferred
code to LLVM and its JIT.

Sage.js should borrow the idea that typed SSA is the right place for many
middle-end analyses, and that developers need to inspect inferred code and
costs. Julia also warns against unstable types and overly broad specialization:
compiler latency, invalidation, code size, and dynamic dispatch are part of
performance engineering, not afterthoughts.

Sage.js cannot obtain Julia's properties by sending JavaScript to LLVM. Julia
programs already use Julia's dispatch and type semantics. Sage.js begins with
Python/Sage object, mutation, exception, and coercion behavior, so a region's
typed representation must be guarded and its generic source retained.

References: Julia's [SSA-form IR](https://docs.julialang.org/en/v1/devdocs/ssair/),
[inference documentation](https://docs.julialang.org/en/v1/devdocs/inference/),
and [JIT design](https://docs.julialang.org/en/v1/devdocs/jit/).

## PyPy and Graal/Truffle: speculation, guards, and deoptimization

PyPy's tracing JIT records hot paths through an interpreter, optimizes the
residual operations, and protects assumptions with guards. Graal/Truffle
language implementations use self-optimizing ASTs or bytecodes, runtime
profiles, splitting/monomorphization, partial evaluation, and deoptimization.
These systems show how dynamic languages become fast without declaring all
types statically.

This is the most relevant precedent for Sage.js's runtime discipline:

- specialize only on assumptions that can be checked;
- make guards explicit and cheap;
- preserve a correct interpreter/generic path;
- bound region and inlining size;
- track failed guards and compilation decisions; and
- avoid poisoning correctness when a speculative path exits.

Sage.js currently chooses a deliberately smaller mechanism. It does not trace
arbitrary execution or implement a new VM. It recognizes source regions with
mathematical meaning before they run, validates stream elements
transactionally, and either commits the optimized result or re-executes the
untouched region. That static domain proof can be stronger than a generic hot
trace, while necessarily covering much less Python.

References: PyPy's [architecture overview](https://doc.pypy.org/en/latest/architecture.html)
and [JIT controls](https://doc.pypy.org/en/latest/jit_help.html), plus the
GraalVM [Truffle platform overview](https://www.graalvm.org/latest/graalvm-as-a-platform/)
and [optimization guidance](https://www.graalvm.org/latest/graalvm-as-a-platform/language-implementation-framework/Optimizing/).

## JAX: staging a whole operation graph

JAX makes the boundary explicit with transformations such as `jax.jit`. It
traces supported operations to `jaxpr`, specializes on types/shapes and static
arguments, then gives the whole graph to XLA. Seeing the graph permits fusion,
temporary elimination, and accelerator lowering which eager per-operation
dispatch cannot achieve.

That directly supports Sage.js's region thesis: the unit of optimization
should be an operation graph, not repeated scalar calls through Node-API or
Wasm. It also demonstrates why restrictions must be visible. Python control
flow dependent on traced values cannot simply behave as ordinary eager Python;
users must express it in a stageable form.

Sage.js makes a different usability tradeoff. The original program always
retains its ordinary semantics. A recognized region is an optional guarded
implementation, not a new tracing semantics exposed to the user. This limits
coverage but keeps a Sage prompt from dividing into subtly different eager and
staged languages.

References: JAX's [JIT guide](https://docs.jax.dev/en/latest/201/jit.html) and
[tracing semantics](https://docs.jax.dev/en/latest/tracing.html).

## Pythran: a pass-oriented numerical subset compiler

Pythran translates a numerical subset of Python to templated C++17 and native
Python modules, specializes exported functions for declared types, and exposes
its transformed Python and generated C++ for inspection. Its internals are
organized around analyses, optimizations, a pass manager, and backends.

This is a particularly practical organizational reference for Sage.js: keep
analyses separate from rewrites, make passes independently testable, and make
generated code inspectable. Pythran also illustrates the value of a supported
subset with a crisp boundary instead of heroic best-effort translation of all
Python.

The differences are deployment and semantics. Pythran produces a native
extension and can release the GIL once data has crossed the Python boundary.
Sage.js must work interactively in browsers and Node, can exploit V8 for tiny
monomorphic loops, and treats Wasm and native libraries as alternative region
targets. It also has to prove Sage parent/coercion behavior absent from a
typical array-kernel signature.

References: Pythran's [overview](https://pythran.readthedocs.io/en/latest/),
[manual](https://pythran.readthedocs.io/en/latest/MANUAL.html), and
[compiler internals](https://pythran.readthedocs.io/en/latest/INTERNAL.html).

## V8 and WebAssembly are cooperating targets

V8 and WebAssembly are not source-language competitors in this comparison.
They are two targets available in the same JavaScript deployment:

- **V8 JavaScript** is exceptional for monomorphic primitive locals, short
  guards, branches, and code which can remain allocation-free. It also avoids
  a marshalling boundary.
- **WebAssembly** provides predictable typed arithmetic, linear memory, SIMD,
  and portable compiled libraries. Scalar crossings can be surprisingly
  cheap, but resident or batched regions avoid even that cost and avoid public
  object materialization.
- **`@native`** provides native CPU code and mature library integration on
  desktop, at the cost of a larger foreign boundary and platform artifacts.

The compiler should not canonize one target. It should compare conversion,
guard, crossing, operation, allocation, and materialization costs for the
proved region, then record the selected route so performance cannot silently
collapse.

## What Sage.js should adopt

The common architecture that survives these comparisons is:

1. A pass manager with stable, versioned pass identities.
2. A target-neutral semantic and mathematical IR before representation
   selection.
3. Explicit fact production and consumption: parent, type, alias, escape,
   effect, range, shape, ownership, and method/coercion stability.
4. A verifier at every plan boundary, including rejection of malformed or
   overclaimed optimization metadata.
5. Guarded specialization keys with bounded caches and invalidation behavior.
6. Multiple backends consuming the same proved region.
7. Transactional deoptimization to the untouched program.
8. `O0`/`O1`/`O2`/`O3`/`Os` policy controls, plus a required-optimization mode
   for CI rather than user-visible semantic modes.
9. Deterministic explanations and inspectable lowered code.
10. Differential semantics, mutation/adversarial guards, resource bounds,
    compilation-cost budgets, and warm performance ratchets.

These are compiler infrastructure, not permission to add many AST patterns.
Each mathematical domain must still state its proof obligations and canonical
representation. Prime residue rings, fixed-degree extension fields, dense
polynomial evaluation, and matrix kernels are good bounded witnesses. A large
algorithm such as class-group computation should be optimized only after
profiling identifies a real region with an independently correct algorithm and
a crisp representation contract.

## What Sage.js should avoid

- **No benchmark-name dispatch.** Optimization derives from source, facts,
  and semantics, never a function name.
- **No silent fallback.** A required route is testable; an internal compiler or
  binding defect is not reported as “optimization unavailable.”
- **No premature low-level IR.** Erasing parent and coercion facts too early
  prevents proving the transformation that matters.
- **No universal backend claim.** V8, Wasm, native code, and mature libraries
  win in different regions.
- **No unbounded specialization.** Code size, compilation latency, cache size,
  and guard count have reviewed limits.
- **No fast-path-only semantics.** Exceptions, mutation, aliases, exactness,
  and intermediate observability are part of correctness.
- **No performance result without an oracle and route.** A fast wrong answer or
  an accidentally generic benchmark is not evidence.

## Trying the current implementation

The [optimizing compiler laboratory](optimizing-mathematics-compiler-lab.md)
contains copy-paste examples and measured comparisons. To inspect a source
file's decisions directly:

```sh
sagejs compile --sage --omit-baselib --explain-optimizations \
  --output a.js a.py
```

Use `--optimization-require math.closed-ring-region.v1` in CI or experiments
when failure to select the intended pass must be an error. The explanation
records proven facts, guards, representations, candidate targets, costs,
rejection reasons, and fallback.
