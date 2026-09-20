# Prepared cubic multifield native/Wasm qualification

This isolated qualification applies the unchanged prepared cubic factor-base
and bounded relation-prefix artifacts from revision
`c4d07156194765506d137792732ba5109cd8c87e` to three answer-free neutral
prepared inputs:

- H1, the required real cubic;
- row1, a nontrivial index-3 cubic not previously executed by this Wasm
  pipeline; and
- the discriminant -23 complex cubic, adding a different signature.

The candidate requests contain only neutral prepared field data and the fixed
bounded relation-prefix limits. Exact native outputs appear only in the
browser runner's out-of-band `expected` member. They are never supplied to the
candidate computation.

The source and artifact boundary is frozen at `c4d0715`; the later checkout
HEAD is explicitly excluded from every performance and correctness claim.
The two gitignored Wasm artifacts remain present locally, and `verify.mjs`
requires their exact paths, byte counts, and SHA-256 digests. The measured
native executables were not retained; their receipts honestly preserve only
the frozen identity of the exact binaries used.

To reconstruct the retained artifacts, use a detached checkout of `c4d0715`
and run `build-wasm.sh` in each of
`qualification/wasm-prepared-factor-base` and
`qualification/wasm-prepared-relation-prefix`. The expected outputs are
respectively 484,386 bytes / `1bc651…cdec` and 698,053 bytes /
`385e83…c43`; the verifier rejects any other bytes.

Each of the six native runs first made one untimed expected-result/warmup call,
then made 15 timed calls checked against it: six untimed calls plus 90
timed native calls in total. Each of the 18 browser-engine runs made exactly 15
timed calls with no separate warmup, so its first call is part of the reported
sample set. All 90 timed native calls and 270 actual browser calls agree
exactly. Median times:

| Field and stage | Native | Chromium | Firefox | WebKit |
| --- | ---: | ---: | ---: | ---: |
| H1 factor base | 5.03 ms | 10.0 ms | 58 ms | 10 ms |
| H1 relation prefix | 9.13 ms | 36.9 ms | 264 ms | 36 ms |
| row1 factor base | 4.05 ms | 8.2 ms | 47 ms | 8 ms |
| row1 relation prefix | 8.21 ms | 35 ms | 255 ms | 35 ms |
| complex -23 factor base | 0.19 ms | 0.7 ms | 2 ms | 1 ms |
| complex -23 relation prefix | 3.82 ms | 26.3 ms | 200 ms | 26 ms |

The browser runner recorded the first call's `before_call` Wasm linear-memory
page count and the fifteenth (last) call's `after_call` count. These are not
per-call memory samples or process RSS. A page is 64 KiB; all three engines
reported the same endpoint counts for each case:

| Field and stage | Pages before | Pages after | Growth |
| --- | ---: | ---: | ---: |
| H1 factor base | 17 | 20 | 192 KiB |
| H1 relation prefix | 18 | 22 | 256 KiB |
| row1 factor base | 17 | 19 | 128 KiB |
| row1 relation prefix | 18 | 21 | 192 KiB |
| complex -23 factor base | 17 | 18 | 64 KiB |
| complex -23 relation prefix | 18 | 20 | 128 KiB |

The results are field-dependent: factor-base `(bound, ideals)` is `(333,66)`
for H1, `(259,51)` for row1, and `(11,3)` for the complex cubic. Every stage
has a distinct digest, and relation storage/counters likewise vary.

This is deliberately a bounded-stage qualification. The relation request
visits at most **one ideal** and considers at most **64 candidates**. Every
relation result reports `completeRankAndSurplus: false` (H1 and row1 also have
missing rank 50 and 36). Therefore this evidence is not W0, R5, a completed
relation lattice, unit reconstruction, or an end-to-end class-group result.

No row6 constant remains in the production runtime paths exercised here.
Row6 assumptions do remain in older one-field vector-generation scripts and
in `cfg(test)` regression modules; those are harness/test assumptions, not
candidate computation. This qualification replaces the former vector
limitation with the generic `cases.json`/`prepare-vectors.mjs` route.

The verifier enumerates the complete 33-file first-party Rust source closure
of both Wasm stages at `c4d0715` (the two wrapper crates and the shared core),
checks production portions for row6 constants, validates every evidence JSON
against closed schemas, and enforces browser engine/version/UA identity,
single artifact routing, portable non-isolated execution, exact imports and
exports, null failures, stage consistency, medians, outputs, and retained
artifact bytes.

Run `node verify.mjs` to recheck source assumptions, input neutrality, all raw
sample medians, artifact revisions, exact cross-target outputs, resource pages,
and evidence identities.
