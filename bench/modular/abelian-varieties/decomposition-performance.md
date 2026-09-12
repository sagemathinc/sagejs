# Integral decomposition-isogeny performance

## Batched portable matrix access follow-up

The follow-up removes scalar resource traffic without changing the exact
algorithms: rectangular solves export their RREF entries once, and geometric
transfers accumulate integer counts before constructing a rational matrix.
On the preceding portable artifact, a level-726 homology coordinate solve
took 4.06 s although RREF took 0.034 s; assembling transfer counts from level
33 to 726 took 16.15 s although the two matrix products took 0.27 s combined.
These phase probes motivated the changes; they are not whole-workload medians.

[`decomposition-batched-linux-x64.json`](decomposition-batched-linux-x64.json)
records three sequential fresh runs per system, after all owned builds and
tests finished. The source hashes identify the tested working tree based on
`02a683d21`; startup is excluded and no library warmup is performed.

| Level | Sage.js construction | Sage.js Smith + rank | Sage.js total | Sage total | Sage.js / Sage |
| --- | ---: | ---: | ---: | ---: | ---: |
| 121 | 0.773 | 0.002 | 0.775 | 0.208 | 3.73 |
| 242 | 1.476 | 0.048 | 1.524 | 0.558 | 2.73 |
| 363 | 1.837 | 0.075 | 1.911 | 0.835 | 2.29 |
| 726 | 7.955 | 0.857 | 8.837 | 16.544 | 0.53 |
| 1089 | 8.160 | 0.850 | 9.010 | 17.504 | 0.51 |

All 30 records match the exact dimensions, ranks and nonunit Smith invariants.
The full large-level workload is 1.87–1.94 times faster than Sage, but small
levels remain slower and large-level construction alone is still slightly
slower. Historical timings below were collected separately on a shared host;
use the contemporaneous Sage comparisons above, not a ratio between campaigns.

Portable receipt:
[`decomposition-batched-wasm-linux-x64.json`](decomposition-batched-wasm-linux-x64.json),
artifact `sha256:d2aa066d16fdcd33d7aba29879a5e5568f1a8129493d4a6c1750814fc81aeb8d`.
Level 242 has three exact-checked runs with median 6.336 s. Level 726 still
exceeds the 120 s evaluation limit; the receipt retains that failure and
the harness stops before level 1089. Do not interpret the requested sample
count as completed samples for those levels. All 13 native tests, both
Node/Wasm tests and the shared real-Chromium corpus pass, including multiple
right sides, free variables, inconsistent systems and empty rectangular solves.
Large-level portable throughput remains open despite the native speedup.

## Earlier native comparison (PR 243)

Source: `abced86d3` (full commit and source hashes in the receipt). The receipt
[`decomposition-performance-linux-x64.json`](decomposition-performance-linux-x64.json)
records three sequential fresh processes per system and level, source hashes,
host identity and all exact kernel invariants. Sage is 10.9.post1. Startup is
excluded, but no mathematical-library warmup is performed. Timed work forces
the integral product-to-Jacobian matrix and its Smith invariants, not merely
a rational splitting. Default native backends are used; the shared host is
not CPU-isolated or pinned single-core.

Median wall seconds (phase medians need not sum to the median total):

| Level | Sage.js construction | Sage.js Smith + rank | Sage.js total | Sage total | Sage.js / Sage |
| --- | ---: | ---: | ---: | ---: | ---: |
| 121 | 1.081 | 0.002 | 1.083 | 0.272 | 3.99 |
| 242 | 1.955 | 0.056 | 2.008 | 0.640 | 3.14 |
| 363 | 2.408 | 0.092 | 2.500 | 0.927 | 2.70 |
| 726 | 16.408 | 1.181 | 17.539 | 21.614 | 0.81 |
| 1089 | 15.769 | 1.225 | 16.994 | 21.756 | 0.78 |

Every dimension, rank and nonunit Smith invariant agrees with Sage in all
30 completed runs. At the two larger levels, both Jacobians have dimension
109 and the isogeny matrix has rank 218. Sage's median Smith/rank times there
are 12.295 and 12.610 seconds respectively.

This **does not establish universal performance parity**. The small-level
cold setup/decomposition gap remains, and construction alone is still slower
at the larger levels. The complete larger-level workload is now faster than
Sage because its Smith computation is substantially faster.

## What changed

See [the algorithm note](../../../agents/modular-abelian-decomposition-performance.md)
for exact proofs and representation conventions:

- Saturation via the dual column lattice, avoiding two large complementary
  kernels; integral RREF bases use their unit-minor certificate directly.
- Batched transfer counts in Manin coordinates, with cached exact bridges
  to the public homology basis.
- Reuse of same-level embedded constituents, independent saturated-image
  caching, and certified product-map construction by stacking inclusions.
- For large nonsingular matrices, modular HNF using the proved annihilator
  obtained from the denominator of the inverse, followed by ordinary Smith
  reduction. Alternating HNF/transposition is bounded to four passes. Sparse
  matrices retain ordinary Smith reduction to avoid a needless dense inverse.

No handwritten native mathematics or new foreign binding was added. The
public morphism model, integral image lattices and serialization proof
requirements are unchanged.

The historical [baseline](morphisms-performance.md) was 0.981, 2.794 and
4.928 seconds at levels 121, 242 and 363. These are historical observations,
not interleaved before/after measurements on an isolated host.

The diagnostic
[`decomposition-performance-before-smith-linux-x64.json`](decomposition-performance-before-smith-linux-x64.json)
contains three pairs at the small levels and **only one pair at 726**. That
run was deliberately interrupted before repeating the expensive Smith step:
level 726 took 11.113 seconds construction plus 50.437 seconds Smith/rank,
61.550 seconds total. It measures the first structural fixes at `bac7449a1`,
not the original implementation and not a completed five-level benchmark.

The full three-run intermediate receipt at `69e12d5a4` is also retained as
[`decomposition-performance-before-sparse-selection-linux-x64.json`](decomposition-performance-before-sparse-selection-linux-x64.json).
The source-current medians above supersede its timings. Both runs used a
shared, non-isolated host; their absolute wall-time differences should not be
attributed to the final sparsity heuristic without an isolated experiment.

## Correctness and portable qualification

- 13 focused native modular-abelian-variety/morphism tests pass, including
  pinned Sage/Magma data and independent lattice/transfer oracles.
- The shared corpus compares modular HNF against ordinary HNF and Smith
  invariants against unimodularly equivalent diagonal matrices, including
  transposes, 90-bit coefficients, singular and rectangular matrices, and
  an unavailable-adapter fallback.
- Both packaged Node/Wasm tests pass. Real Chromium runs the same expanded
  corpus successfully (10.916 seconds in the final recorded run).
- Strict Python, architecture, generated documentation and merge inventory
  checks pass.

Portable artifact identity:
`sha256:85575b1ba917a5ffc01073686e58aacefb3cf990ccd434d8fc547edcc1ea9a31`.
The mathematical Python bundle was rebuilt; the unchanged reviewed Wasm
binaries were reused through the supported packaging-resume mode.

Larger-level browser throughput is **not qualified**. A diagnostic at
`69e12d5a4` completed level 242 in 16.281 seconds with exact Sage agreement,
but level 726 exceeded its 120-second Node/Wasm evaluation limit. The failed
record is preserved in
[`decomposition-wasm-performance-linux-x64.json`](decomposition-wasm-performance-linux-x64.json).
The final sparsity heuristic keeps the same preconditioning path for these
dense isogenies; it does not claim to repair this portable scaling limit.

On the final artifact, the one-sample
[`decomposition-wasm-final-linux-x64.json`](decomposition-wasm-final-linux-x64.json)
confirms level 242 in 16.079 seconds with every invariant equal to Sage.
The one-sample
[`morphisms-wasm-smith-regression-linux-x64.json`](morphisms-wasm-smith-regression-linux-x64.json)
confirms the existing $T_2-1$ workloads at levels 389 and 1009, in 1.647 and
8.830 seconds. At 1009, Smith/rank now takes 0.495 seconds rather than the
2.607-second dense-inverse detour recorded in
[`morphisms-wasm-before-sparse-selection-linux-x64.json`](morphisms-wasm-before-sparse-selection-linux-x64.json).
These are diagnostic samples, not portable medians or a universal speed claim.

Reproduce the native comparison:

```sh
node bench/modular/abelian-varieties/morphisms-performance.cjs results.json 3 121,242,363,726,1089
```

Reproduce portable correctness:

```sh
node --test packages/flint-wasm/test/modular-abelian-morphisms.test.mjs packages/flint-wasm/test/modular-abelian-varieties.test.mjs
node packages/flint-wasm/test/modular-abelian-morphisms-browser.mjs
```
