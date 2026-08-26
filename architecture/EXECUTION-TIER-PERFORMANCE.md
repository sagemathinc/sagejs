# Execution-tier performance guide

This guide turns the finite-field boundary experiments into a practical
decision procedure for Sage.js performance work. It is especially relevant to
the general number-field class/unit-group engine, where a mathematically sound
algorithm can still lose orders of magnitude through representation,
allocation, and boundary costs.

The central lesson is:

> Performance belongs to a proved computation region and its representation,
> not to a language label. V8, WebAssembly, `@native`, and a mature library are
> complementary targets for different regions of the same public Sage source.

## Measured reference point

These are warmed Linux x64 medians from 2026-08-26 on an AMD EPYC 7B13. Each
row computes the same dependency-chained recurrence in `GF(65521)` and verifies
the exact checksum. The complete cross-host evidence is under
`bench/finite-field-boundary/`.

| Execution shape | Nanoseconds per modular step |
| --- | ---: |
| Sage.js `@native`, one boundary around 10 million steps | **4.66** |
| Wasm, 64 steps per call | **4.67** |
| Raw inline V8 Number loop | **4.98** |
| Public Sage `GF(65521)` loop after guarded V8 specialization | **5.32** |
| Wasm, one step per call | **9.77** |
| Julia immutable `ModP`, ordinary overloaded `*` and `+` | **12.91** |
| Native compiler's portable JavaScript IR | **28.5** |
| Node-API, one step per call | **56.1** |
| Public Sage field-object loop before loop specialization | **107.6** |
| Magma public finite-field element | **88.0** |
| PARI/GP public `Mod` value | **154.0** |

The same boundary harness found a resident Wasm vector kernel at about
2.21 ns per element. The native compilation itself took about 0.7 seconds;
V8's optimization was transparent during ordinary execution. Absolute values
vary by CPU, operating system, engine, thermal state, and generated code. The
ordering and the separately measured cost components matter more than one
decimal place.

## A useful cost model

For one region, reason about

```text
total time = useful arithmetic
           + boundary crossings * crossing cost
           + argument/result conversion and copying
           + public-object allocation and garbage collection
           + one-time compile/instantiate/load cost
```

A tiny Wasm crossing added only about 5 ns here, which is dramatically cheaper
than Node-API. It is nevertheless comparable to the arithmetic itself. One
Wasm call per modular operation almost doubled the inner-loop cost; batching
eight operations nearly amortized it, and batching 64 made it disappear into
the arithmetic. A single Node-API call around ten million native operations is
also effectively free, while ten million Node-API calls are disastrous.

Never compare only the C, Wasm, or JavaScript loop body. Measure the complete
buffer, conversion, ownership, and public-result path.

## Target-selection rules

| Region | Preferred first target | Reason |
| --- | --- | --- |
| Small, type-stable scalar loop already expressed in Sage source | Guarded V8 primitive locals | No crossing, no separate compilation, excellent speculative optimization |
| A few foreign scalar operations | Wasm if fusion is impossible | Roughly an order of magnitude cheaper to enter than Node-API in this experiment |
| Repeated operations on packed/resident data | Batched or resident Wasm | Linear memory, predictable representation, SIMD opportunity, portable artifact |
| Substantial typed source kernel | `@native` | Compilation and host boundary amortize; mature native libraries are available |
| HNF, SNF, factorization, ideal arithmetic, Arb/Acb work | Coarse mature-library call | The established algorithm dominates boundary cost |
| Unproved, polymorphic, user-mutated, or coercion-rich region | Generic public semantics | Correctness and observable Python/Sage behavior take priority |

This is a starting order, not a substitute for a matched benchmark. Data
residency can reverse a decision: a small operation on values already in Wasm
memory may belong in Wasm, while copying them solely for one operation may not.

## What lets V8 win

V8 is most effective when a hot region has:

- primitive Number locals with one stable representation;
- monomorphic property accesses or no property accesses;
- stable prototypes and method identities;
- loop-invariant parents, moduli, and shapes;
- no intermediate public mathematical objects;
- no Number/BigInt mixing;
- predictable arrays, preferably typed arrays for bulk storage;
- no callbacks, getters, proxies, reflection, or exception edges inside the
  arithmetic loop; and
- enough repetitions to become hot, but not a large ahead-of-time compilation
  requirement.

The finite-field specialization does **not** globally replace field elements
with numbers. It recognizes one tiny recurrence, proves a non-aliasing source
shape, checks the parent/representation/prototype/method facts at runtime,
runs the region with Number locals, materializes one public result, and retains
the original dispatched loop as the slow path. If any guard fails, the source
semantics run unchanged.

The optimization usually collapses when a loop repeatedly:

- enters the coercion model;
- allocates immutable-looking wrappers;
- freezes new objects;
- uses Python dictionaries or lists as scalar arithmetic storage;
- invokes dynamically resolved methods;
- changes hidden classes or array element kinds; or
- calls Node-API for each coefficient or element.

## What lets Wasm win

Wasm is not merely a browser fallback. It is a low-overhead portable native
backend, particularly when:

- arguments are scalars or already-packed typed buffers;
- data remains resident in linear memory across several operations;
- the ABI fuses a complete mathematical phase rather than an object method;
- SIMD or explicit fixed-width integer behavior is valuable;
- identical execution is needed in Node, Chromium, Firefox, and WebKit; and
- compilation latency and artifact size are acceptable or the module is lazy.

Do not respond to the cheap boundary by designing an object-at-a-time Wasm
API. At one operation per crossing, the measured Wasm loop was about twice the
cost of inline arithmetic. Use a batch, region, iterator, or resident resource.

## Recommended compiler organization

The current guarded recurrence is an intentionally narrow vertical slice. A
mature compiler should move such work into a middle end:

```text
frontend and binding resolution
    → semantic AST
    → control-flow or region IR
    → alias/effect/type/range/representation analyses
    → legality pass
    → profitability and target-selection pass
    → guarded region versioning
    → V8, Wasm, @native, or generic lowering
```

Each optimization pass should have a stable ID and declare:

- the IR pattern it consumes;
- required alias, effect, type, range, and method-stability facts;
- exceptions and observable behavior it preserves;
- runtime guards and exact fallback identity;
- supported targets;
- compile-time and code-size costs; and
- differential, mutation, browser, and performance tests.

Developer optimization controls would make this testable without creating
different mathematical dialects:

| Proposed control | Meaning |
| --- | --- |
| `O0` | Generic semantics; disable speculative/guarded transformations |
| `O1` | Local non-speculative simplifications |
| `O2` | Default guarded representation and loop specialization |
| `O3` | Larger fusion/batching with higher compile and code-size cost |
| `Os` | Prefer smaller browser output over duplicated fast/slow regions |
| `SAGEJS_OPT_DISABLE=<pass IDs>` | Force selected exact slow paths |
| `--explain-optimizations` | Report candidates, rejected guards, selected targets, and cost estimates |
| `--require-optimization=<pass ID>` | Fail a benchmark or test if a fast path silently disappears |

These are architectural recommendations, not current stable command-line
contracts. Optimization levels must never change mathematical results or
silently suppress exceptions.

## Applying this to class and unit groups

Start with phase attribution. A 1000× end-to-end gap cannot be explained by a
5 ns boundary alone; it almost certainly includes an algorithmic difference,
an object/coercion loop, repeated foreign calls, a poor storage layout, or some
combination of them.

Record at least the following for every representative field:

- time per phase and subphase;
- candidates attempted and relations accepted;
- factor-base size and relation-row length distribution;
- boundary call count, copied bytes, and live-resource high-water marks;
- public object allocations or a close proxy for them;
- matrix dimensions/nonzeros before HNF and SNF;
- precision-refinement history for the regulator;
- cold compilation/module load separately from warm work; and
- the same exact class invariants, units, proof status, and regulator enclosure
  in Sage.js, PARI, and Magma.

Then choose by phase:

| Class/unit-group phase | Likely direction |
| --- | --- |
| Candidate enumeration, rational-prime sieving, modular filters | Packed integers in a V8 typed region or resident/batched Wasm; benchmark both |
| Incremental modular relation rank | Avoid Python dict/object arithmetic in the inner row reduction; use packed sparse/dense rows and fuse a whole row or row batch |
| Norms, ideal multiplication/reduction, polynomial factorization | Coarse FLINT/PARI-quality library or `@native` calls; never one boundary per coefficient |
| Exact relation HNF/SNF and transformation matrices | Keep the existing packed FLINT boundary; verify that construction and replay do not fall back to per-entry calls |
| Unit dependency reconstruction | Retain factored units; avoid expanding coefficient vectors until required |
| Archimedean logarithms and regulator certification | Batch Arb/Acb evaluations and precision refinements; do not allocate one persistent numeric resource per scalar sample |
| Checkpointing, proof replay, public group construction | Keep readable generic code unless profiling shows it dominates; it is normally outside the hot search loop |

There is already a concrete candidate in
`sagejs.number_fields.class_group_matrix.ModularPivotScreen`: its incremental
screen uses nested Python dictionaries, repeated `%`, dictionary lookup and
mutation, and per-entry loops for every screening prime. That representation
is excellent readable reference code but hostile to V8 scalar replacement.
Do **not** rewrite it blindly. First benchmark three exact implementations on
the real relation-row distribution:

1. the current dictionary reference;
2. a guarded packed V8/typed-array row reducer; and
3. a resident or batched Wasm row reducer.

Require identical pivots, ranks, admitted relations, and final presentations.
If modular screening is a small fraction of the end-to-end time, move to the
actual dominant phase instead.

## Performance ratchets

Every accepted acceleration should include:

1. an independent exact oracle and the unoptimized same-source path;
2. tests that force every runtime guard to reject;
3. route evidence proving V8, Wasm, native, or fallback selection;
4. cold and warm timings;
5. boundary counts, copied bytes, and resource high-water marks;
6. a representative end-to-end benchmark, not only a microbenchmark; and
7. a loose reviewed ceiling that fails on loss of the intended tier without
   encoding normal host noise.

For compiler transformations, run the corpus with optimization enabled and
disabled and compare exact outputs and exceptions. For class/unit groups,
also compare the complete proof-bearing result, not merely the class number.

## Reproducing the evidence

```sh
pnpm bench:finite-field-boundary
pnpm bench:finite-field-compiler --check
pnpm bench:finite-field-native --check
pnpm --dir packages/flint-wasm test:browser:finite-field-compiler
```

See:

- `bench/finite-field-boundary/README.md` for all host/CAS commands;
- `bench/finite-field-boundary/RESULTS.md` for interpretation;
- `bench/finite-field-boundary/results-2026-08-26.json` for raw receipts; and
- `bench/finite-field-boundary/PROOF-OBLIGATIONS.md` for the guarded V8
  specialization's proof boundary.
