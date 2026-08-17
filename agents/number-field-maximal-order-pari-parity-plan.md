# Plan for PARI-class number-field maximal orders

## Objective

Implement a certified, PARI-free computation of the maximal order (ring of
integers) of a number field that matches PARI on ordinary workloads and is
competitive with or faster than PARI on difficult high-index and many-prime
workloads.

PARI is an offline oracle and performance baseline only. Sage.js must not load,
link, shell out to, or serialize through PARI at runtime. The implementation may
use FLINT, GMP, and Sage.js native compilation, and may study and port
appropriately attributed GPL-compatible algorithms from PARI.

The public correctness target is Sage semantics:

```python
K.<a> = NumberField(f)
O = K.maximal_order()
O.basis()
O.discriminant()
```

`K.ring_of_integers()` must return the same cached order. A result is not
acceptable merely because it has the expected discriminant on tested inputs:
the returned lattice must contain `1`, be closed under multiplication, contain
the equation order, and be certified locally maximal at every relevant prime.

## Current baseline

Commit `836b0359` introduced a correct PARI-free Zassenhaus Round-2
implementation, with an ordinary Python reference implementation and a batched
FLINT-storage native path. It replaced an exponential projective enumeration
and made the initial regression corpus practical.

The current implementation is in:

- `src/baselib/number_fields.py` — public objects, caching, discriminant
  factorization, and dispatch;
- `src/lib/sagejs/number_fields/maximal_order.py` — readable Dedekind and
  Round-2 algorithms;
- `packages/flint/include/sagejs/number_field_order_ffi.h` — native Round-2
  storage kernel;
- `bench/number-field-maximal-orders.sage` — initial six-field benchmark;
- `test/number-fields.cjs` — exact bases, discriminants, differential checks,
  and historical regressions.

Warmed measurements on the same Linux x86-64 host gave the following. Sage.js
and Sage timings call `maximal_order()` on fresh, already constructed field
objects. PARI `nfbasis` is the raw integral-basis operation; `nfinit` constructs
additional number-field data and is a conservative end-to-end baseline.

| Case | Sage.js | Sage | PARI `nfinit` | PARI `nfbasis` |
| --- | ---: | ---: | ---: | ---: |
| `x^7 - 2*x + 3` | 62.7 ms | 12.0 ms | 2.33 ms | 3.59 us |
| Sage essential-discriminant cubic | 17.7 ms | 7.25 ms | 0.33 ms | 3.49 us |
| LMFDB `3.1.431.1` | 18.8 ms | 5.75 ms | 0.29 ms | 3.37 us |
| LMFDB `5.1.17161.1` | 34.7 ms | 7.58 ms | 1.28 ms | 5.45 us |
| PARI Round-4 regression #2510 | 72.4 ms | 11.8 ms | 2.53 ms | 1.377 ms |
| PARI Round-4 regression #1710 | 114.6 ms | 12.8 ms | 9.22 ms | 1.449 ms |

Thus the public Sage.js path is currently about 12--65 times slower than
`nfinit`, and the local-order algorithm is about 53--79 times slower than
`nfbasis` on the two nontrivial Round-4 regressions. Ratios against the
microsecond cases mostly measure object and boundary overhead, so both absolute
and relative targets are required below.

### The first catastrophic case

Let `theta^n = 2`, set `beta = theta + c*theta^2`, and let `T` be the minimal
polynomial of `beta`. In GP this reproducible family is:

```gp
T = minpoly(Mod(c*x^2 + x, x^n - 2), y);
nfbasis(T);
```

For `n = 8`, `c = 2^32`, PARI computes the integral basis in about 5 ms.
Current Sage.js does not finish in 60 seconds. Computing the defining
discriminant takes Sage.js only about 0.05 seconds, but eagerly factoring that
discriminant does not finish in 30 seconds.

This is the first priority: `NumberField.maximal_order()` currently fully
factors the equation-order discriminant before doing local order work. Modern
PARI uses lazy discriminant factorization, pairwise-coprime composite
components, and dynamic splitting when a modular operation exposes a zero
divisor. Optimizing Round 2 alone cannot fix this example.

## Scope and non-goals

In scope:

- monic integral defining polynomials and Sage's existing normalization of
  rational defining polynomials;
- arbitrary degree and arbitrary-size coefficients, subject to available
  memory;
- arbitrary-size bad primes, not only machine-word primes;
- certified global maximal orders and local `p`-maximal orders;
- canonical triangular/HNF bases compatible with Sage's number-field element
  representation;
- Linux x64/arm64, macOS arm64, and native Windows x64;
- a correct dynamic implementation when native acceleration is unavailable.

Not initially in scope:

- relative number fields;
- orders over general Dedekind domains;
- class groups, units, or prime-ideal decomposition except for reusable local
  data naturally produced by the maximal-order algorithm;
- reproducing PARI's internal basis byte-for-byte when a different canonical
  Sage-compatible HNF basis spans the same order;
- timing cached second calls as evidence of algorithmic performance.

## Performance contracts

Every performance report must record the Sage.js commit, PARI and Sage
versions, CPU model, operating system, Node version, native artifact hash,
warmup policy, sample count, and exact polynomial/certificate digest.

Measure three boundaries separately:

1. **Local/native kernel:** canonical integral `fmpz_poly` plus local factor
   information to an HNF integral basis. Compare with PARI `nfbasis` or
   `nfbasis([T, listP])`.
2. **Warm public operation:** `maximal_order()` on a fresh, already constructed
   Sage.js number field. Compare with the analogous Sage call and report direct
   PARI `nfinit` alongside it.
3. **Cold application operation:** process startup, lazy package/addon loading,
   field construction, maximal order, and basis materialization. Report this
   separately; it must never be substituted for a kernel comparison.

Final parity gates:

- for PARI kernel cases taking at least 1 ms, the geometric mean of the
  Sage.js/PARI median-time ratios is at most 1.25, and no standard corpus case
  exceeds 2 without a documented algorithm-selection issue;
- for PARI microcases below 1 ms, Sage.js native time is at most 0.25 ms and
  warm public time is at most 2 ms; absolute budgets replace meaningless large
  ratios;
- for the scalable stress cases where PARI takes at least 1 second, Sage.js is
  no slower than PARI on the same host and input;
- warm `maximal_order()` is no slower than Sage's wrapper over the complete
  standard corpus;
- no optimization may weaken certification or make a supported platform use an
  untested native-only path.

These are completion gates, not promises that every intermediate phase meets
the final target.

## Durable benchmark and regression corpus

### Standard exact corpus

Keep and expand the existing cases:

- the motivating `x^7 - 2*x + 3` field;
- Sage's essential-discriminant example;
- LMFDB fields with nontrivial defining-order index;
- PARI regressions #1710, #1735, #2011, #2178, and #2510;
- all polynomials in PARI's `src/test/in/round4`, with expected results frozen
  into PARI-free fixtures;
- Sage number-field tests whose expected basis or field discriminant is known.

For each case store the defining polynomial, degree, coefficient height,
polynomial discriminant, field discriminant, equation-order index, relevant
local factors, canonical basis digest, provenance, and expected certification
status. Large fixtures should use Sage.js's deterministic mathematical
serialization and content hashes rather than enormous source literals.

### Scalable hard families

Add parameterized benchmarks that separate degree, coefficient height,
`p`-index, wild ramification, and number of bad primes.

1. **Bad primitive generators of pure fields**

   ```text
   theta^n = 2
   beta = theta + c*theta^2
   T(n,c) = minpoly(beta)
   ```

   Measured PARI examples for `c = 1009` are approximately 2.00 s at degree 96,
   4.19 s at degree 112, 7.87 s at degree 128, 12.57 s at degree 144, and
   20.49 s at degree 160.

2. **Fixed-degree, increasing local depth**

   ```text
   T(k) = minpoly(theta + 2^k*theta^2), theta^32 = 2
   ```

   Measured PARI examples are approximately 0.615 s for `k = 128`, 3.84 s for
   `k = 512`, and 20.76 s for `k = 2048`.

3. **Wild small-prime families** — fields with deep 2-adic and 3-adic types,
   repeated factors modulo `p`, and controlled higher Newton polygons.

4. **Many-prime families** — equation-order indices supported at many coprime
   primes, used to measure local parallelism and CRT merging.

5. **Large-prime families** — include the existing Sage-derived cubic with
   primes above `2^64`, then scale coefficient height and local index.

6. **Equivalent-generator fuzzing** — start from fields with a known maximal
   order, replace the generator by an integral polynomial in the old generator,
   and retain cases covering a matrix of degrees, indices, and local splitting
   types.

Small representatives belong in ordinary regression tests. Multi-second cases
belong in an opt-in benchmark/stress tier so normal development remains fast.

## Work packages

### P0 — Reproducible oracle and profiler

Build one benchmark driver that can execute the same manifest through Sage.js,
Sage, direct GP/PARI, the Python fallback, and each native implementation.

The driver must:

- distinguish `nfbasis`, `nfinit`, field construction, lazy loading,
  discriminant computation, factor discovery, each local prime, basis merge,
  certification, and public-object materialization;
- verify every result before recording a timing;
- use warmups and robust medians, retain raw samples, and reject cached order
  objects;
- allow local-prime-only runs with supplied factor information;
- record peak resident memory and basis size for high-degree cases;
- produce a checked summary and a machine-readable JSON artifact.

Add low-overhead trace points around the Sage.js stages. Tracing must be off by
default and must not alter algorithm selection or arithmetic.

Acceptance:

- one command reproduces the baseline table;
- the degree-8 bad-generator case clearly attributes time to discriminant
  factor discovery versus local order computation;
- a result with a wrong basis, index, or discriminant cannot enter benchmark
  output.

### P1 — Lazy discriminant decomposition and certification

Remove the unconditional `factor(abs(discriminant))` from the public path.
Replace it with a certified decomposition that can carry pairwise-coprime
composite components without claiming they are prime.

Implement in ordinary Python first, backed by batched FLINT primitives:

- cheap small-prime extraction and perfect-power detection;
- squarefree/coprime decomposition of integer components using gcds;
- factor hints obtained during subresultant/discriminant and Dedekind work;
- explicit states for proven prime, probable prime awaiting proof, composite,
  and unresolved coprime component;
- dynamic splitting when inversion modulo a composite fails or a polynomial
  gcd exposes a nontrivial integer gcd;
- deterministic restart of only the affected local branch;
- final primality/local-maximality certification sufficient to prove the
  global result.

An unresolved composite must never be silently treated as a prime. The
algorithm either proves the returned order maximal, continues splitting, or
raises an explicit resource/certification error.

Expose internal equivalents of PARI's useful distinctions:

- full certified maximal order;
- an order maximal at an explicitly supplied set of primes/components;
- a certificate/check operation for a conditionally constructed order.

The initial public `maximal_order()` API need not grow new options until the
internal contracts are stable.

Acceptance:

- the degree-8 `T(8, 2^32)` case no longer invokes complete integer
  factorization before local work;
- adversarial composite components split correctly and deterministically;
- prime, semiprime, prime-power, and pseudoprime differential tests pass;
- the existing arbitrary-large-prime regression remains exact;
- every returned global order carries sufficient evidence for an independent
  checker.

### P2 — Direct polynomial-to-basis native boundary

The current native boundary accepts an `n^3` multiplication table built through
Python objects. Replace the hot path with a host-neutral resource API whose
input is the normalized integral defining polynomial and whose output is a
compact canonical order basis.

Use an order representation of the form:

```text
integer HNF numerator matrix / positive common denominator
```

Keep numerator, denominator, determinant/index, and discriminant updates in
integer arithmetic. Avoid `fmpq` entry canonicalization and full rational
matrix inversion inside iterative local steps.

The native operation should batch:

- polynomial discriminant and factor-hint extraction;
- factorization modulo `p` and Dedekind's criterion;
- local maximal-order computation for all supplied components;
- HNF/triangular normalization and final basis transfer.

Multiplication tables remain available for the dynamic oracle and Round-2
fallback but are constructed natively only when selected. Do not send an
`n^3` table across JavaScript.

The mathematical orchestration remains ordinary CPython-parseable Python.
Use source-transparent `@native` compilation where its typed polynomial,
matrix, and finite-field representations suffice. Any handwritten C required
for FLINT storage or a measured compiler limitation must update the native-code
classification and audit.

Acceptance:

- one host crossing from canonical polynomial storage to canonical basis
  storage on the ordinary native path;
- exact differential agreement among dynamic Python, native Sage.js, Sage,
  and PARI on the standard corpus;
- no machine-word restriction on primes;
- native Windows either passes the same path or uses a capability-tested
  correct dynamic fallback;
- current six-case warm public timings improve by at least a factor of four
  before starting the Round-4 port.

### P3 — Modified Round-4 local maximal orders

Port the local modified Round-4 algorithm used by PARI, with attribution and
PARI retained only as an oracle. Reuse FLINT for integer and finite-field
polynomials, factorization, Hensel lifting, resultants, matrices, and HNF.

Implement and test the algorithm as explicit mathematical stages:

1. factor the defining polynomial modulo the local component;
2. use Dedekind's criterion for immediate maximality;
3. decompose the local algebra and refine factors at the precision implied by
   the local discriminant valuation;
4. compute and improve local integral elements without one Round-2 iteration
   per index layer;
5. assemble the local basis in triangular/HNF form;
6. return local index/discriminant evidence to the global certifier.

Port intermediate invariants, not PARI's `GEN` representation or stack
allocator. Differential trace fixtures should compare factor degrees,
discriminant valuations, required precisions, denominator valuations, and
local indices at stable stage boundaries.

Retain Round 2 as:

- the readable correctness oracle;
- a fallback when Round 4 encounters an unsupported representation;
- a selectable fast path for measured tiny degree/index cases where it wins.

Acceptance:

- every imported PARI Round-4 regression passes with exact field
  discriminant and equivalent HNF order;
- randomized low-degree local computations agree with both Round 2 and PARI;
- `T(8, 2^32)` completes within 25 ms on the baseline host;
- the two existing PARI hard regressions are within 2 times direct PARI
  `nfbasis` at the native-kernel boundary;
- sanitizer, leak, strict Python, architecture, and Windows checks pass.

### P4 — Fast OM plus MaxMin

Round 4 is the near-term parity path. The route to outperforming PARI on
high-degree/deep-index fields is a modern Ore--MacLane/Okutsu--Montes
implementation with quotient bases and MaxMin triangularization.

Represent an OM type explicitly with:

- key polynomials/representatives `phi_i`;
- MacLane valuations;
- Newton-polygon slopes and index contributions;
- residual fields and residual polynomials;
- ramification/residue degrees and completeness state;
- the precision certificate for the associated local factor.

For each relevant prime/component:

1. build the type tree from the factorization modulo `p`;
2. compute truncated `phi`-adic expansions and lower Newton polygons;
3. factor residual polynomials over FLINT `fq_nmod` or `fq` contexts;
4. refine representatives only to the precision needed for correctness;
5. retain quotient polynomials created during the expansions;
6. construct local integral elements from products of quotients and certified
   denominator valuations;
7. apply MaxMin to obtain a triangular `p`-integral basis;
8. verify the local index and merge it into the global order.

The primary algorithm and data structures belong in strict ordinary Python.
Performance-critical polynomial loops should be source-transparently compiled;
FLINT resource operations should be declared through the FFI. Add handwritten
native primitives only for genuinely missing packed operations, with measured
evidence and the required architecture exception.

Use these mathematical references:

- Ford and Letard, *Implementing the Round Four maximal order algorithm*
  (1994), <https://eudml.org/doc/247534>;
- Guàrdia, Montes, and Nart, *Higher Newton polygons and integral bases*,
  <https://arxiv.org/abs/0902.3428>;
- Poteaux and Weimann, *Fast computation of integral bases*,
  <https://arxiv.org/abs/2405.13577>;
- current PARI `base2.c` and its Round-4 regression suite as GPL-compatible
  implementation evidence and an offline differential oracle.

Acceptance:

- the OM trace and local-index certificate are independently inspectable;
- Round 4, OM/MaxMin, and PARI agree on all overlapping standard cases;
- the degree 96--160 and fixed-degree/deep-index families meet the final
  stress-case parity gate;
- the selector uses measured degree, local discriminant valuation, factor
  pattern, and expected output size rather than polynomial names;
- removing or disabling OM leaves the correct Round-2/Round-4 fallbacks.

### P5 — Parallel local work and final integration

Distinct local components are mathematically independent until basis merging.
Run them concurrently when the benchmark predicts a win.

- use the existing Sage.js worker/parallel-computing serialization contracts;
- send canonical polynomial storage plus one immutable local component;
- make seeds and factor ordering deterministic;
- cancel sibling work safely after a fatal certification error;
- merge triangular local bases with CRT and integer HNF;
- avoid parallelism for tiny cases where setup dominates;
- allow a bounded worker count and record peak memory.

This phase is the primary opportunity to beat PARI on discriminants supported
at several difficult primes. It must not be used to mask a slower single-prime
algorithm.

Acceptance:

- exact equality with sequential results under randomized completion order;
- no transferred native pointer or host-specific object identity;
- measurable speedup on the many-prime corpus without regression on tiny
  cases;
- final performance contracts pass on the reference host and remain bounded
  on all supported CI platforms.

## Correctness and certificate strategy

Every global result should have enough internal evidence for a separate,
slower checker to establish:

1. the basis matrix is nonsingular, contains `1`, and contains the equation
   order;
2. all basis products have integral coordinates in the basis;
3. `disc(equation order) = index^2 * disc(returned order)`;
4. every component whose square divides the current discriminant has a local
   maximality proof;
5. composite components have either been split into certified branches or
   handled by a proof that does not assume primality;
6. the local basis merge preserves each local index and introduces no new
   denominator primes.

Tests should compare canonical HNF lattices when practical. Otherwise prove
mutual containment and equal index rather than comparing pretty-printed basis
elements.

Differential testing layers:

- dynamic Python versus compiled/native Sage.js;
- Round 2 versus Round 4 versus OM on their common feasible range;
- Sage.js versus Sage and direct PARI on frozen inputs;
- generated orders checked by independent closure/index/local-maximality code;
- randomized equivalent generators and controlled corruptions that the
  checker must reject.

## Algorithm selection policy

Use a measured, inspectable selector:

- Dedekind fast path when the equation order is immediately `p`-maximal;
- Round 2 for tiny degree and shallow local index when benchmarks show it is
  cheaper;
- Round 4 as the general parity algorithm;
- OM/MaxMin for high degree, high discriminant valuation, deep types, or large
  predicted Round-4 work;
- independent local branches in parallel only above a measured threshold.

The selector must expose a diagnostic explanation in development mode and be
covered by tests. A user should be able to force a particular available
algorithm for differential testing without changing mathematical output.

## Validation required for each phase

At minimum run:

```text
pnpm format:python
pnpm run build
pnpm test:baselib:strict
node --test test/number-fields.cjs
pnpm --dir packages/flint test
pnpm architecture:check
pnpm test:native
```

Also run the changed benchmark manifest against direct GP and `sagelite`, plus
AddressSanitizer/UndefinedBehaviorSanitizer/leak checks for new native code.
Native changes require Windows x64 and both supported Unix architectures before
the phase is complete.

## Risks and controls

- **Full factorization accidentally returns through another path.** Add a
  stress test that fails if the general integer factorizer is entered before
  local dynamic evaluation.
- **Composite treated as prime.** Carry component state in types, validate all
  modular inversions, and make certification fail closed.
- **A C port becomes the only readable algorithm.** Keep ordinary Python
  stages and the Round-2 oracle; classify and audit every native exception.
- **Basis conversion dominates microcases.** Return one compact HNF resource
  and materialize Python elements lazily.
- **Round-4 translation copies PARI representation accidents.** Port
  mathematical invariants and compare stage traces; use FLINT-native storage.
- **OM scope expands without a stopping point.** First support `ZZ[x]`, local
  primes, integral bases, and MaxMin only. Defer general local-field APIs.
- **Parallelism causes nondeterminism or excess memory.** Deterministic merge,
  bounded workers, cancellation tests, and peak-memory budgets are mandatory.
- **Benchmarks reward cached results.** Always use fresh field objects and
  report cached calls only as a separate API characteristic.

## Completion definition

This project is complete when:

- `NumberField.maximal_order()` is certified and PARI-free for every supported
  integral simple number field;
- no complete discriminant factorization is required when lazy local
  computation can certify the result;
- the standard corpus, PARI Round-4 corpus, scalable hard families, and
  randomized generator transformations all pass;
- dynamic Python, native Round 2, Round 4, and OM paths agree wherever their
  domains overlap;
- the final performance contracts are met with reproducible artifacts;
- all native boundaries are host-neutral, audited, leak-free, and supported on
  Windows x64, Linux x64/arm64, and macOS arm64;
- public documentation explains exactness, caching, algorithm diagnostics, and
  local/certification options that were ultimately exposed;
- each coherent phase is committed and pushed with its benchmark evidence and
  architectural decisions.
