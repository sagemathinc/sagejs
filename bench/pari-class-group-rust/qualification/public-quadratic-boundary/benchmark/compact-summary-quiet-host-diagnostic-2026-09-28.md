# Map-free imaginary-quadratic summary: quiet-host diagnostic

This is a Sage.js-only performance diagnostic, **not** a promoted PARI
comparison or a release receipt. The frozen `panel-v2.json` was run on the idle
Linux `opt` VM with 15 warm samples per field, the same Node 26.7.0 public
runtime and native-kernel pack, and the same Rust 1.98.1 release build settings.
Only the `class-group-service` binary changed:

| Service | Source revision | Binary SHA-256 |
| --- | --- | --- |
| Before | `42ed902526471488e60fb627931f9f2ac7616e3d` | `4b6665e5e5736e83ee18a841819874254982678768820317ffa319839f2215cf` |
| Map-free summary | `2864156e10b51a90b13c6545b298bfac412bbc2d` | `6f61841dfbd1aa4c74ed3427190f67dd762bcee37c0e073e2b98d01539c1a95e` |

The boundary is the median parent-observed wall time of fresh
`K.class_group(algorithm='rust')` via `run-public-sagejs.cjs 15 --phases`.
Startup and field construction are excluded. Every result matched the frozen
class number and invariant factors; the public wrapper retained detached
generator verification and on-demand exact ideal-class coordinates.

| Frozen field | Before (ms) | After (ms) |
| --- | ---: | ---: |
| `tiny-trivial-d3` | 9.565 | 9.227 |
| `tiny-cyclic-d47` | 8.203 | 8.420 |
| `tiny-noncyclic-d231` | 8.424 | 8.775 |
| `rank4-d15015` | 9.959 | 10.355 |
| `near-limit-h1715-d9999991` | 8.215 | 8.185 |
| `near-limit-h4378-d8173415` | 9.346 | 9.203 |
| `larger-odd-prime-d20000000179` | 13.560 | 12.135 |
| `larger-odd-prime-d40000000003` | 15.032 | 13.347 |
| `larger-odd-prime-d60000000091` | 17.078 | 14.801 |
| `larger-even-d20000001124` | 14.259 | 11.703 |
| `larger-composite-d15000000315` | 15.534 | 11.926 |

For the five large fields, the after/before geometric-mean ratio is **0.846**.
The separate summary-service phase replay on the composite field fell from
5.36 ms to 2.46 ms. Phase replay is a fresh call and is not an additive
decomposition of the public wall time. The small-field changes are near the
evaluator and scheduling noise floor; the rank-four field deliberately retains
the full-map fallback. The PARI 2.17.4 artifact pin did not authenticate on
`opt`, so these numbers must not be combined with a PARI timing from that host.
