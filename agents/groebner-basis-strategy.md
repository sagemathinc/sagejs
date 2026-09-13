# Modern Gröbner bases in Sage.js

- Status: research and implementation strategy
- Date: 2026-08-30
- Scope: commutative polynomial ideals and modules over exact coefficient
  domains, on Linux, macOS, native Windows, Node/WASI, and browsers

Inspected source revisions: msolve `1e3af01f`, Groebner.jl `6e6c9759`,
Singular `11befc1b`, Singular-in-browser `0dbc37f0`, MathicGB `aa38a7fb`,
CoCoALib `9cb5ce48`, and OpenF4 `7155c6ec`. All build experiments were
throwaway studies outside the Sage.js worktree; no candidate source or build
artifact is added by this document.

## Executive decision

Sage.js should not write a new F4/F5 engine from scratch, and it should not
make libSingular a mandatory dependency.

The best foundation is a **proper portable port of msolve's packed F4 core**:

1. Use msolve for fast global Gröbner bases over prime fields and, after that,
   for its modular rational path.
2. Keep FLINT as the canonical polynomial/coefficient layer, small-problem
   fallback, normal-form engine, and independent exact verifier.
3. Add a lazy, optional Singular worker later for the much broader operations
   that msolve does not cover: modules and syzygies at full breadth, local
   standard bases, quotient and extension coefficient domains, resolutions,
   and noncommutative G-algebras.
4. Use Groebner.jl as an algorithm and differential-oracle reference. Do not
   ship the Julia runtime just to obtain Gröbner bases.
5. Route by an explicit mathematical capability tuple—coefficient domain,
   term order, ideal versus module, requested operation, proof mode, and
   platform—never merely by a Python function name.

This is not just a paper recommendation. A pinned msolve 0.10.1 checkout was
built and exercised during this study. Its finite-field F4 core compiled
unmodified on Linux x64, Linux ARM64, native Windows x64 with `clang-cl`, and
`wasm32-wasip1`. Its complete modular `QQ` path compiled on all those targets
after two small header portability fixes. Cyclic-5 over `QQ` returned the same
20-polynomial, 232-term full basis on native Windows and WASI. This makes a
proper port a tractable integration project, not a speculative rewrite.

## What Sage.js has today

At commit `3655646d2a8019a0d584dc4a6cd93920a2eba777`:

- `PolynomialIdeal` accepts only `QQ`.
- `groebner_basis()` calls the native FLINT addon's `mpolyGroebner`.
- The addon calls
  `fmpz_mpoly_buchberger_naive_with_limits(..., 1000, 100000, 1000000, ...)`
  and then autoreduces the result.
- The browser/WASI multivariate backend explicitly marks Gröbner bases and
  reduction unavailable.
- Ideal membership depends on the same native-only basis and reduction path.
- `GroebnerFan` is an exact but hard-coded implementation for the twisted
  cubic, not a general fan algorithm.

FLINT's own current API still calls this implementation
[`fmpz_mpoly_buchberger_naive`](https://flintlib.org/doc/fmpz_mpoly.html#c.fmpz_mpoly_buchberger_naive).
It is valuable exact code, but it is not a modern large-system engine.

## What “state of the art” means here

There is no single universally best Gröbner algorithm.

- Sparse F4-style symbolic preprocessing and matrix reduction are the main
  requirement for difficult global-order ideals.
- Rational coefficients need modular computation, reusable traces, rational
  reconstruction, and an exact certification stage to control coefficient
  growth.
- Zero-dimensional systems benefit from a fast degree-compatible basis
  followed by FGLM or related order conversion rather than direct lexicographic
  computation.
- Signature criteria (F5-family algorithms) are important for some regular or
  structured systems, but they are an additional strategy rather than a
  replacement for F4.
- Local orders, modules, syzygies, resolutions, coefficient rings, and
  noncommutative algebras require a broader standard-basis system such as
  Singular.
- Repeated systems with the same monomial support benefit greatly from
  learn/apply traces and batched coefficient arithmetic.

Consequently, “modern support” should mean an evidence-driven portfolio behind
one coherent Sage-compatible interface.

## Candidate assessment

| Candidate | Strengths | Important limits | Proposed Sage.js role |
| --- | --- | --- | --- |
| [msolve](https://github.com/algebraic-solving/msolve) | Active C F4 implementation; fast prime-field and modular-`QQ` bases; saturation, normal forms, one-block elimination, FGLM, zero-dimensional solving and real-root machinery; packed library APIs; GPL-2.0-or-later | Prime fields and `QQ`, primarily degree-reverse-lexicographic workflows; rational stopping is probabilistic; library code has process exits and global state; Windows is upstream tier 3 | Primary portable high-performance engine after a narrow hardened port |
| [FLINT](https://github.com/flintlib/flint) | Already shipped everywhere by Sage.js; excellent exact polynomial and coefficient arithmetic; small dependency cost; LGPL | Current multivariate Gröbner algorithm is explicitly naive Buchberger; Sage.js has no Wasm GB binding | Representation, reduction, verification, and bounded fallback |
| [Singular](https://github.com/Singular/Singular) | Broadest mature feature set: many fields and rings, ideals and modules, global and local orders, syzygies/resolutions, ideal operations, signature algorithms, and noncommutative support | Large and intricate C/C++ system; native Windows integration is not demonstrated in the required Sage.js toolchain; a full browser image is large | Optional lazy backend/worker for breadth, not the core dependency |
| [Groebner.jl](https://github.com/sumiya11/Groebner.jl) | Active pure-Julia F4, modular `QQ`, generic-field fallback, rich orders, change matrices, learn/apply traces, batching and threading; excellent recent design work | Julia JIT/runtime is far too large for this one facility; default is probabilistic and `certify=true` currently guarantees only homogeneous cases | Differential oracle and design source, especially for traces, orders, and certification |
| [MathicGB](https://github.com/Macaulay2/mathicgb) | Active F4 and signature bases; public streaming API; modules and flexible global matrix orders; GPL-2.0-or-later | Prime fields only; C++ plus Mathic, MemTailor and optional TBB; no Windows/Wasm CI | Secondary oracle and source for module/signature ideas |
| [CoCoALib](https://github.com/cocoa-official/CoCoALib) | Active, broad exact commutative algebra library; GPL-3.0-or-later | General basis path remains Buchberger-oriented; F5 code is experimental; another substantial C++ dependency | Correctness oracle and feature reference, not the primary fast engine |
| [Rings](https://github.com/PoslavskySV/rings) | Active Java/Scala library with F4 over finite fields, modular `ZZ`/`QQ`, Hilbert-driven order changes, and broad coefficient domains; Apache-2.0 | Requires a JVM and does not offer an attractive native-Windows/Wasm embedding boundary | Strong independent oracle and algorithm reference |
| [OpenF4](https://github.com/nauotit/openf4) | Focused C++ F4 over prime and binary extension fields; GPL-3.0 | Last upstream commit in the inspected repository was 2018; adds Givaro/FFLAS-oriented integration without covering `QQ` | Do not adopt; retain as historical comparison |
| [M4GB](https://github.com/cr-marcstevens/m4gb) | Specialized dense/overdetermined small-finite-field solver | Compile-time field/variable bounds and cryptanalytic specialization | Possible future niche backend, never the general implementation |

Two fast-looking alternatives are unsuitable for an open-source distribution:
FGb is [not open source](https://www.mathemagix.org/www/mfgb/doc/html/install_fgb.en.html),
and [GamBa](https://github.com/gblanco92/gamba) says parts remain closed and the
program cannot be built entirely from published source. GBLA is only a sparse
linear-algebra component, not a complete basis engine. Macaulay2, Oscar, and
Julia's `AlgebraicSolving.jl` remain useful external oracles; embedding their
entire runtimes is not justified.

Pure-Rust work is worth watching because Rust-to-Wasm portability is excellent.
The active [feanor-math](https://github.com/FeanorTheElf/feanor-math) implements
a generic Buchberger algorithm with F4-style linear algebra, but its own status
notes say infinite coefficient rings remain slow and much optimization is
unfinished. The smaller Rust `groebner` crates inspected did not have the
domain breadth, maturity, or evidence needed to displace msolve. Symbolica is
fast and active but source-available rather than a fully open-source core, so
it is not a vendoring candidate. These projects can still supply differential
oracles and design ideas.

## Target coverage by domain and order

The public API should distinguish these cases rather than claiming that one
generic `groebner_basis` implementation covers all polynomial parents.

| Mathematical request | First useful backend | Later/broad backend | Notes |
| --- | --- | --- | --- |
| Prime field `GF(p)`, `p < 2^31`, global degree-reverse-lexicographic ideal | msolve F4 | Singular | Highest-priority portable fast path |
| Prime field, global lex/deglex/weighted/block order | FLINT/Python for small cases; FGLM after a degree-compatible basis when applicable | Singular; study Groebner.jl order machinery | msolve must not be relabeled as supporting arbitrary orders |
| `QQ`, global degree-reverse-lexicographic ideal | modular msolve plus certificate | Singular | Highest-priority characteristic-zero fast path |
| `QQ`, zero-dimensional lex basis | msolve degree-compatible basis followed by FGLM | Singular | Expose order conversion distinctly from direct basis computation |
| Finite extension `GF(p^n)` | ordinary-Python field-generic reference, then measured `@native` specialization | Singular | OpenF4's binary-extension support is too stale and narrow to justify a backend |
| Number field or algebraic extension | ordinary-Python field-generic reference | Singular | Requires exact coefficient normalization and embeddings independent of msolve |
| Rational-function/transcendental field | ordinary-Python field-generic reference | Singular | Coefficient growth and parameter semantics need their own corpus |
| `ZZ`, `Z/nZ`, or another coefficient ring | No field-GB shortcut; implement explicit strong/standard-basis semantics | Singular or CoCoALib | Division, leading coefficients, and canonical output differ fundamentally from the field case |
| Local or mixed local/global order | None in msolve | Singular `std`/Mora-family algorithms | Return a capability error until the optional backend exists |
| Polynomial modules, syzygies, resolutions | MathicGB can be an oracle for prime fields | Singular | Do not fake module support by encoding component indices as variables |
| Noncommutative polynomial/G-algebra | Separate future API | Singular:Plural | Out of scope for the commutative msolve port |

For positive-dimensional ideals, a degree-compatible basis is still useful,
but FGLM is not a general order-change escape hatch. For rings rather than
fields, Sage.js must first specify whether it promises a weak, strong, or other
standard-basis convention and match Sage's documented semantics.

## Detailed findings

### msolve

The current inspected revision was
`1e3af01f3864f6c848814b02a450f384c108adea` (msolve 0.10.1, 2026-08-04).
The [0.10.1 release](https://msolve.lip6.fr/binaries/index.html) specifically
contains fixes for lifting Gröbner bases over `QQ`. The
[official tutorial](https://msolve.lip6.fr/downloads/msolve-tutorial.pdf)
documents prime fields with `p < 2^31` and `QQ`; prime-field bases are
deterministic by default, while rational computations use multi-modular
lifting with a probabilistic stopping criterion.

The source contains two unusually useful packed interfaces:

- `export_f4` takes lengths, coefficients, and exponent arrays for the
  finite-field F4 core.
- `export_groebner_qq` exposes the modular rational lifting path.

The full CLI/library also contains normal forms, saturation and colon paths,
FGLM, rational parametrization, and real-root isolation. Those should not all
enter the first port.

#### Experimental build evidence

The study built against Sage.js's existing GMP, FLINT, MPFR, OpenBLAS, and
pthread artifacts rather than introducing duplicate copies.

| Target | Source exercised | Result |
| --- | --- | --- |
| Linux x64, GCC 15.2 | Full msolve 0.10.1 | `make check -j16`: 64/64 tests passed |
| Linux x64 | msolve CLI | cyclic-5 `QQ`: 0.050 s fresh process; cyclic-5 `GF(1073741827)`: 0.034 s; eco-6 finite: 0.026 s; Katsura-7 `QQ`: 0.087 s |
| Native Windows x64, `clang-cl` 19.1.5 | Unmodified amalgamated `src/neogb/gb.c` | Packed `GF(65537)` example returned 3 basis polynomials / 6 terms |
| `wasm32-wasip1` | Same unmodified finite-field core | Node/WASI returned the same 3 / 6 result; unstripped executable was 481,810 bytes |
| Linux ARM64, GCC 13.3 | Same finite-field core | Returned the same 3 / 6 result |
| Native Windows x64 | Full modular-`QQ` path | cyclic-5 full basis returned 20 polynomials / 232 terms in about 110 ms including process startup |
| `wasm32-wasip1` | Full modular-`QQ` path | cyclic-5 returned 20 / 232; compile 3.18 ms, instantiate 2.08 ms, computation 17.3 ms under Node/WASI |
| Linux ARM64 | Full modular-`QQ` path | cyclic-5 returned 20 / 232; approximately 0.02 s user CPU |

The full rational WASI test executable was 861,088 bytes after stripping and
350,572 bytes after xz compression. Its unstripped 28 MB size was almost
entirely debug/custom sections. A production addon should be smaller because
Sage.js already owns the shared dependency prefix.

These timings are diagnostic, not a fair ranking: the Sage.js path includes
different initialization and representation costs, the Julia measurements
below are warm JIT measurements, and none used a controlled benchmark host.
They nevertheless establish that the algorithms are viable on every required
architecture. For context, the present Sage.js/FLINT cyclic-5 `QQ` call took
about 0.805 s wall time in the same project.

#### Porting work still required

The successful experiments do **not** mean the upstream library is safe to
drop into a Node process unchanged.

- The finite-field amalgamation compiled unchanged. The rational path needed
  only two portability changes: avoid `getopt.h` on Windows, and provide
  `ssize_t`/`SSIZE_MAX` in msolve's bundled Windows `getdelim.h`. These should
  be proposed upstream.
- Many error paths call `exit(1)`. A library adapter must convert all reachable
  exits, assertions, and diagnostics into structured status returns.
- Allocation ownership is not sufficiently obvious at the public boundary.
  The adapter needs explicit alloc/free functions and leak/failure tests.
- Upstream uses global streams and some global function pointers. The first
  supported path must either eliminate them or serialize access; worker-level
  isolation is still required for cancellation and hard memory limits.
- The experimental Windows link mixed some `/MT` and `/MD` artifacts and
  produced static-CRT/import warnings. Production CMake must use one runtime
  model consistently.
- The `QQ` result cannot be called proved merely because rational
  reconstruction stopped. Sage.js must perform exact certification.
- Upstream issue
  [#339](https://github.com/algebraic-solving/msolve/issues/339) requests a
  full characteristic-zero basis for elimination orders. The public Sage.js
  capability must not promise arbitrary orders or full elimination output
  until independently demonstrated.

### Groebner.jl and the Julia ecosystem

The inspected Groebner.jl revision was
`6e6c9759039ff674a006e5d3afff2d77363655d5` (0.10.6, 2026-07-30). It is a
serious modern implementation, not merely a wrapper. It supports optimized
prime fields and `QQ`, a generic-field fallback, lex/deglex/degrevlex,
weighted, product, and matrix orders, normal forms, change matrices,
learn/apply traces, modular rational computation, homogenization, batching,
and bounded threading. Its documentation explicitly credits msolve for F4
components.

Its [current interface documentation](https://sumiya11.github.io/Groebner.jl/interface/)
also gives an important warning: `certify=false` is probabilistic by default,
and `certify=true` guarantees correctness only for homogeneous ideals. A
Sage.js port cannot copy that default silently.

Julia 1.12.7 and Groebner.jl 0.10.6 were installed for this study. After JIT
warmup, deterministic single-thread runs, each checked with `isgroebner`, had
these medians:

- cyclic-5 `QQ`: 2.065 ms;
- cyclic-5 `GF(1073741827)`: 0.569 ms;
- Katsura-6 over the same prime field: 1.85 ms;
- Katsura-7 `QQ`: 48.687 ms.

First use cost 5.24 s for cyclic-5 `QQ` and 6.04 s for Katsura-7 `QQ`, largely
JIT/package initialization. Shipping Julia would overwhelm Sage.js's size,
startup, Windows, and browser requirements. The implementation remains highly
valuable as a source for:

- change-matrix certification;
- rich term-order modeling;
- Traverso-style learn/apply traces and batched specializations;
- generic coefficient-field fallback designs;
- differential tests against an independently written F4 implementation.

The Julia/Oscar ecosystem's `AlgebraicSolving.jl` uses msolve for solving, and
`Singular.jl` exposes Singular. This reinforces the two-tier msolve/Singular
architecture rather than arguing for embedding Julia.

### Singular and libSingular

Singular remains the correct breadth reference. Its current manual describes:

- `std`: Buchberger/Mora-family standard bases, including local orders;
- `slimgb`: a global-order strategy designed to control coefficient swell;
- `sba`: signature-based algorithms, including F5-style techniques;
- `groebner`: a heuristic selector;
- FGLM, Gröbner walks, Hilbert-driven methods, syzygies, resolutions, and a
  large collection of ideal/module operations.

It also covers coefficient domains and algebraic structures msolve does not:
finite and rational fields, algebraic and transcendental extensions, quotient
rings, limited coefficient-ring computations, modules, and
[Singular:Plural](https://www.singular.uni-kl.de/Manual/latest/sing_759.htm)
noncommutative G-algebras.

WebAssembly is possible. The official
[`Singular-in-browser`](https://github.com/Singular/Singular-in-browser)
project published a 2026-07-01 build. The inspected release contained a
23,732,876-byte `Singular.wasm`, a 23,300,931-byte data image, and about 194 KB
of JavaScript; its build requests 1 GiB initial memory, enables growth and
Asyncify, and does not use pthreads. That is compelling feasibility evidence,
but it is an executable-with-filesystem worker, not a small stable libSingular
ABI.

Therefore libSingular should be revisited after the compact msolve tier works.
The likely product is a separately downloadable/lazy worker used only when an
operation requires Singular's breadth. It must not inflate every SEA or every
browser session by roughly 47 MB of uncompressed engine data, and native
Windows must be validated with the supported Sage.js toolchain rather than
through Cygwin, MSYS2, or MinGW.

### MathicGB

The current official repository is `Macaulay2/mathicgb`, not the obsolete
historical fork. The inspected tip was
`aa38a7fb7b53ab6dd74de983c60517668054755f` (2026-08-30). Its public C++ API
supports prime characteristics through 32-bit primes, ideals and modules,
flexible global grading-matrix orders, a classic reducer, an F4 matrix
reducer, and signature bases. Upstream CI covers Linux and macOS with both
Autotools and CMake, not Windows or Wasm.

This is valuable technology, especially for signatures and modules, but it
cannot handle `QQ` directly and brings Mathic, MemTailor, and optional TBB. It
does not displace the simpler, already-portable msolve core.

## Proposed architecture

### 1. One Sage-level contract, explicit backend capabilities

Introduce a backend request described by at least:

```text
(coefficient domain, characteristic, term order, ideal-or-module,
 operation, proof mode, platform capabilities, resource policy)
```

The dispatcher should return a backend only when every part matches. Examples:

- `GF(p)`, `p < 2^31`, ideal, global degree-reverse-lexicographic basis:
  msolve F4.
- `QQ`, ideal, global degree-reverse-lexicographic basis: modular msolve plus
  exact certification.
- Small `QQ` ideal or unsupported msolve envelope: bounded FLINT Buchberger.
- Local order or a syzygy module: optional Singular worker once available.
- Browser without an installed optional Singular resource: a precise
  capability error, never a wrong related computation.

Backend choice should be inspectable in development and benchmark receipts.
Public output remains ordinary Sage.js polynomial objects, not msolve handles.

### 2. A narrow msolve source package, not a CLI wrapper

Create a package such as `packages/msolve-core` with:

- a pinned source manifest, upstream commit, hashes, license, and local patch
  inventory;
- only the required F4 and modular-`QQ` translation units;
- the existing Sage.js GMP/FLINT/MPFR prefix, with no duplicate libraries;
- a scalar, single-thread portable baseline for all platforms;
- optional native SIMD/OpenMP variants selected only by validated capability;
- one host-neutral packed C ABI using fixed-width lengths, flattened exponent
  arrays, coefficient arrays, explicit status values, and explicit ownership;
- no parser, files, CLI, locale dependence, or process-global output;
- Node N-API and Wasm adapters generated around the same C ABI;
- worker/process isolation for cancellation and hard time/memory quotas.

The finite-field core should land first because it has the smallest dependency
and correctness surface. The rational translation units follow after the
finite-field adapter, sanitizers, and cross-platform corpus are stable.

### 3. Proof and verification modes

A modern fast engine may use randomized linear algebra or probabilistic modular
stopping internally. Sage.js must distinguish exact arithmetic from a
mathematically certified result.

For an input list `F`, returned basis `G`, and change matrix `T`, a complete
independent certificate should check:

1. canonical coefficient and monomial normalization;
2. the exact identity `G = T F`, proving `G` lies in the input ideal;
3. every polynomial of `F` reduces exactly to zero by `G`, proving the reverse
   ideal inclusion;
4. every required Buchberger `S`-polynomial reduces exactly to zero by `G`;
5. reducedness/monicity when a reduced basis was requested.

Checks 3 and 4 alone are insufficient: they do not prove that an accidentally
enlarged returned ideal is contained in the input ideal. The first msolve
adapter may rely on deterministic F4 plus differential testing for
`proof=False`, but it must not advertise `proof=True` until it can export or
reconstruct the transformation provenance. Groebner.jl's
`groebner_with_change_matrix` is the clearest implementation reference.

The verifier should be ordinary strict Python where practical, accelerated by
source-transparent `@native` functions and FLINT reduction primitives. It must
not call back into the same msolve computation it is meant to check.

### 4. Representation and term orders

Use one Sage.js intermediate representation at the boundary:

- ring metadata and an explicit order matrix/block description;
- polynomial offsets;
- term exponent vectors, initially 32-bit with checked conversion;
- canonical modular coefficients or numerator/denominator arrays;
- deterministic sort and normalization rules.

Do not expose msolve's internal hash-table indices. Preserve term-order
semantics exactly and reject orders outside a backend's capability. The first
msolve phase should promise only global degree-reverse-lexicographic order.
One-block elimination and FGLM-derived lexicographic output come later as
distinct, tested capabilities.

## Delivery phases

### Phase 0: corpus and contract

- Add a backend capability protocol and inspectable dispatch metadata.
- Create a versioned oracle corpus from SageMath/Singular, msolve,
  Groebner.jl, MathicGB, and the existing FLINT path.
- Include zero/unit ideals, duplicate/zero generators, inhomogeneous systems,
  nonradical and positive-dimensional ideals, unlucky-prime rational cases,
  exponent/term limits, malformed packed inputs, and resource exhaustion.
- Record canonical reduced bases and independent membership/S-pair checks.

### Phase 1: portable prime-field F4

- Port the narrow `export_f4` computation with a hardened status-returning ABI.
- Support ideals over prime `GF(p)` with `p < 2^31`, global
  degree-reverse-lexicographic order, full reduced bases, leading ideals, and
  normal forms.
- Compile and test Linux x64, Linux ARM64, macOS ARM64, native Windows x64,
  Node/WASI, and a real browser.
- Keep a scalar baseline; optimize only after identical-result receipts.
- Differential-test every supported path against at least FLINT for small
  cases and Groebner.jl/Singular for representative larger cases.

### Phase 2: modular rational bases

- Add the minimal `export_groebner_qq` path against the shared FLINT/GMP/MPFR
  prefix.
- Export enough provenance for full certification; otherwise expose only an
  explicitly non-proof mode.
- Test unlucky primes, reconstruction thresholds, coefficient swell, and
  inhomogeneous systems aggressively.
- Make the exact certified mode the Sage-compatible default once its runtime
  envelope is known.

### Phase 3: zero-dimensional workflows

- Add FGLM/order conversion, quotient-basis metadata, dimension/degree, and
  exact univariate representations in separately declared capabilities.
- Add one-block elimination only within the output contracts msolve actually
  satisfies.
- Consider learn/apply traces and coefficient batching, guided by the 2026
  Groebner.jl work, once single-shot correctness is stable.

### Phase 4: broader coefficient fields

- Implement a correct ordinary-Python Buchberger reference over Sage.js field
  protocols for small problems and unsupported fields.
- Accelerate its typed hot loops with `@native` only after profiling.
- Prioritize finite extensions, number fields, and rational-function fields
  according to concrete Sage compatibility tests.
- Do not contort msolve into coefficient domains it was not designed for.

### Phase 5: optional Singular breadth

- Prototype a lazy worker/resource with a structured packed protocol, not
  string parsing as the permanent API.
- Target modules, syzygies, resolutions, local orders, quotient/extension
  rings, and noncommutative G-algebras.
- Measure cold download, memory, startup, Windows build reliability, and SEA
  growth before deciding whether any subset should become resident.

## Acceptance gates

No new backend should become automatic until all applicable gates pass:

- **Mathematical:** canonical basis comparisons, ideal-equality certificate,
  Buchberger criterion, normal-form invariants, zero/unit edge cases, and
  exact cross-oracles.
- **Platform:** Linux x64, Linux ARM64, macOS ARM64, native Windows x64,
  Node/WASI, Chromium, Firefox, and WebKit where supported.
- **Safety:** ASAN, UBSAN, LSAN, malformed packed input fuzzing, allocation
  failures, cancellation, time limit, memory limit, and repeated-call leak
  tests.
- **Reproducibility:** pinned source/hash/license receipt and deterministic
  scalar result across every target.
- **Performance:** cold and warm time, peak RSS, output size, and bundle delta
  on cyclic, Katsura, eco, random sparse, elimination, and rational
  coefficient-swell families. Compare against current FLINT, msolve CLI,
  Singular, and Groebner.jl without hiding startup costs.
- **Architecture:** dynamic exact fallback, inspectable backend selection,
  capability fail-closed behavior, `architecture/native-code.json`
  classification, and `pnpm architecture:check`.

## Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Upstream msolve exits or corrupts the host process | Replace reachable exits with status returns; run difficult jobs in a terminable worker; fuzz the packed ABI |
| Probabilistic `QQ` lifting returns a bad basis | Full change-matrix and Buchberger certification; never equate “high probability” with `proof=True` |
| Port diverges from active upstream | Keep patches minimal and upstreamable; pin a source bundle and run upstream tests plus Sage.js differential tests |
| SIMD/OpenMP breaks portability or reproducibility | Scalar single-thread baseline everywhere; opt-in accelerated variants only with exact receipts |
| Singular makes downloads and startup huge | Lazy separately cached worker/resource; do not link it into the mandatory core |
| A backend silently accepts the wrong order/domain | Exact capability tuple and fail-closed dispatch |
| Gröbner computation exhausts browser memory | Worker isolation, explicit quotas, preflight term/exponent limits, progress and cancellation |
| “Reduced basis” conventions differ | Normalize and test Sage term-order, monicity, sort, and reducedness semantics at the boundary |

## Immediate implementation recommendation

The next coding project should be **Phase 0 plus Phase 1**, not a broad
libSingular wrapper and not a home-grown F4 implementation. Concretely:

1. Submit the two small msolve Windows portability changes upstream.
2. Freeze a minimal msolve 0.10.1-or-newer source manifest and classify the
   native boundary.
3. Design the versioned packed ABI and remove process exits from the reachable
   finite-field call graph.
4. Land `GF(p)`, `p < 2^31`, degree-reverse-lexicographic ideals behind an
   explicit experimental backend selector.
5. Build the proof/corpus infrastructure at the same time; do not postpone
   correctness until after automatic dispatch.
6. Promote the backend only after the six-target exactness and safety gates.
7. Then port modular `QQ`, with transformation provenance as a release
   requirement for `proof=True`.

This gives Sage.js a modern portable core quickly while preserving a clean
path to Singular's breadth and future signature/tracing work.

## Primary sources

- msolve [repository](https://github.com/algebraic-solving/msolve),
  [project and releases](https://msolve.lip6.fr/),
  [tutorial](https://msolve.lip6.fr/downloads/msolve-tutorial.pdf), and
  [implementation paper](https://arxiv.org/abs/2104.03572)
- FLINT [`fmpz_mpoly` documentation](https://flintlib.org/doc/fmpz_mpoly.html)
  and [repository](https://github.com/flintlib/flint)
- Singular [repository](https://github.com/Singular/Singular),
  [current manual](https://www.singular.uni-kl.de/Manual/latest/), and
  [official browser port](https://github.com/Singular/Singular-in-browser)
- Groebner.jl [repository](https://github.com/sumiya11/Groebner.jl),
  [documentation](https://sumiya11.github.io/Groebner.jl/),
  [2023 implementation paper](https://arxiv.org/abs/2304.06935), and
  [2026 tracing paper](https://arxiv.org/abs/2607.06372)
- MathicGB [repository](https://github.com/Macaulay2/mathicgb) and
  [algorithm paper](https://arxiv.org/abs/1206.6940)
- CoCoALib [repository](https://github.com/cocoa-official/CoCoALib)
- OpenF4 [repository](https://github.com/nauotit/openf4)
- M4GB [repository](https://github.com/cr-marcstevens/m4gb)
- Rings [repository](https://github.com/PoslavskySV/rings)
- feanor-math [repository](https://github.com/FeanorTheElf/feanor-math)
