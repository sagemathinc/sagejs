# Integral morphism geometry: qualification and timings

Measured 2026-09-12 on Linux x64, AMD EPYC 7B13, Node 26.8.1, against
SageMath 10.9.post1. Mathematical source revision: `572da984d`;
[the raw receipt](morphisms-performance-linux-x64.json) also hashes the exact
Python sources. These are workload-specific results, not universal speed claims.

## Cold results

Medians of three fresh processes per system and case, in seconds. Timed work
forces the integral matrix, rank, and nonunit Smith factors. All 30 runs
completed; dimensions, ranks and every invariant factor agree exactly.

| Workload | Level | Dimension | Sage.js | Sage | Comparison |
| --- | ---: | ---: | ---: | ---: | --- |
| $T_2-1$ on integral homology | 389 | 32 | 0.283 | 2.131 | Sage.js $7.5\times$ faster |
| $T_2-1$ on integral homology | 1009 | 83 | 0.758 | 56.589 | Sage.js $74.7\times$ faster |
| Labelled oldform decomposition isogeny | 121 | 6 | 0.981 | 0.195 | Sage $5.0\times$ faster |
| Labelled oldform decomposition isogeny | 242 | 22 | 2.794 | 0.580 | Sage $4.8\times$ faster |
| Labelled oldform decomposition isogeny | 363 | 33 | 4.928 | 0.836 | Sage $5.9\times$ faster |

The decomposition comparison forms the integral inclusion matrix from the
product of Sage's embedded factors into the Jacobian. Sage.js constructs the
corresponding certified product-to-Jacobian morphism. We compare geometric
dimensions and Smith factors, not matrices in unrelated integral bases.

At level $1009$, Sage.js spends about $0.544$ seconds constructing the map and
$0.214$ seconds on Smith/rank; Sage spends $56.488$ and $0.101$ seconds,
respectively. At level $363$, construction still dominates: $4.841$ seconds
in Sage.js versus $0.809$ in Sage. Optimizing only Smith form will not close
the composite-level gap.

The [pre-cache receipt](morphisms-performance-before-lattice-cache-linux-x64.json)
records the same grid at `cffbbc5dd`. Reusing immutable image/kernel lattices
and taking the exact integral fast path for denominator clearing reduced
Sage.js's median decomposition times from $1.137$, $3.957$, $7.701$ seconds to
$0.981$, $2.794$, $4.928$ seconds at levels $121$, $242$, $363$ respectively.
The intermediate [post-cache, pre-rational-rank receipt](morphisms-performance-before-rational-rank-linux-x64.json)
is also retained; the final numbers above include the exact rational-rank path.
The remaining degeneracy/linear-algebra overhead is a follow-up, not a closed
performance-parity gate.

## Timing policy and reproduction

Startup is excluded; no library warmup is performed. Sage imports `sage.all`
before timing; Sage.js may load its mathematical modules lazily during the
timed call. Systems run sequentially, with no concurrent build or test started
by this benchmark. This is a shared host, with default native backends and no
CPU affinity or forced single-threading. Do not extrapolate these numbers to
other platforms or all levels.

The JSON separates construction, Smith/rank, and ten repeated requests on the
same cached object. Warm repeats take roughly $64$–$78$ microseconds in Sage.js
and $3$–$17$ microseconds in Sage; these are lookup costs, not fresh mathematics.

```sh
node bench/modular/abelian-varieties/morphisms-performance.cjs \
  bench/modular/abelian-varieties/morphisms-performance-linux-x64.json 3
```

Set `SAGE_ORACLE` if Sage is not `/home/user/bin/sage`. Each subprocess has a
300-second limit. Timeouts are retained in the receipt, not recorded as successes.

## Correctness and portable qualification

The focused native suite passes all 13 tests, including pinned Sage fixtures
through level $1009$, exact cross-compositions of degeneracy maps, bad-prime
non-stability of individual old copies, empty products, nonsaturated images,
large integers, and serialization tampering.

The final shared corpus passes Node/Wasm and real Chromium (about $6.23$
seconds in the latter). Both positive and negative cases run through the
production artifact:

`sha256:d4d33b9bb1ffaab8ebd0ef74cb092ce22a2130351ab0576f3e204d2c22b9ba3e`

The artifact's manifest and source copies were verified before testing. Native
and portable paths use the same mathematical sources and exact contracts;
portable Smith invariants now use the existing FLINT adapter, with its
correct transformed-Smith fallback retained for unavailable backends. The
resource test verifies route telemetry as well as exact results.

An initial larger-level portable stress test exceeded 120 seconds; the
[failed receipt](morphisms-wasm-before-snf.json) is preserved. Stage-by-stage
diagnosis isolated the portable integer-rank fallback as another bottleneck.
Morphism rank now uses the existing exact rational matrix path. The shared
corpus includes level $389$ and verifies its full rank and all ten nonunit
Smith factors against Sage.

The [final Node/Wasm receipt](morphisms-wasm-linux-x64.json) contains three
fresh processes per level with identical mathematical outputs:

| $T_2-1$ workload | Sage.js native | Sage.js Node/Wasm | Sage native |
| --- | ---: | ---: | ---: |
| Level $389$ | 0.283 s | 1.277 s | 2.131 s |
| Level $1009$ | 0.758 s | 6.721 s | 56.589 s |

Wasm is slower than Sage.js native here, but faster than Sage native on both
measured cases. These are Node-hosted Wasm timings; real Chromium qualification
uses the shared correctness corpus, not a claim of identical browser timing.
Artifact and source hashes are recorded. Reproduce with:

```sh
node bench/modular/abelian-varieties/morphisms-wasm-performance.cjs \
  bench/modular/abelian-varieties/morphisms-wasm-linux-x64.json 3
```

```sh
node --test test/modular-abelian-morphisms.cjs test/modular-abelian-varieties.cjs
node --test packages/flint-wasm/test/modular-abelian-morphisms.test.mjs \
  packages/flint-wasm/test/modular-abelian-varieties.test.mjs
node packages/flint-wasm/test/modular-abelian-morphisms-browser.mjs
node scripts/run-doc-examples.cjs docs/modular-abelian-morphisms.md
```

Strict Python checks pass on 391 modules; architecture and merge inventories
pass at `572da984d`. All 221 repository unit-test files passed after the shared
matrix/FFI changes; the final rational-rank follow-up was requalified with the
13-test focused suite, strict checks and portable corpus above. The integer
matrix FFI test also passed its 30 randomized and 300 lifecycle rounds.
Remote platform CI is separate from these local receipts.
