# Plan for elliptic-curve analytic rank over `QQ`

## Decision

Implement analytic rank in Sage.js itself, using exact elliptic-curve
coefficients supplied by the existing `anlist` machinery and arbitrary-precision
real/ball arithmetic supplied by the native FLINT/Arb stack. Do not make PARI,
`lcalc`, `sympow`, Magma, or another executable a runtime dependency.

The first readable implementation should evaluate central derivatives directly
from the Mellin transform/approximate functional equation. The production path
should then implement the specialized damped Fourier/Molin method used by PARI's
`ellanalyticrank`, adapted to Sage.js coefficient providers and Arb error
tracking. PARI, `lcalc`, Sage, Magma, and LMFDB are oracles and comparative
baselines only.

This is a numerical computation. The public method must say **probable analytic
rank**, even when interval arithmetic proves that the reported leading
derivative is nonzero. Numerically tiny lower derivatives have not thereby been
proved to vanish. In particular, the rank-4 regression in this plan must never
be described as an unconditional proof that an elliptic curve of analytic rank
at least four exists.

The zero-sum calculation is a separate, useful early deliverable. It returns an
upper bound conditional on GRH, not the same kind of answer as
`analytic_rank()`. It must have a separate public name and documentation.

Portable smalljac/ffpoly is feasible, worthwhile, and a **high-priority parallel
lane** beginning with P0/P1. Besides its technical value, maintainers have asked
that collaboration around smalljac receive early priority because it is
strategically important to SageMath, Inc. and this funded work. It remains an
accelerator rather than a correctness prerequisite: analytic rank must work on
macOS arm64 and native Windows x64 using the current coefficient fallback even
while that port is in progress.

## Objective

Provide Sage-compatible elliptic-curve operations over `QQ`:

```python
E = EllipticCurve([2, 3, 1, 4, 50])
E.root_number()                         # 1
E.analytic_rank()                       # 2 (probable)
E.analytic_rank(leading_coefficient=True)
# (2, approximately 14.7552475203803)
E.analytic_rank_upper_bound()           # 2 in this example, conditional on GRH
```

The main result must:

- run in-process on Linux x64/arm64, macOS arm64, and native Windows x64;
- use no subprocess, bundled standalone mathematical executable, PARI runtime,
  or network/database query;
- consume exact `a_n` values produced inside Sage.js;
- use the functional-equation sign to enforce the parity of derivative orders;
- adapt precision and coefficient cutoff rather than depend on a fixed
  double-precision zero threshold;
- expose enough diagnostics to reproduce an ambiguous numerical decision;
- include a correct ordinary-Python reference path and a native accelerated
  path in accordance with `ARCHITECTURE.md`;
- agree with independent systems on a versioned corpus containing analytic
  ranks 0 through at least 4.

## Mathematical and API contract

For an elliptic curve `E/QQ` of conductor `N`, write

```text
L(E,s) = sum(a_n / n^s)
Lambda(E,s) = (sqrt(N) / (2*pi))^s Gamma(s) L(E,s)
Lambda(E,s) = w Lambda(E,2-s),  w in {-1, 1}.
```

The analytic rank is the order of vanishing of `L(E,s)` at `s=1`. The parity
forced by the functional equation is even when `w=1` and odd when `w=-1`.
The leading coefficient returned for Sage compatibility is the first nonzero
**derivative** `L^(r)(E,1)`, not the Taylor coefficient `L^(r)(E,1)/r!`.

Proposed public signature:

```python
E.analytic_rank(
    algorithm="auto",
    leading_coefficient=False,
    prec=None,
)
```

Supported algorithm names should describe implementations that Sage.js really
ships:

- `"auto"`: the production adaptive Arb implementation, with the ordinary
  implementation as the capability fallback;
- `"reference"`: the readable central-derivative implementation, intended for
  testing and diagnosis;
- `"native"`: require the native Arb implementation and raise a capability
  error if it is unavailable.

Do not accept `"pari"`, `"sympow"`, `"rubinstein"`, or `"magma"` and silently
map them to another algorithm. If compatibility requires recognizing these
names, raise a clear `NotImplementedError` explaining that Sage.js does not
ship those external systems.

The default precision should be chosen by the adaptive policy. An explicit
`prec` is a requested initial bit precision, not a claim that the resulting
rank is proved. If a future `proof` keyword is added, `proof=True` must reject
the request until a genuinely proof-producing implementation exists.

The method documentation and help text must contain, near the return-value
description rather than only in a remote caveat, language equivalent to:

> Return an integer that is probably the analytic rank. The computation uses
> arbitrary-precision numerical evaluation and a numerical vanishing test; it
> does not in general prove the order of vanishing.

When `leading_coefficient=True`, return `(rank, derivative)` as Sage does. A
diagnostic internal result should additionally retain:

- functional-equation sign and forced parity;
- precision(s) used;
- coefficient cutoff(s);
- central derivative enclosures or values through the reported rank;
- truncation/error estimates;
- stability checks performed;
- optional zero-sum upper bound and its `Delta`;
- coefficient backend/capability used.

Keep that structured result below the public API initially. Promote it later
only if a stable user-facing use case emerges.

`analytic_rank_upper_bound(Delta=...)` has a different contract: it returns a
GRH-conditional upper bound from the explicit zero-sum formula. Its docstring
must state the hypothesis, and `analytic_rank()` must not present that bound as
an unconditional certificate.

## Current Sage.js baseline

The necessary arithmetic is mostly already present:

- `src/baselib/elliptic_curves.py` implements conductor computation, `ap`,
  `aplist`, and `anlist`;
- `anlist` uses one batched `ecAnlistIntegral` native call for integral models;
- Linux x64 uses smalljac 4.1.3/ffpoly 1.2.7 to obtain prime traces over an
  interval and then applies exact Euler recurrences;
- other supported platforms use the tested direct point-count fallback;
- eclib is already compiled on every supported platform and its `CurveRed`
  implementation contains `LocalRootNumber` and `GlobalRootNumber`; these are
  not yet exposed through the Sage.js boundary;
- FLINT 3.6, including Arb/Acb, GMP, MPFR, and MPC, is already part of the
  cross-platform native dependency stack;
- the public `RealField` layer already provides arbitrary-precision real
  arithmetic, although an analytic-rank kernel should use Arb balls directly
  when it needs certified enclosures and efficient bulk operations.

For the motivating curve

```python
E = EllipticCurve([2, 3, 1, 4, 50])
```

the conductor is `1008811 = 193 * 5227`. Sage/PARI returns rank 2 and second
derivative approximately `14.7552475203803`. At 53-bit working precision, the
specialized PARI cutoff estimate is only about 6,200 coefficients, far below
the demonstrated `anlist(10^6)` workload. Coefficient generation is therefore
already fast enough to start the analytic-rank implementation. Portable
smalljac should nevertheless start early as a parallel priority; it is not
allowed to become a blocking dependency for the analytic-rank API.

### Reproducible warm baselines on 2026-08-17

The following are per-call CPU or wall-clock averages after process startup.
Each batch used fresh curve objects so a cached second call was not counted as
the algorithm. The exact benchmark harness must be committed in P0 before
these numbers are treated as regression gates.

| Curve | Expected rank | Sage 10.9/PARI median | Magma 2.18-5 |
| --- | ---: | ---: | ---: |
| `[2,3,1,4,50]` | 2 | 20.24 ms | about 2 ms |
| `[1,-1,0,-79,289]` (`234446a1`) | 4 | 9.48 ms | about 1 ms |

Sage/PARI was measured in five batches of 100 calls with a monotonic wall
clock. Magma was measured in five batches of 200 already-constructed fresh
objects; its old `Cputime` display has only millisecond resolution, so its
figures are deliberately reported as approximate. Cold process startup,
curve construction, and cache-hit timings must be reported separately.

## Implementation survey and conclusions

### PARI `ellanalyticrank`: primary production algorithm reference

Sage's default `E.analytic_rank()` calls PARI's specialized
`ellanalyticrank`, implemented in `src/basemath/ellanal.c`. The implementation
is based on Pascal Molin's 2014 method. It reduces the curve globally, computes
the root number, chooses a precision-dependent coefficient cutoff of order
`sqrt(N) * precision`, evaluates a damped coefficient grid, recovers central
derivatives by Fourier inversion, and stops at the first derivative that is
numerically separated from zero.

This is a much better implementation reference than PARI's generic `lfun`
framework for this specific problem: on the motivating conductor, the generic
path requests several times as many coefficients. The method is also compact
enough to reimplement with explicit provenance and differential tests.

Do not integrate all of PARI. It is a general CAS, its Windows support relies
on a toolchain outside Sage.js's native clang-cl contract, and its public
documentation explicitly describes `ellanalyticrank` as an
arbitrary-precision numerical zero test. Study and reimplement the specialized
algorithm using Sage.js/Arb data structures instead. Sage.js is GPL-3.0-only,
so appropriately attributed GPL-compatible code may be adapted when that is
preferable to an independent implementation.

References:

- PARI elliptic-curve documentation:
  <https://pari.math.u-bordeaux.fr/dochtml/html/Elliptic_curves.html>
- PARI source: <https://pari.math.u-bordeaux.fr/cgi-bin/gitweb.cgi?p=pari.git>
- Pascal Molin, *Intégration numérique et calculs de fonctions L*:
  <https://theses.hal.science/tel-01084099>

### `lcalc`: useful oracle, not the default embedded library

Current `lcalc` has a real C++ library (`libLfunction`), not only a command-line
program. Its generic constructor can consume normalized coefficients,
conductor factor, root sign, and gamma parameters supplied by Sage.js, so PARI
is not inherently required. It is active upstream and can compute the sample
rank correctly once enough coefficients are supplied.

It is not ready to integrate as the production answer:

- the rank routine uses fixed finite-difference offsets and a fixed `1e-5`
  center-value threshold;
- too few coefficients produce a warning and an inaccurate rank rather than a
  reliable adaptive failure;
- precision mode is selected at compile time;
- several tables and precision controls are global mutable state, so the code
  is not presently reentrant/thread-safe;
- its build/CI story does not validate native clang-cl Windows;
- embedding the roughly 15,000-line C++ library would still require a
  substantial hardening and packaging project.

Keep a pinned offline `lcalc` oracle in the benchmark harness if practical. A
future experimental backend is acceptable only after it passes native Windows
CI, becomes reentrant, and uses the same adaptive error/ambiguity policy as the
main implementation. Reaching those gates is likely more work than building
the focused Arb kernel.

Reference: <https://gitlab.com/sagemath/lcalc>

### `sympow`: reject as a dependency

Sage invokes `sympow` as a standalone executable. Sage's own packaging notes
describe it as unmaintained and difficult to maintain, and it uses generated
data plus external-style process integration. It offers no advantage over an
in-tree elliptic-curve-specific implementation for this goal.

### Dokchitser `ComputeL`: readable formula reference, not a library

Tim Dokchitser's `ComputeL` is a compact, generic PARI/GP script implementing
approximate functional equations and derivatives. It is valuable as a
mathematical/reference oracle, especially for the ordinary Python
implementation. Shipping it would require shipping a GP interpreter; porting
it is therefore a rewrite, not a library integration.

Reference: <https://arxiv.org/abs/math/0207280>

### FLINT/Arb: numerical foundation, not a complete elliptic L-function

FLINT's `acb_dirichlet` supports Dirichlet L-functions, not general GL(2)
elliptic-curve L-functions. There is no ready `arb_elliptic_curve_lfunction`
entry point. Arb nevertheless supplies exactly the portable
arbitrary-precision ball primitives needed for the in-tree implementation:
exponentials, logarithms, gamma/incomplete-gamma functions, polynomial or
power-series operations, and rigorous accumulation/error radii.

Reference: <https://flintlib.org/doc/acb_dirichlet.html>

### Magma: independent black-box oracle

Magma's `AnalyticRank` is fast on the sample corpus and organizationally
independent of PARI and Sage.js. The installed 2.18-5 executable is useful for
local differential testing and performance comparison, but its proprietary
implementation cannot be inspected or shipped and it is unavailable in normal
CI. It is always a reported oracle, never the sole correctness gate.

### Zero sums: complementary conditional upper bound

Sage's `analytic_rank_upper_bound` implements a sinc-squared explicit-formula
zero sum. It needs prime coefficients through approximately
`exp(2*pi*Delta)`, so its cost grows exponentially with `Delta`, but small
values are very effective on ordinary curves. On the motivating curve, local
Sage measurements returned the exact upper bound 2 already for `Delta=0.6`;
`Delta=2` took about 0.4 seconds. This is a strong early feature and a valuable
cross-check, but it is conditional on GRH and may return a strict upper bound.

The source in `sage/lfunctions/zero_sums.pyx`, the explicit formula it cites,
and the existing exact coefficient provider are enough to write an ordinary
Python version without an external dependency.

## Proposed architecture

```text
EllipticCurve over QQ
    |
    +-- minimal model, conductor, root number
    |
    +-- exact coefficient provider
    |      +-- smalljac interval accelerator (currently Linux x64)
    |      +-- portable exact point-count fallback
    |      `-- Euler recurrences -> exact a_n chunks
    |
    +-- ordinary central-derivative reference
    |      `-- values + explicit truncation estimates
    |
    +-- native Arb/Molin evaluator
    |      `-- ball enclosures + adaptive cutoff/precision
    |
    +-- numerical rank decision policy
    |      `-- parity + repeated stability checks + diagnostics
    |
    `-- zero-sum upper bound (separate GRH-conditional API)
```

### Mathematical layer

Create an ordinary CPython-parseable module such as
`src/lib/sagejs/elliptic_curves/analytic_rank.py`. It owns:

- coefficient cutoff selection;
- central Mellin/approximate-functional-equation formulas;
- derivative-order and root-number parity logic;
- the adaptive stability/ambiguity policy;
- the zero-sum explicit formula;
- the readable dynamic implementation;
- serializable diagnostic data passed to and from native kernels.

The module must not contain JavaScript snippets or declared magic globals. Use
`sagejs.runtime` for the explicit low-level boundary. Add the fully migrated
module to `pyrightconfig.json` and retain zero strict type errors.

### Native layer

Add a host-independent batched C boundary under `packages/flint` that accepts:

- conductor and functional-equation sign;
- a contiguous exact coefficient block or blocks;
- derivative range/parity;
- working precision and requested error target;
- algorithm parameters needed to make a run reproducible.

It returns derivative balls (midpoint plus radius, or an existing stable Arb
serialization), actual cutoff, and error/status information in one boundary
crossing. Do not issue one N-API/FFI call per coefficient or derivative.

Implement the numerical kernel with Arb/Acb already supplied by FLINT. Keep the
algorithmic parameter policy in inspectable Python unless profiling proves a
specific loop must move native. Classify every new native file in
`architecture/native-code.json`, document the mathematical provenance, and run
`pnpm architecture:check`.

### Coefficient provider

Do not require callers to materialize `anlist(10^6)` when a run needs only a
few thousand coefficients. Introduce an internal provider that can:

- request a known exact prefix;
- extend a prefix without recomputing it when precision grows;
- deliver chunks suitable for one native call;
- report which prime-trace backend was used;
- preserve the present smalljac/direct-fallback behavior;
- validate bad-prime Euler factors and isomorphic/nonminimal input handling.

The first implementation may wrap `anlist(bound)` for correctness. Streaming
and cache extension become required before final performance acceptance.

### Numerical decision policy

The default rank result may not be based on a single `abs(x) < epsilon` test.
For each parity-compatible candidate rank:

1. evaluate all relevant central derivatives at an initial precision and
   cutoff;
2. independently increase the coefficient cutoff/error target;
3. independently increase working precision;
4. require the proposed leading derivative to remain separated from zero and
   agree to the claimed digits;
5. require every lower parity-compatible derivative to shrink consistently
   with the requested error scale;
6. reject parity disagreement with the root number;
7. if a zero-sum upper bound was requested or cheaply available, reject a
   candidate above it;
8. if stability is not achieved within documented resource caps, raise a
   numerical-indeterminacy error containing the diagnostics instead of
   returning an arbitrary integer.

Ball arithmetic can certify that an enclosure excludes zero. It cannot turn an
enclosure containing zero into a proof that the exact derivative vanishes.
This distinction must be preserved in code comments, names, and docs.

## Execution plan

### P0 — Reproducible oracle and benchmark harness

Before implementation changes:

- add a machine-readable curve manifest with a-invariants, label/provenance,
  conductor, expected sign, expected probable analytic rank, and available
  leading derivatives;
- add persistent-process adapters for local Sage/PARI, `lcalc`, and Magma when
  installed, with explicit capability skips in ordinary CI;
- record versions and implementation families so Sage and PARI are not counted
  as independent votes;
- separate cold startup, curve construction, fresh-object analytic rank, cache
  hit, coefficient generation, and numerical-kernel time;
- record precision, cutoff, number of coefficients, and warning output;
- check in oracle outputs as provenance-bearing fixtures, not as opaque
  expected integers;
- include a command that reproduces each comparison without querying LMFDB at
  test time.

P0 exit gate: the two motivating curves and the rank 0--4 corpus below produce
stable, versioned Sage/PARI and Magma results; `lcalc` results are included when
its coefficient sufficiency checks pass.

### P1 — Root number and exact input audit

- expose eclib `CurveRed::GlobalRootNumber` through a narrow Sage.js native
  boundary on all supported platforms;
- implement `EllipticCurve.root_number()` over `QQ` with Sage-compatible `+1`
  or `-1` output;
- add local root number tests at good, multiplicative, additive, and especially
  `p=2,3` reduction;
- differential-test global signs against Sage/PARI and Magma across the corpus;
- audit `anlist` at every bad prime and against Sage through all coefficient
  cutoffs used later;
- define the extendable coefficient-provider interface.

P1 exit gate: signs and coefficient prefixes agree exactly on randomized and
curated curves on Linux, macOS, and Windows CI; the dynamic fallback remains
correct without smalljac.

### P1S — Early portable smalljac/ffpoly spike (parallel with P1--P3)

Start the portability track below immediately after the P0 baselines exist,
rather than waiting for the analytic-rank kernel:

- contact or coordinate with upstream before settling on public type and build
  changes, so the work has a realistic upstream path;
- isolate the genus-1 source closure used by Sage.js and commit an exact
  Linux-smalljac/direct-fallback differential corpus;
- replace the x86 inline-assembly primitives with a portable arithmetic
  abstraction and force that path on Linux x64 first;
- compile the same closure with native Windows clang-cl to expose LLP64 and C99
  issues early;
- use the maintainer-provided native Windows VM as the rapid compile/test/debug
  loop once access is available, recording its compiler, SDK, Node, CPU, and
  dependency versions with every benchmark receipt;
- bring up macOS arm64 after the fixed-width API is stable;
- publish correctness and interval-throughput results before choosing between
  an upstreamable port, a maintained focused fork, or a FLINT-backed
  compatibility layer.

P1S is deliberately time-boxed as a feasibility/build spike at first. Its exit
gate is a concrete porting inventory, a working portable arithmetic kernel on
Linux, and either a genus-1 clang-cl build or a small enumerated list of
remaining blockers. Work on P2--P5 continues in parallel if the spike uncovers
larger changes; no analytic-rank feature is allowed to become Linux-only while
waiting for it.

### P2 — GRH-conditional zero-sum upper bound

- port the mathematics of Sage's zero-sum implementation to ordinary Python;
- implement the sinc-squared test function and explicit prime sum using exact
  `a_p` values from the coefficient provider;
- compute the required prime/coefficient bound safely from `Delta` and reject
  infeasible requests before allocating;
- enforce the functional-equation parity adjustment;
- expose `analytic_rank_upper_bound(Delta=...)` with an explicit GRH warning;
- compare term-by-term diagnostics, not only the final ceiling, with Sage;
- benchmark `Delta` values from 0.5 through 2.5 and report coefficient cost.

P2 exit gate: Sage.js matches Sage's bound throughout the corpus and on the
documented close-zero regression `256944c1`; the docs never call the result an
unconditional rank.

### P3 — Ordinary central-derivative reference implementation

- derive and document the Mellin-split formula for `Lambda(E,s)` and its
  central derivatives;
- implement it in readable Python with arbitrary-precision arithmetic;
- include explicit coefficient and analytic-tail estimates;
- compute only derivative orders compatible with the root-number parity;
- translate completed-L derivatives to derivatives of `L(E,s)` correctly,
  including lower-order product terms;
- return values and diagnostics before implementing automatic rank selection;
- test exact transformation identities and convergence as precision/cutoff
  increase;
- differentially compare derivatives with PARI `ellanalyticrank`, Sage's
  `at1`/`deriv_at1` for ranks 0 and 1, Dokchitser/`lcalc`, and Magma values when
  exposed.

P3 exit gate: the reference path obtains at least 10 stable decimal digits of
the first nonzero derivative on the standard corpus through rank 4 and agrees
with every sufficiently precise oracle.

### P4 — Adaptive probable-rank API

- implement the stability policy above as a single implementation shared by
  reference and native evaluators;
- make parity, precision escalation, and cutoff escalation visible in tests;
- define and test the numerical-indeterminacy exception;
- add `EllipticCurve.analytic_rank()` and
  `leading_coefficient=True` semantics;
- add caching keyed by the curve's canonical data, algorithm, requested
  precision, and all result-affecting parameters;
- ensure a lower-precision cached result cannot satisfy a higher-precision
  request;
- add the prominent non-proof documentation contract and doctests, including
  the rank-4 caveat.

P4 exit gate: the dynamic/reference implementation is correct on all supported
platforms and passes the complete corpus without native analytic-rank code.

### P5 — Native Arb/Molin accelerator

- reproduce the specialized PARI/Molin damped-grid and Fourier-inversion
  algorithm from primary sources with line-level provenance notes where code is
  adapted;
- replace PARI scalar/reals with Arb balls and an explicit error budget;
- use one batched coefficient/evaluation boundary;
- compare intermediate grids and derivatives with the P3 implementation;
- expose deterministic knobs for precision, cutoff, and forced reference mode;
- add adversarial tests where the initial cutoff or precision is deliberately
  inadequate and verify adaptive recovery;
- inspect and retain generated IR/target code where Sage.js native compilation
  is used;
- classify the native source and run the architecture checks.

P5 exit gate: native and reference results agree within their stated errors;
Linux x64/arm64, macOS arm64, and native Windows x64 use the same mathematical
kernel; no supported platform shells out or silently loses precision.

### P6 — Corpus expansion and failure testing

- import fixed, attributed examples from LMFDB and published high-rank tables,
  storing all necessary data locally;
- cover conductors from tiny through at least `10^9`, signs `+1` and `-1`,
  ranks 0--4, and selected expected ranks 5 or higher as stress tests;
- include curves with very small nonzero leading derivative or a low-lying zero;
- include nonminimal and isomorphic models, large a-invariants, additive
  reduction at 2 and 3, and large prime conductor factors;
- compare random coefficient prefixes and all numerical results against at
  least two implementation families where possible;
- fuzz truncation, precision, and cancellation boundaries;
- verify graceful resource-limit and ambiguity failures rather than hangs or
  false ranks.

P6 exit gate: no known oracle disagreement is hidden by tolerance changes, and
every disagreement fixture records the raw values needed for diagnosis.

### P7 — Performance, packaging, and documentation

- benchmark coefficient generation separately from the analytic kernel;
- report cold and warm public API timings and cached timings separately;
- establish cutoffs from measured error/cost rather than copying PARI constants
  blindly;
- confirm the installed artifact contains no PARI, `lcalc`, `sympow`, Magma, or
  GP executable/runtime;
- validate native Windows with clang-cl and the existing vcpkg dependency path;
- run `pnpm architecture:check`, `pnpm test:baselib:strict`, relevant package
  tests, `pnpm test:changed`, Python formatting, and release artifact smoke
  tests;
- document probable rank, derivative convention, GRH-conditional upper bound,
  precision, cache behavior, and ambiguity failures in user-facing help.

P7 exit gate: all portability, semantic, numerical, performance, and packaging
contracts below hold.

## Portable smalljac/ffpoly accelerator track

### Priority rationale

This lane starts alongside the analytic-rank prerequisites, not after the main
feature ships. It has unusually high upstream and sponsor-alignment value in
addition to improving coefficient throughput across Sage.js. That justifies
early engineering and upstream coordination even though the current fallback
already makes analytic rank feasible everywhere.

Keep the product boundary explicit: organizational priority changes scheduling,
not the correctness architecture. The direct coefficient fallback remains
tested, and native Windows/macOS analytic rank cannot silently depend on a
Linux-only accelerator.

### Feasibility verdict

Yes, a portable port is feasible. The obstacle is engineering and validation,
not a missing mathematical algorithm. It should be treated as a medium-sized
native portability project with its own benchmarks and architecture review.

An audit of the shipped ffpoly 1.2.7 and smalljac 4.1.3 sources found:

- about 34,000 lines of C/headers in ffpoly and 20,000 in smalljac;
- no separate assembly source files;
- the essential x86-64 instructions are concentrated in `asm.h`,
  `ffmontgomery64.h`, and two bit-scan helpers in `cstd.h`;
- the hot operations are 64-by-64 multiplication to a 128-bit result,
  add-with-carry/subtract-with-borrow, division, and high/low-bit scans;
- ffpoly explicitly assumes 32-bit `unsigned`, 64-bit `unsigned long`, GNU C99,
  and x86 inline assembly;
- macOS arm64 preserves the LP64 width assumption but needs portable arithmetic
  primitives instead of x86 assembly;
- native Windows x64 is LLP64, so `unsigned long` is only 32 bits. Fixed-width
  type cleanup is required through APIs and data structures, not only in one
  arithmetic header;
- both libraries use global finite-field/modulus and scratch state, which must
  be made per-context or guarded before use from concurrent workers;
- the existing build compiles many genus 2/3 facilities that Sage.js does not
  need for elliptic `a_p` computation.

The likely path is:

1. identify and build the transitive genus-1-only source closure used by
   `smalljac_Lpolys`;
2. introduce explicit `uint64_t`/`int64_t` field and trace types at the internal
   and public boundaries;
3. implement a tiny portable 64-bit arithmetic layer using `__uint128_t` on
   GCC/Clang and clang-cl/MSVC-compatible carry/multiply intrinsics on Windows;
4. replace GNU bit-scan and POSIX-only utilities with compiler/platform
   abstractions;
5. preserve the current x86-64 implementation as an optional measured fast
   path, with the portable implementation as the oracle/fallback;
6. remove or encapsulate global modulus/scratch state so simultaneous jobs
   cannot corrupt one another;
7. replace the handwritten makefiles with the repository's existing
   cross-platform build integration;
8. differential-test every prime trace against the current Linux smalljac,
   Sage/PARI, and the direct point-count fallback;
9. benchmark interval throughput before deciding whether to upstream the port,
   maintain a focused fork, or replace the ffpoly layer with FLINT finite-field
   primitives.

Start with a two-platform spike: build the portable arithmetic layer on Linux
x64 while forcing the assembly path off, then compile the same genus-1 closure
with native Windows clang-cl. Use the maintainer-provided Windows VM for this
interactive loop rather than waiting on CI for each experiment. The Windows
commands and build scripts must be checked in and must run in native
PowerShell/cmd with the supported toolchain; the VM is not permission to depend
on WSL, MSYS2, or MinGW. This answers the hardest type/toolchain questions
before doing macOS performance tuning. A FLINT-backed ffpoly compatibility
layer is the fallback design if fixed-width cleanup becomes too invasive.

Once the spike works, native Windows CI is the long-term gate for every change
to the portable arithmetic layer, smalljac integration, and analytic-rank
native boundary. The VM accelerates development but never becomes an
unrecorded snowflake prerequisite.

This track is complete only when all supported platforms return the same exact
`a_p` stream, have sanitizer/concurrency coverage, and beat the existing direct
fallback by enough to justify the native maintenance burden. Until then, the
capability flag and direct fallback remain intentional product behavior.

## Standard correctness corpus

The initial manifest should contain at least:

| Label/source | a-invariants | Expected probable rank | Purpose |
| --- | --- | ---: | --- |
| `11a1` | `[0,-1,1,-10,-20]` | 0 | smallest ordinary rank-0 case |
| `37a1` | `[0,0,1,-1,0]` | 1 | sign `-1`, first derivative |
| `389a1` | `[0,1,1,-2,0]` | 2 | standard rank-2 case |
| `5077a1` | `[0,0,1,-7,6]` | 3 | odd high derivative |
| `234446a1` | `[1,-1,0,-79,289]` | 4 | user/LMFDB high-rank regression |
| user example | `[2,3,1,4,50]` | 2 | conductor `193*5227`, performance |
| `256944c1` | `[0,-1,0,-7460362000712,-7842981500851012704]` | 0 | low-lying-zero/zero-sum regression |

Verify every label and invariant against a pinned LMFDB data export before
committing the manifest. Do not fetch LMFDB during tests. LMFDB's displayed
analytic ranks are corpus expectations, not proof certificates.

Reference for the rank-4 example:
<https://www.lmfdb.org/EllipticCurve/Q/234446/a/1>.

Add ranks 5 and above only after recording the source and all oracle settings.
They are valuable stress tests for derivative growth/cancellation but should
not delay a sound rank 0--4 implementation.

## Performance contracts

Every report must record commit, CPU, OS, Node version, native artifact hash,
FLINT version, coefficient backend, oracle versions, precision, cutoff,
warmup/sample policy, and curve manifest digest.

Measure these boundaries separately:

1. exact coefficient generation for the requested cutoff;
2. central-derivative numerical kernel with coefficients already resident;
3. warm public `analytic_rank()` on a fresh constructed curve;
4. cached second call;
5. cold process startup plus curve construction and the public operation;
6. zero-sum bound, including its separately reported coefficient bound.

Initial acceptance gates, to be revised only from checked-in benchmark data:

- the native kernel is no more than twice the specialized PARI kernel's median
  on corpus cases where PARI takes at least 5 ms;
- the warm public call is no slower than Sage/PARI on the geometric mean of the
  rank 0--4 standard corpus, with no case more than four times slower without a
  recorded coefficient-backend explanation;
- the motivating rank-2 curve completes in at most 50 ms warm on the baseline
  Linux x64 host, including exact coefficient generation;
- the reference path may be slower, but must finish every rank 0--4 standard
  case within 5 seconds on the baseline host;
- macOS arm64 and Windows x64 must meet correctness gates regardless of
  smalljac availability; platform performance is reported, not hidden by
  capability skips;
- cache hits must validate cache identity and must not be included in fresh-call
  performance claims;
- resource use must scale with the requested cutoff and precision, without a
  mandatory million-coefficient allocation for ordinary conductors.

Magma is always reported when available but is not a hard performance gate:
the installed copy is old, proprietary, not available in CI, and exposes only
a coarse timer. `lcalc` is likewise an oracle and experimental comparison, not
a release dependency.

## Tests and validation

Required test layers:

- exact unit tests for conductor, root number, bad-prime factors, `a_p`, and
  `a_n` prefixes;
- formula tests for completed/uncompleted L-function derivative conversion;
- truncation/error-bound tests using deliberately short coefficient lists;
- reference/native differential tests at multiple precisions;
- oracle tests for derivative values, not just integer ranks;
- API tests for leading derivative convention, errors, caching, and unsupported
  external algorithm names;
- zero-sum term and final-bound comparisons, including parity rounding;
- native lifecycle, repeated-call, worker/concurrency, and sanitizer tests;
- Windows clang-cl build and execution tests;
- reproducible native-Windows developer commands exercised first on the
  provided VM and then enforced in long-term Windows CI;
- deterministic benchmarks with stale-result and cache-hit detection;
- help/docstring tests containing the probable/non-proof and GRH caveats.

At least one test must demonstrate that too few coefficients or too little
precision does **not** silently return the wrong rank. At least one test must
force an ambiguity and assert the diagnostic failure. Rank-4 tests must assert
the returned numerical result while also asserting that user-facing text does
not label it a proof.

## Risks and mitigations

### A very small nonzero derivative is mistaken for zero

Mitigation: independent cutoff and precision escalation, ball/error tracking,
stability across runs, optional zero-sum upper-bound comparison, explicit
ambiguity instead of an unbounded fixed threshold, and adversarial corpus
cases.

### A bad coefficient or root number produces a plausible wrong rank

Mitigation: exact prefix differentials, special reduction tests at 2 and 3,
eclib/Sage/Magma sign comparisons, parity assertions, and retaining input
diagnostics with every numerical result.

### Porting PARI constants reproduces behavior without understanding errors

Mitigation: derive the cutoff/error budget in the reference implementation,
compare intermediate quantities, document every inherited constant, and use
Arb containment rather than only floating-point agreement.

### The reference implementation becomes the slow accidental production path

Mitigation: explicit capability reporting, separate reference/native
benchmarks, a native-required test mode, and release artifact smoke tests on
all platforms.

### smalljac portability expands into an unrelated rewrite

Mitigation: genus-1-only closure, fixed arithmetic abstraction first, exact
go/no-go throughput measurements, independent task ownership, and retaining
the existing correct fallback.

### External systems appear to agree but share one implementation

Mitigation: record implementation families. Sage default and direct PARI are
one family; `lcalc`, Magma, the ordinary Sage.js formula, and the native
Sage.js kernel provide genuinely different boundaries or algorithms.

## Suggested coherent commit sequence

1. Add oracle manifest, persistent benchmark adapters, and checked-in baseline
   results.
2. Expose eclib root numbers and add exact coefficient/sign differentials.
3. In parallel, begin the portable genus-1 smalljac/ffpoly series with the
   upstream-coordination, arithmetic-abstraction, and clang-cl spike from P1S.
4. Add the ordinary zero-sum upper bound and GRH documentation.
5. Add the ordinary central-derivative evaluator and derivative oracles while
   the smalljac lane advances independently.
6. Add adaptive probable-rank policy and public API/docs.
7. Add the native Arb/Molin boundary, classification, and differential tests.
8. Add full cross-platform corpus, ambiguity, concurrency, and performance
   gates; integrate portable smalljac wherever its own gates have passed.

Each commit must keep the dynamic path correct, run the relevant focused tests,
and satisfy the architecture checks before it is pushed.

## Definition of done

This project is complete when:

- `E.analytic_rank()` and `leading_coefficient=True` work in-process on every
  supported platform;
- the rank 0--4 corpus, including `[1,-1,0,-79,289]`, agrees with independent
  oracles at the recorded precision;
- a readable ordinary implementation and a faster Arb implementation agree
  differentially;
- rank decisions adapt both coefficient cutoff and precision and fail clearly
  when ambiguous;
- `analytic_rank_upper_bound()` is available with correct GRH-conditional
  semantics;
- docs prominently say probable/numerical and never imply a general proof of
  high analytic rank;
- no standalone mathematical executable or prohibited Windows toolchain is
  shipped;
- native Windows x64, macOS arm64, and Linux CI all run the same semantic test
  suite;
- benchmark and packaging gates pass with reproducible receipts;
- smalljac portability remains optional unless and until its independent track
  meets exactness, concurrency, portability, and throughput gates.
