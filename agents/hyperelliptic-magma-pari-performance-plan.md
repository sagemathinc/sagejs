# Competitive hyperelliptic performance against Magma and PARI

## Status

Implemented and measured on 2026-08-23.

The program is integrated as ordinary CPython source, source-transparent
native kernels, and audited FLINT/Arb representation boundaries. The frozen
Phase-0 corpus and the final Linux acceptance corpus both retain every
unsupported or unavailable cell, and exact cross-backend digests are checked
before timings are accepted. The machine-readable final receipt is
`bench/hyperelliptic/competitive/receipt-linux-x64.json`; the rendered table is
`bench/hyperelliptic/competitive/REPORT-linux-x64.md`.

The outcome is intentionally workload-specific:

The literal phase-by-phase exit-criterion review is maintained in
`agents/hyperelliptic-magma-pari-performance-completion-audit.md`. It keeps
missing acceptance evidence and partially closed phases separate from the
broader implementation status summarized below.

| Gate | Final result |
|---|---|
| Packed Cantor boundary versus identical standalone core | PASS: genus 2 1.049x, genus 3 1.048x overhead (limit 1.15x) |
| Finite-field arithmetic versus Magma | MIXED: retained prepared add/double/scalar is 1.36x--1.54x in genus 2 and faster in genus 3; ordinary public add/double is 2.15x--4.60x and remains open |
| Packed local factors through `10^5` | PASS: 1.741 s median, 96.8 MB RSS, frozen exact digest unchanged |
| Public local-factor materialization through `10^5` | PASS: coefficient streaming 1.56x and public polynomial materialization 1.77x packed traversal; exact digests unchanged |
| Rational 1024-by-32 many-prime reduction and witness | PASS: 98.54 ms versus Magma 140 ms, 1.42x faster |
| Public rational addition | MIXED: growing-coefficient row 1.97x Magma (pass); small row 7.81x (open) |
| Genus-2/3 periods | PASS: 1.73x and 1.47x PARI |
| Genus-2 Abel--Jacobi 12-point batch | PASS: 9.35x faster than Magma |
| Genus-2 fresh `L`-function initialization | PASS: 1.64x PARI after a separately reported 2.20 s cold universal-table build |
| Certified genus-2 height, accuracy-matched 64-bit single point | PASS: 1.92x cold and 1.45x warm Magma |
| Authenticated rank-2/rank-4 height reuse | PASS; object-cold construction remains 17.1x/12.4x Magma and is open |
| Genus-3 order-32 structure/map | Resident object-cold and warm gates pass; a truly process-cold map remains open |
| Certified genus-3 stream through `10^5` | PASS: 142.18 s, 338,968 KiB RSS, 5.50x speedup, and the frozen exact digest under the documented 256 MiB V8 old-space envelope |
| Genus-3 radius-6 canonical height | PASS: 55.80 s process-cold versus 406.50 s for the same-host historical direct-theta path, a 7.29x speedup; exact finite replay and refinement stability pass, while rigor remains explicitly false |

Windows x64, Linux ARM64, and macOS ARM64 native receipts agree on exact
local-factor, Kummer, Cantor, scalar, and progression digests. Their
authenticated Wasm receipts keep portable overhead, capability failures,
cancellation, and recovery visible rather than importing Linux competitor
timings. Linux ARM64's raw fixed Cantor boundary is 1.043x/1.036x the identical
genus-2/genus-3 standalone core. Windows has no supported POSIX standalone
contract, and macOS records the GNU/ELF-only standalone linker harness as
unavailable rather than inventing a ratio.

The recommended first implementation project is **native public Cantor and
Kummer arithmetic for genus 2 and 3**.  This is the highest-fan-out performance
work presently available: it accelerates ordinary divisor operations, element
orders, group structures and maps, genus-3 local-factor certification,
rational torsion and saturation, and height calculations without changing
their mathematical contracts.

This document is deliberately broader than that first project.  It defines a
measured program for making Sage.js competitive with Magma and PARI across the
hyperelliptic functionality that those systems actually provide.  It does not
claim that one system can be declared globally faster from a single benchmark.

## Executive decision

Work in the following order:

1. build a reproducible cross-system benchmark and exact oracle corpus;
2. introduce one prepared packed Jacobian context and source-transparent
   native Cantor kernels for genus 2 and 3 over odd prime fields;
3. add a genus-2 Kummer duplication and scalar path, with full-divisor recovery
   only where the consumer needs signs or Mumford representatives;
4. route all high-volume consumers through batched kernels rather than making
   one host crossing per group operation;
5. remove the already measured public local-factor materialization overhead;
6. extend the same representations to rational arithmetic and the production
   genus-2 height algorithm;
7. optimize periods and analytic `L`-function evaluation against PARI only
   after divisor arithmetic no longer dominates their coefficient and
   certification stages;
8. enable automatic selection only from checked-in end-to-end receipts on all
   supported platforms.

The ordinary CPython-parseable implementation remains the semantic reference
and portable fallback.  Native code is not permitted to become a second,
unreadable mathematical implementation selected by an unrelated function
name.

## What “competitive” means

### Compare equal mathematical contracts

A timing is comparable only when both systems compute the same object under
the same assumptions.  In particular, record whether the operation includes:

- curve and field construction;
- point validation and canonical Mumford reduction;
- computation or prior knowledge of the Jacobian order;
- factorization of that order;
- certified generators or only invariant factors;
- construction of an explicit map or an inverse discrete logarithm;
- rigorous enclosure, refinement-stable approximation, or an ordinary real
  approximation;
- all bad Euler factors, the conductor, and the root number;
- cache construction, cache lookup, serialization, and result materialization.

Never compare Sage.js with a warmed Magma object while charging Sage.js for
process startup and coefficient generation, or compare a certified Sage.js
answer with a probable or partial answer without displaying that difference.

### Use the appropriate competitor

Magma is the principal comparison for:

- finite-field Jacobian addition, scalar multiplication, order, Sylow
  subgroups, group structure, generators, and maps;
- rational genus-2 torsion, heights, pairings, regulators, saturation, and
  Mordell--Weil computations;
- general hyperelliptic point counting and genus-3 height oracles where its
  supported model permits them.

PARI is the principal comparison for:

- `hyperellcharpoly` and `genus2charpoly`;
- `genus2red`, minimal models, and supported local arithmetic;
- `hyperellperiods`;
- `lfungenus2`, `lfuninit`, central values, derivatives, and general
  `L`-function evaluation.

The current PARI catalogue does not expose a directly comparable generic
hyperelliptic-Jacobian group-law and certified group-structure interface.
Mark those cells **not applicable** rather than treating the absence of an API
as a Sage.js performance win.  SageMath remains a valuable open-source
behavioral and algorithmic baseline, especially for Cantor arithmetic and
generic finite-abelian-group construction.

### Required timing modes

Every benchmark reports:

- **process cold:** executable startup through first answer;
- **object cold:** resident process, new curve/prepared context, first answer;
- **warm:** resident process and prepared context, no result cache hit;
- **cache hit:** separately labeled and never substituted for warm arithmetic;
- **batch:** total time and time per item for a fixed exact batch;
- median, minimum, maximum, median absolute deviation, CPU time, and peak RSS;
- operation counts and allocation counts where Sage.js can expose them.

Each receipt pins commit, source hashes, CPU, operating system, compiler, Node,
native profile, Magma version, PARI version, precision, algorithm options,
warmup count, repetition count, and exact result digest.

### Available performance hosts

Use the following named machines rather than anonymous or incidental hosts:

| SSH target | Architecture and operating system | Role |
|---|---|---|
| `ssh bench-1` | x86-64 Linux | Primary quiet acceptance host; the only host with Magma; run Sage.js/Magma and any available PARI/SageMath comparisons here. |
| `ssh bench-arm` | aarch64 Linux | Native ARM64 correctness, standalone-core overhead, memory, and architecture-specific performance. |
| `ssh m1` | Apple Silicon macOS | Native macOS ARM64 correctness, performance, packaging, and optional Metal/WebGPU work. |
| `ssh windows` | Windows Server | Native Windows x64 correctness, performance, packaging, worker, and cancellation behavior. |

Magma performance comparisons are therefore made **only on `bench-1`**.  Do
not copy its Magma timing into an ARM, macOS, or Windows table, and do not mark
the missing competitor executable as a Sage.js win.  On `bench-arm`, `m1`, and
`windows`, compare Sage.js with its same-source standalone core, its previous
per-host receipt, and Wasm where available.  Record PARI or SageMath comparison
rows only on machines where the exact pinned executable is actually present.

Absolute timings across different architectures are descriptive, not direct
speed ratios.  Architecture gates compare each host with its own committed
baseline and require exact cross-host output digests.

### Performance gates

The program has three levels of success:

1. **No accidental overhead:** a packed Sage.js boundary is within 15% of the
   same standalone native core.
2. **Competitive:** Sage.js is within 2x of the appropriate Magma or PARI
   resident-process median on the main supported corpus, with no unexplained
   case slower by more than 3x.
3. **Batch-leading:** Sage.js is faster on at least one important research
   batch because preparation, streaming, multicore scheduling, or bounded
   materialization is reused more effectively.

These are workload-specific gates, not universal marketing claims.  A failure
must name the dominant stage and remain visible in the benchmark report.
The Magma-relative portions of these gates refer to `bench-1`; the
cross-platform gates refer to each named host's own Sage.js/standalone
baseline.

## Current evidence and the actual gaps

The following are measured Sage.js facts, not Magma/PARI comparisons.

| Area | Current evidence | Consequence |
|---|---|---|
| Genus-2 local factors | The packed smalljac stream through `10^5` takes 1.765 seconds and is only 1.95% above the standalone C median. | The backend/boundary is already strong. |
| Public genus-2 local factors | Materializing the same `10^5` stream as thousands of independent public polynomial resources takes 103.678 seconds. | Public construction is about 59x the packed traversal and is a high-priority representation problem. |
| Genus-3 local factors | Through `10^5`, raw rforest takes 5.83 seconds, candidate completion 108.3 seconds, certification 881.6 seconds, and the public stream 958.7 seconds. | Exact certification, driven heavily by Jacobian operations, dominates. |
| Cyclic genus-3 structure | Once the exact order is known, the `GF(13)` and `GF(19)` examples take 0.091 and 0.048 seconds. | Cheap deductions and the bounded native scalar kernel already work well. |
| Noncyclic genus-3 structure | The order-32 rank-three fixture takes 3.465 seconds for structure and 8.103 seconds for the explicit map. | Primary-basis and repeated public group operations remain expensive. |
| Public divisor API | Addition always uses generic polynomial Cantor arithmetic.  Native acceleration is currently a bounded genus-3 prime-field scalar/sum/order adapter. | The most reused primitive is not yet generally native. |
| Genus-2 heights | Exact Flynn Kummer duplication and factorization-free finite corrections exist, but repeated exact coordinates grow rapidly and are guarded by a bit budget. | A modular/local Kummer production loop is still needed for high precision and large batches. |
| Periods and `L`-functions | Exact oracle fixtures and specialized engines exist, but there is no single current cross-system receipt covering cold preparation, warm values, derivatives, and caches. | Establish PARI/Magma baselines before claiming parity. |

The checked-in sources of the first five rows are:

- `bench/hyperelliptic/smalljac-benchmark-linux-x64.json`;
- `bench/results/hyperelliptic-genus3-auto-100k-2026-08-19.json`;
- `bench/results/hyperelliptic-jacobian-group-structure-linux-x64-2026-08-19.json`.

## Benchmark corpus and workload matrix

Create `bench/hyperelliptic/competitive/` with one versioned case file and
resident-process drivers for Sage.js, Magma, PARI/GP, and SageMath.  Runtime
tests consume only committed exact fixtures; external systems remain offline
development oracles.

### Model families

Include genus-2 quintics and sextics and genus-3 septics and octics with:

- `h=0` and generalized `h!=0` models;
- odd and even degree;
- ordinary, intermediate `p`-rank, and supersingular reductions;
- generic, split, CM, and product/isogenous examples;
- additions requiring the coprime fast branch, doubling branch, shared-
  support branch, conjugate cancellation, and multi-step reduction;
- divisor degrees `0` through `g`;
- small fields for exhaustive checking and 31-, 52-, and accepted 61/62-bit
  primes for native throughput;
- rational coefficients with small, medium, and deliberately growing
  numerator/denominator sizes;
- good, semistable, almost-good, and explicitly unsupported bad reductions.

Every row stores canonical input data and the exact expected result.  Timing
output never serves as the correctness oracle.

### A. Finite-field Jacobian arithmetic

Measure separately:

1. construct and validate one Mumford divisor;
2. negate;
3. generic addition;
4. doubling;
5. a collision/shared-factor addition;
6. 64-, 256-, and 1024-bit scalar multiplication;
7. 1,000 additions in one prepared batch;
8. 1,000 independent scalar multiplications in one batch;
9. factor-and-strip element order from a known factored multiple;
10. random covering divisor generation;
11. forward invariant-coordinate map;
12. bounded inverse coordinate/discrete-log query.

Report both full Mumford results and Kummer-only results where the latter are a
valid contract.  Do not compare Kummer pseudo-arithmetic with a competitor's
full signed Jacobian result.

### B. Jacobian order and group structure

For each fixture, separate:

- local polynomial/order computation;
- order factorization;
- sampling;
- element orders;
- primary basis and vector DLP;
- final verification;
- explicit map construction;
- one inverse-coordinate query.

Include the existing cyclic `GF(13)`/`GF(19)` cases, the rank-three order-32
case, rank-two groups, repeated odd-primary factors, and groups with one large
prime factor.  Complete enumeration remains only a small-case oracle.

### C. Local-factor streams

Measure:

- one prime at small, medium, and large characteristic;
- all good primes through `10^4`, `10^5`, and `10^6`;
- packed backend rows;
- lazy public records;
- materialized public polynomials;
- coefficient-only and full-certificate streams;
- JSONL serialization with and without certificates;
- stopped and resumed streams.

For genus 3 report rforest, candidate completion, primary certification, twist
certification, fallback rows, and result construction independently.

### D. Rational Jacobian arithmetic and heights

Measure:

- addition, doubling, and scalar multiplication at increasing coefficient
  heights;
- reduction modulo a batch of good primes;
- rational torsion bound and supplied-generator certification;
- exact division searches used by saturation;
- one canonical height at 64, 128, and 256 requested bits;
- a rank-2 pairing matrix and regulator;
- cold and reused `HeightContext` calculations;
- finite local correction, archimedean correction, and determinant assembly
  separately;
- genus-3 finite intersection planning, Abel--Jacobi integration, theta
  evaluation, and final Faltings--Hriljac assembly separately.

Accuracy and normalization must match the Magma oracle, not merely the number
of requested decimal digits.

### E. Periods and analytic `L`-functions

Measure:

- roots/topology and period-plan construction;
- model and supplied-Neron real periods at 64, 128, and 256 bits;
- one Abel--Jacobi integral and a batch sharing the period plan;
- coefficient prefixes through `10^4`, `10^5`, and the actual analytic
  cutoff;
- cold `LFunctionInit` construction;
- warm central value, analytic rank, and derivative orders 0 through 4;
- a five-point complex grid from one prepared object;
- 100 repeated central values;
- a checkpointed quadratic-twist family batch.

Compare periods and `L`-functions primarily with PARI and use Magma as an
independent value/normalization oracle where available.

### F. Bad-prime and global arithmetic

Measure per curve and per bad prime:

- integral/completed-model normalization;
- discriminant and bad-prime discovery;
- cluster construction;
- conductor exponent and Euler factor;
- local root number;
- component lattice and Tamagawa number;
- global conductor/root-number assembly;
- certificate generation, verification, and serialization.

These workloads may be latency rather than throughput problems.  Do not add a
native kernel unless profiles show repeated exact polynomial, valuation, or
lattice work dominates.

## Target architecture

### One prepared Jacobian context

Introduce an internal immutable context containing:

- genus and model kind;
- field characteristic/modulus and checked arithmetic limits;
- fixed-length `f` and `h` coefficients;
- precomputed modular reduction constants;
- optional completed-square coefficients in odd characteristic;
- selected Cantor/Kummer algorithm and capability reason;
- exact curve/model fingerprint;
- resource budget and cancellation handle.

Construct it once per Jacobian/backend and reuse it across operations.  A
batch crosses the host/native boundary once.  The native loop receives packed
divisors and returns packed canonical divisors plus per-item statuses; it does
not construct public polynomial objects internally.

### Packed prime-field Mumford representation

For genus `g in {2,3}`, use fixed-capacity records:

- `deg(u)`;
- `g+1` residues for monic `u`;
- `g` residues for `v`;
- explicit identity/status metadata outside the mathematical coefficients.

Ingress verifies exact integer conversion, primality/field identity, degree,
monicity, the Mumford congruence, and fixed-width bounds.  Egress validates the
canonical reduced result before publishing it.  Hashing uses canonical packed
bytes rather than polynomial display strings.

The public divisor still presents ordinary polynomial `u,v` data.  Packed
storage is a prepared execution/serialization representation, not a second
public mathematical type.

The first packed ABI is explicitly versioned for an odd-degree model with one
distinguished rational point at infinity.  It must reject even-degree models
before packing.  Magma's canonical sextic/octic divisor representation shows
why this distinction is mathematical rather than cosmetic: a generic
even-degree class also carries an infinity/weight integer and can require
`deg(v)=g+1`.  A later even-degree ABI must therefore add that integer and a
`g+2`-slot `v` array (or use a proved explicit odd-degree isomorphism); it must
not reinterpret the odd-degree bytes.  Until then, even-degree group-law
benchmark cells are recorded as unsupported, while their local-factor,
period, and analytic cells remain in the corpus.

### Source-transparent Cantor core

Keep one ordinary typed-Python mathematical body for:

- negation;
- composition in the coprime, doubling, conjugate, and general shared-factor
  branches;
- reduction to degree at most `g`;
- exact equality and zero testing;
- left-to-right or windowed scalar multiplication;
- bounded batches.

Compile that body through `@native` into a host-independent isolated core.
For fixed small degrees, prefer stack/value arrays and scalar field arithmetic
over allocating general polynomial resources for every intermediate.  Retain
the current readable polynomial implementation as a differential oracle and
fallback.

The existing handwritten genus-3 kernel remains an oracle during migration.
It should not force the new public genus-2/3 design to duplicate handwritten
formulas.  If profiling proves that the compiler cannot express a necessary
fixed-degree primitive, treat that first as an opportunity to improve the
compiler.  Small fixed arrays, checked modular arithmetic, polynomial
division/remainder, value-record returns, and bounded-loop lowering are useful
beyond hyperelliptic curves and belong in the source-transparent toolchain
when they can be given general semantics.

For each apparent compiler gap:

1. reduce it to a small typed-Python reproducer independent of Cantor's law;
2. decide whether it is a reusable language/IR capability, a mature declared
   foreign-library operation, or a genuinely domain-specific primitive;
3. for a reusable capability, extend the compiler and add a representative
   native-kernel witness with dynamic/native/Wasm differential tests,
   inspectable IR, and emitted-core checks;
4. for a mature library operation, add a strict FFI declaration rather than a
   function-name special case;
5. use a narrow recorded architecture exception only when neither route is
   appropriate and the measured benefit justifies it.

Never teach the compiler to recognize a Cantor-function name or move the whole
group law into a host adapter merely to pass a benchmark.  A compiler
improvement and the mathematical kernel should be reviewable as separate
coherent changes.

### Genus-2 Kummer core

Add packed Cassels--Flynn Kummer coordinates and source-transparent kernels
for:

- direct duplication;
- normalization/gcd removal;
- pseudo-addition when a differential point is supplied;
- Montgomery-ladder-style scalar multiplication when only the image modulo
  sign is required;
- modular finite-height correction steps;
- batched local evaluations.

Use Kummer arithmetic for annihilation filters, order stripping, height
iterations, and searches that do not need the sign.  Recover or verify a full
Mumford divisor before returning any signed group result.  Never infer a full
Jacobian equality solely from equality on the Kummer quotient.

### Rational and arbitrary-precision representation

After prime-field kernels are stable, add a prepared `QQ` path backed by the
canonical FLINT `fmpz`/`fmpq` polynomial resources already used by Sage.js.
Keep complete Cantor operations inside one declared/resource-preserving call
where possible.  Do not export coefficients across the boundary after every
polynomial operation.

For heights, avoid constructing exponentially growing exact Kummer
coordinates when only local corrections or a certified limit are needed.
Use modular gcd/local-error algorithms plus Arb/Acb archimedean enclosures,
with exact projective iteration retained as a readable small-step oracle.

### WebAssembly and platform policy

The host-independent core must compile for:

- Linux x86-64 on `bench-1`;
- Linux arm64 on `bench-arm`;
- macOS Apple Silicon on `m1`;
- native Windows x64 on `windows`;
- WebAssembly/WASI when the required integer/field primitives are available.

Wasm uses checked copied-byte transfers and bounded chunks.  It must produce
the same canonical output digest as native.  A slower Wasm implementation may
remain explicit, but absence of a production artifact must produce a tested
capability/fallback result rather than a packaging crash.

## Implementation phases

### Phase 0 — freeze exact cross-system baselines

1. Create the common versioned corpus and runners.
2. Pin Magma, PARI/GP, and SageMath versions and source scripts.
3. Require result equality before emitting a timing row.
4. Record dynamic Sage.js, current native Sage.js, standalone native cores,
   Magma, PARI where applicable, and SageMath.
5. Check in the full Linux x64 Sage.js/Magma/PARI receipt from `bench-1` and
   Sage.js/standalone/Wasm cold/warm/batch receipts from `bench-arm`, `m1`, and
   `windows`.
6. Add a human-readable report generated from the JSON, not hand-copied
   timings.

Exit criterion: one offline command regenerates the exact results and timing
schema; unsupported competitor cells are explicit.

### Phase 1 — prepared context and packed canonical divisor ABI

1. Define fixed-capacity genus-2/3 Mumford records and batch buffers.
2. Add exact pack/unpack and curve-fingerprint checks.
3. Cache one immutable context per Jacobian/backend.
4. Replace string-based divisor hashing in performance-sensitive tables with
   canonical packed bytes while resolving collisions by exact equality.
5. Add diagnostics for pack, kernel, unpack, validation, and allocation time.
6. Differentially replay every serialized divisor through the ordinary
   implementation.

Exit criterion: pack/unpack and prepared batch overhead is below 10% of a
no-op native traversal for batches of at least 1,000 divisors.

### Phase 2 — native public Cantor addition and doubling

1. Express complete odd-characteristic generalized Cantor composition and
   reduction in ordinary typed Python.
2. Compile fixed-degree genus-2 and genus-3 kernels, reducing and classifying
   every compiler failure before considering an exception.
3. Land reusable compiler/IR/FFI improvements with independent witnesses and
   provenance tests.
4. Cover every collision/generalized-`h` branch exhaustively on small fields.
5. Add one-call `add_batch`, `double_batch`, `sum`, and mixed operation plans.
6. Make public `+`, `-`, and doubling select the native path inside the proven
   domain while retaining `algorithm="reference"` for differential work.
7. Record generated IR/core source and all-platform exact digests.

Exit criteria:

- at least 20x over the current ordinary public path for a 1,000-operation
  batch on the pinned Linux x64 host;
- packed boundary within 15% of the standalone core;
- within 2x of Magma warm medians on the main finite-field corpus;
- no accepted fixture slower by more than 3x without a named stage;
- every compiler feature introduced by the project has a non-hyperelliptic
  witness proving that it is a general source-transparent capability.

### Phase 3 — scalar multiplication and genus-2 Kummer arithmetic

1. Add windowed full-divisor scalar multiplication to the prepared Cantor
   context.
2. Implement packed genus-2 Kummer duplication and pseudo-addition.
3. Dispatch annihilation filters and order stripping through Kummer arithmetic
   when sign-free semantics suffice.
4. Add multi-scalar and progression APIs used by DLP and searches.
5. Cache fixed-base tables with explicit byte limits and curve/scalar-window
   identity.
6. Recover and verify full Mumford answers before returning signed results.

Exit criteria:

- 256-bit scalar multiplication is at least 10x faster than the current
  reference path in both genera;
- a 1,000-element batch is competitive with or faster than Magma end to end;
- Kummer/full-Jacobian differential identities pass exhaustively on small
  groups and across the oracle corpus.

### Phase 4 — high-fan-out consumers

Route these clients through prepared/batched operations:

- factor-and-strip element orders;
- primary-basis construction and vector DLP;
- `J.group_structure()` and `J.abelian_group()`;
- genus-3 Weil-polynomial primary/twist certification;
- covering sampling and `lift_u` batches;
- torsion reduction witnesses;
- saturation reduction constraints and exact-division filters.

Avoid repacking the same divisor or curve for each Sylow component.  Keep
search budgets in terms of group operations, memory, and wall/cancellation
status; a faster kernel must not make an unbounded search implicit.

The pinned genus-3 family acceptance runs with
`NODE_OPTIONS=--max-old-space-size=256`. This is a supported process resource
envelope, analogous to the explicit mathematical search budgets: it neither
changes the public API or mathematical result nor exposes or invokes garbage
collection. Receipts record both this option and the V8-reported total heap
limit, while retaining default-heap measurements as honest diagnostics.

Exit criteria:

- the existing cyclic structure timings do not regress by more than 20%;
- the order-32 rank-three structure improves by at least 10x from 3.465
  seconds and its explicit map improves by at least 10x from 8.103 seconds;
- genus-3 certification through `10^5` improves by at least 5x from 881.6
  seconds while returning the same digest;
- the complete public genus-3 stream through `10^5` finishes below 300
  seconds and 512 MiB on the pinned host under the documented 256 MiB V8
  old-space envelope, or the receipt identifies the next dominant
  non-Jacobian stage before changing the automatic envelope.

### Phase 5 — eliminate public local-factor construction overhead

1. Keep packed coefficient rows canonical through filtering and aggregation.
2. Make a local-data record lazily construct its polynomial only when the
   caller asks for that object.
3. Bulk-construct requested polynomial resources instead of making one
   foreign call/resource allocation per coefficient or row.
4. Let coefficient, Jacobian-order, statistics, Euler-product, and `L`-series
   consumers read packed integers without public polynomial construction.
5. Measure lazy iteration, full materialization, JSONL, and cache policies
   independently.

Exit criteria on the existing genus-2 through-`10^5` receipt:

- coefficient/statistics streaming is within 2x of the 1.765-second packed
  traversal;
- full public polynomial materialization is below 3x the packed traversal,
  improving from 103.678 seconds;
- memory is bounded unless the caller explicitly requests full
  materialization;
- exact stream digests are unchanged.

### Phase 6 — rational Cantor arithmetic, torsion, and saturation

1. Add prepared FLINT-backed `QQ` composition/reduction with one operation per
   boundary crossing.
2. Reuse normalized curve/model resources and rational divisor encodings.
3. Batch reduction of a Mordell--Weil basis modulo many good primes.
4. Batch factor-and-strip torsion checks and saturation constraints.
5. Profile coefficient growth and add projective/content normalization at
   measured points.
6. Preserve exact replay certificates independently of the accelerated
   search.

Exit criteria:

- ordinary rational addition is within 2x of Magma on the genus-2 corpus;
- ordinary non-torsion rational scalar multiplication is compared at matched,
  explicitly bounded exact-output coefficient budgets, reports both scalar and
  output bit lengths, and is within 2x of Magma on at least the small and
  growing-coefficient rows;
- a 256-bit scalar gate is required only over a bounded-height domain (finite
  fields, local reductions, Kummer/sign-free filters, or explicitly labelled
  torsion) and is never reported as non-torsion `QQ` growth;
- a many-prime torsion/saturation reduction batch is faster than Magma on at
  least one research-sized workload;
- all successful exact certificates verify using the reference path.

### Phase 7 — production genus-2 height engine

1. Make the factorization-free Müller--Stoll finite correction the integrated
   production path rather than a standalone diagnostic.
2. Use modular/local Kummer iteration and proven tail bounds instead of
   exponentially growing exact coordinates for the main high-precision path.
3. Build reusable archimedean tables and batch the four Kummer coordinate
   corrections.
4. Reuse height contexts across pairings and regulators without weakening
   basis/provenance binding.
5. Preserve exact small-step iteration as a differential oracle.

Exit criteria:

- canonical heights, pairings, and regulators agree with Magma at their
  demonstrated accuracy and normalization;
- cold computations are within 2x of Magma at 64, 128, and 256 bits;
- a reused rank-2/rank-4 pairing batch is faster than repeated Magma calls;
- requested accuracy, achieved accuracy, rigor, and tail bounds are reported
  honestly.

### Phase 8 — periods and genus-3 heights

1. Reuse one root/topology/cycle plan for all precision refinements.
2. Batch endpoint-regularized Arb/Acb quadrature for every differential and
   path.
3. Compile dense small-complex-matrix solves and theta lattice kernels only
   after profiles identify them as dominant.
4. Cache normalized Abel coordinates, never raw coordinates paired with a
   normalized Siegel matrix.
5. Parallelize independent theta terms deterministically with a proven tail
   planner.
6. Keep every automatic result refinement-stable/nonrigorous until a complete
   enclosure is actually proved.

Exit criteria:

- real periods are within 2x of PARI `hyperellperiods` across the genus-2/3
  corpus;
- batches of Abel--Jacobi points sharing a period plan beat separate PARI or
  Magma calls;
- the checked genus-3 Magma height fixture remains accurate while its current
  several-minute public calculation improves by at least 5x;
- auxiliary-move invariance and exact finite-place replay remain intact.

### Phase 9 — analytic `L`-functions and family scans

This phase consumes, rather than duplicates, the existing central-weight and
GPU-twist plan.

1. Reuse packed local coefficients without polynomial materialization.
2. Finish universal genus-2/3 central-weight tables and curve-specific
   prepared plans.
3. Keep coefficient generation, weight construction, dot products, and
   completed-to-raw conversion separately timed.
4. Compare resident-process `LFunctionInit`, central values, ranks, and
   derivatives with PARI `lfuninit`/`lfungenus2`.
5. Use the checkpointable multicore CPU family engine as the required
   baseline before enabling a GPU automatically.

Exit criteria:

- small-conductor genus-2 initialization is within 2x of PARI;
- warm repeated central values are at least 20x faster than fresh
  initialization;
- genus-2 central derivatives 0--4 improve at least 8x and genus-3 at least 5x
  over the old inverse-Mellin route after coefficients are warm;
- family scans preserve exact coefficient/sign data and refine all numerical
  candidates on CPU.

### Phase 10 — automatic selection, WebAssembly, and release receipts

1. Derive crossover thresholds from full public workloads, not kernel-only
   microbenchmarks.
2. Record native and Wasm exact digests on `bench-1`, `bench-arm`, `m1`, and
   `windows` from the same exact commit and corpus.
3. Run address/undefined/leak sanitizers on native resource paths.
4. Test missing artifact, cancellation, memory exhaustion, worker loss, and
   cache corruption.
5. Publish a generated performance table with clear supported envelopes and
   no unsupported competitor cells silently omitted.

Exit criterion: `algorithm="auto"` selects only paths backed by an exact
end-to-end receipt for that platform/model/range.

## Correctness gates

Performance work is accepted only after all applicable gates pass.

### Divisor arithmetic

- canonical pack/unpack round trips;
- constructor congruence and degree validation;
- identity, inverse, addition, subtraction, and doubling;
- every Cantor gcd/collision branch;
- associativity on complete tiny Jacobians and deterministic randomized larger
  cases;
- signed and huge scalar multiplication against repeated addition/reference;
- generalized `h!=0` and completed-square differential checks;
- native/dynamic/Wasm exact canonical representative equality;
- cross-curve and cross-field rejection.

### Kummer arithmetic

- `kappa(D)=kappa(-D)`;
- direct duplication equals `kappa(2D)`;
- pseudo-addition identities with exact differential points;
- projective rescaling invariance;
- sign-free filters never promoted to signed Jacobian proofs;
- genus-2 Magma height/pairing/regulator oracle agreement.

### Group structures and certificates

- invariant factors divide successively and have product `#J`;
- generator orders and independence prove the full subgroup order;
- forward maps preserve addition and scalar multiplication;
- bounded inverse maps verify returned coordinates;
- search certificates verify with the ordinary reference implementation;
- mutations, truncations, cross-model transplants, and false provider claims
  are rejected.

### Local and analytic data

- local polynomials satisfy reciprocal symmetry and exact point-count
  recurrences;
- stream digests match existing receipts;
- periods preserve symplectic/Riemann/conjugation checks and PARI values;
- central values and derivatives agree across refinements and with PARI/Magma
  fixtures;
- precision and rigor labels report demonstrated facts rather than requested
  settings.

## Benchmark implementation details

### Resident competitors

The Magma and GP runners should accept a JSON case stream on stdin, construct a
resident table of prepared objects, run warmups, then emit exact results and
timings in one machine-readable response.  Process startup is measured by an
outer runner, not accidentally included in every warm sample.

For opaque competitor algorithms, record every exposed option and do not infer
internal work from elapsed time.  If Magma or PARI changes behavior between
versions, retain both receipts instead of rewriting history.

### Noise control

- use the `bench-1` Linux x64 VM as the primary performance-acceptance host,
  connecting with `ssh bench-1`;
- immediately before a run, record at least `uptime`, `uname -a`, `lscpu`, free
  memory, CPU governor/thread settings, and the processes consuming CPU or
  memory; the normal idle preflight begins with:

  ```sh
  ssh bench-1 uptime
  # 02:10:06 up 16:06,  1 user,  load average: 0.00, 0.00, 0.00
  ```

- do not accept a primary receipt when `bench-1` has an unexplained competing
  load; store the measured load and preflight metadata in the JSON receipt;
- treat timings from the development host or another shared machine as
  diagnostic unless the plan explicitly names a separate platform acceptance
  host;
- fingerprint `bench-1` hardware and operating-system images on every run so a
  recreated or resized VM starts a new comparable series rather than silently
  replacing the old baseline;
- apply the corresponding platform-native preflight on `bench-arm`, `m1`, and
  `windows`; record Unix `uptime`/process data on the first two and PowerShell
  system, load, and process data on Windows;
- pin CPU governor and thread counts where possible;
- report rather than hide shared-host status;
- alternate system order to reduce thermal bias;
- take enough repetitions for a stable median;
- omit first-use JIT/library loading from warm rows but include it in object-
  cold rows;
- disable caches only when the compared competitor cache is also disabled;
- record all environment variables that change algorithms or threading.

### Result validation before timing acceptance

Each case has a canonical result encoder.  The harness rejects a timing sample
unless its digest matches the fixture.  Floating results use a specified
accuracy/enclosure comparison and keep the original decimal strings.  It is
not enough for two displayed decimal values to look similar.

## Public diagnostics

Every accelerated public operation should make available:

- selected algorithm/backend and capability reason;
- prepared-context cache hit/miss;
- pack, kernel, unpack, verification, and total elapsed time;
- group operations, scalar bits/windows, gcd/reduction steps, batch size;
- bytes copied, temporary/native allocations, and peak table size;
- exact fallback reason;
- cancellation/resource status;
- certificate verification status;
- native source/content hash in benchmark mode.

Diagnostics must not alter mathematical return values or make timing fields
part of deterministic certificates.

## Risks and mitigations

### Overfitting to tiny cryptographic-style prime fields

Fixed-degree prime-field arithmetic is the first high-leverage slice, not the
whole API.  Keep `QQ`, extension fields, even degree, and characteristic 2
explicit in the benchmark matrix and capability report.

### Fast formulas with incomplete exceptional cases

Cantor collision paths are easy to omit.  Begin from the complete generalized
law, exhaust every small-field pair, and add specialized coprime/doubling
formulas only as proven dispatches with the general path as oracle.

### Compiler work expanding without a reusable contract

A real compiler limitation is valuable to fix, but this project must not grow
one-off Cantor intrinsics or indefinitely delay the mathematical milestone.
Require a minimal reproducer, general typed semantics, an independent witness,
and a separately reviewable compiler change.  When the missing operation is
already mature in FLINT, prefer a declared FFI capability; when it is truly
domain-specific, use a narrow audited exception with the ordinary source as
the oracle.

### Kummer sign loss

Kummer arithmetic can prove sign-invariant facts but cannot silently replace a
signed Jacobian result.  Recover/verify a Mumford representative before public
signed output and record which proof stages used the quotient.

### Boundary speed hiding object construction

The current genus-2 local-factor receipt demonstrates this risk directly:
1.765 seconds packed versus 103.678 seconds public materialization.  Always
report backend, boundary, and public result construction separately.

### Exact rational coefficient explosion

Use content normalization, modular/local algorithms, and height bounds.  Keep
resource guards and exact fallback semantics; do not convert rational data to
floating point to win a benchmark.

### Opaque competitor changes

Pin versions, scripts, options, and exact output.  Competitive thresholds are
evaluated per receipt/version, while Sage.js correctness remains independent
of proprietary behavior.

### Parallelism distorting single-operation latency

Report single-thread latency and multicore batch throughput separately.  A
batch-leading result does not imply faster interactive addition, and a fast
single operation does not imply a scalable family scan.

### Native-only packaging success

Test from empty caches and installed packages on every supported platform.
The dynamic fallback remains correct, and unavailable native/Wasm artifacts
produce structured capability results.

## Delivery sequence

The phases should be committed as coherent milestones:

1. **Benchmark truth:** common corpus, external runners, and baseline report.
2. **Packed representation:** prepared context, canonical divisor bytes, and
   batch ABI.
3. **Cantor parity:** public native addition/doubling for genus 2/3.
4. **Kummer/scalar parity:** fast scalar, order, and batched progression paths.
5. **Consumer leverage:** group structure, genus-3 certification, torsion, and
   saturation integration.
6. **Public stream parity:** eliminate local-polynomial materialization costs.
7. **Rational/height parity:** FLINT-backed `QQ` operations and production
   Müller--Stoll height path.
8. **Analytic parity:** periods, genus-3 theta, and prepared `L`-functions.
9. **Research throughput:** multicore/GPU family engines and checkpointing.
10. **Release parity:** Wasm, Windows, cross-platform digests, generated public
    performance report.

Each milestone preserves the reference route and can ship independently if it
passes its exactness and capability gates.

## Definition of done

This performance program is complete when:

1. a versioned harness fairly compares every overlapping Sage.js, Magma, PARI,
   and SageMath workload and rejects unequal results;
2. public genus-2/3 prime-field addition, doubling, scalar multiplication, and
   batches use one prepared source-transparent native Cantor core inside its
   proven envelope;
3. genus-2 Kummer arithmetic accelerates sign-free searches and heights without
   weakening signed results;
4. group structure, maps, genus-3 certification, torsion, and saturation reuse
   packed batched operations;
5. public local-factor streaming no longer spends nearly two orders of
   magnitude constructing avoidable polynomial resources;
6. rational genus-2 arithmetic and heights meet the accuracy-matched Magma
   competitive gate;
7. periods and initialized genus-2 `L`-functions meet the PARI competitive
   gate on the pinned corpus;
8. at least one research-sized batch is faster than the appropriate competitor
   end to end, including preparation, transfers, and result construction;
9. native, dynamic, and Wasm results have identical exact digests where their
   capabilities overlap;
10. all performance envelopes, unsupported cases, resource limits, and
    nonrigorous numerical statuses are documented without extrapolation.

## References and existing Sage.js plans

Sage.js architecture and related plans:

- `ARCHITECTURE.md`;
- `agents/hyperelliptic-smalljac-genus2-3-plan.md`;
- `agents/hyperelliptic-jacobian-group-structure-plan.md`;
- `agents/hyperelliptic-nearby-roadmap.md`;
- `agents/hyperelliptic-central-weights-gpu-twists-plan.md`;
- `agents/hyperelliptic-bsd-arithmetic-plan.md`.

External interfaces and algorithmic references:

- Magma hyperelliptic-curve handbook, including finite-field group structure,
  rational torsion, heights, regulators, and saturation:
  <https://magma.maths.usyd.edu.au/magma/handbook/hyperelliptic_curves>.
- PARI/GP hyperelliptic function catalogue:
  <https://pari.math.u-bordeaux.fr/dochtml/ref/function_index.html>.
- PARI/GP `L`-function catalogue:
  <https://pari.math.u-bordeaux.fr/dochtml/ref/_L_minusfunctions.html>.
- SageMath's public Mumford/Cantor implementation:
  <https://doc.sagemath.org/html/en/reference/arithmetic_curves/sage/schemes/hyperelliptic_curves/jacobian_morphism.html>.
- David G. Cantor, *Computing in the Jacobian of a Hyperelliptic Curve*,
  Mathematics of Computation 48 (1987).
- Andrew V. Sutherland, *Structure computation and discrete logarithms in
  finite abelian p-groups*, <https://arxiv.org/abs/0809.3413>.
- Jan Steffen Müller and Michael Stoll, *Canonical Heights on Genus Two
  Jacobians*.
