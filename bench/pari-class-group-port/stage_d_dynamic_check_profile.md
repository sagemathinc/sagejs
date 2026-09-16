# Stage-D remaining-check dynamic profile

`profile_stage_d_remaining_checks.cjs` instruments only the generated private
36-function Stage-D catalog graph. It adds one counter immediately before each
surviving checked int64 add/subtract/multiply and each surviving signed buffer
index operation, rebuilds a disposable copy of the addon, and runs the frozen
catalog. Neither the Python algorithm nor the compiler is changed.

The driver first replays all four frozen packets in a process whose counters
are discarded. Result values and every post-call buffer snapshot match the
frozen CPython-derived expectations. It then starts a fresh process and counts
one tagged execution of packet zero, the 7,081-output workload used throughout
the campaign. This separation prevents correctness replay from contaminating
the dynamic census.

The exact inputs to this run were:

- fixture SHA256
  `f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312`;
- Stage-D generated core SHA256
  `9229631d082657b648a256bd51a03512bfff659596df1e9235dc4ed3b6b8b3d2`;
- instrumented core SHA256
  `9958f2708b26d2fc417f31b9fbf3f0c41d0294e8ed2df90cfea4ead63c9ccaf3`.

## Overall census

The 382 remaining static sites execute **6,737,915** times in one catalog:

| operation | static sites | dynamic executions | share |
| --- | ---: | ---: | ---: |
| checked signed addition | 236 | 3,909,706 | 58.03% |
| checked `UInt64Buffer` index | 71 | 2,206,947 | 32.75% |
| checked signed subtraction | 53 | 556,097 | 8.25% |
| checked signed multiplication | 22 | 65,165 | 0.97% |

There are no remaining `Int64Buffer` index sites in the private graph. Of the
382 static sites, 315 execute for packet zero and 67 do not. The distribution
is concentrated but has a meaningful tail:

| cumulative dynamic checks | number of hottest static sites |
| --- | ---: |
| 50% | 18 |
| 75% | 55 |
| 90% | 102 |
| 95% | 144 |
| 99% | 232 |

These are dynamic *check counts*, not an assertion that all checks cost the
same number of cycles. Earlier removal experiments showed that a predictable
bounds check can be cheaper than an overflow helper, so count is the correct
ranking of proof exposure rather than a per-site timing attribution.

## Ranking by source function

Four ordinary Python polynomial routines account for 89.85% of all surviving
dynamic checks:

| source function | dynamic checks | share | cumulative | static sites |
| --- | ---: | ---: | ---: | ---: |
| `_int64_pari_flx_divrem` | 2,468,794 | 36.64% | 36.64% | 58 |
| `int64_pari_flx_copy` | 1,873,165 | 27.80% | 64.44% | 15 |
| `int64_pari_flx_sqr` | 1,223,897 | 18.16% | 82.61% | 28 |
| `int64_pari_flx_mul` | 488,434 | 7.25% | 89.85% | 29 |
| `int64_pari_flx_sub` | 101,560 | 1.51% | 91.36% | 15 |
| `int64_pari_flxq_powu` | 98,462 | 1.46% | 92.82% | 38 |
| `int64_shift_right` | 79,110 | 1.17% | 94.00% | 1 |
| `int64_pari_flx_small_squarefree` | 65,140 | 0.97% | 94.96% | 17 |
| `int64_pari_flx_deriv` | 60,227 | 0.89% | 95.86% | 14 |
| `_int64_pari_flx_small_ddf` | 38,479 | 0.57% | 96.43% | 33 |

This independently recovers the same four-routine frontier seen before
checked regions, now after 109 arithmetic and 16 bounds sites have already
been proved away.

Aggregating normalized expression shapes (temporary numbers removed) makes
the underlying proof opportunities equally clear:

| normalized operation/index shape | dynamic checks | static sites |
| --- | ---: | ---: |
| `w[tmp]` bounds | 2,110,154 | 67 |
| add `tmp + tmp` | 1,345,553 | 67 |
| add `out + i` | 727,260 | 13 |
| add `a + i` | 290,841 | 10 |
| add `rem + i` | 288,405 | 2 |
| add `quot + i` | 259,187 | 3 |
| add `b + i` | 96,246 | 4 |
| subtract `tmp - j` | 84,766 | 4 |
| subtract `shift - 1` | 79,110 | 1 |
| subtract `i - dy1` | 78,436 | 2 |

`tmp` here is intentionally only a shape placeholder; the full JSON keeps the
function and source operation id needed to distinguish the 67 separate access
sites.

## Hottest exact source operations

Each row below is one emitted static check site. Operation ids distinguish
multiple lowered operations attached to the same Python expression. The
cumulative column is relative to all 6,737,915 dynamic checks.

| rank | count | cumulative | function:operation | Python line | operation / index shape |
| ---: | ---: | ---: | --- | ---: | --- |
| 1 | 355,620 | 5.28% | `int64_pari_flx_copy:46` | 95 | add `out + i` |
| 2 | 355,620 | 10.56% | `int64_pari_flx_copy:48` | 95 | `w[out + i]` bounds |
| 3 | 355,620 | 15.83% | `int64_pari_flx_copy:48` | 95 | loop/index add |
| 4 | 242,973 | 19.44% | `_int64_pari_flx_divrem:15` | 310 | add `quot + i` |
| 5 | 242,973 | 23.05% | `_int64_pari_flx_divrem:17` | 310 | `w[quot + i]` bounds |
| 6 | 242,973 | 26.65% | `_int64_pari_flx_divrem:21` | 312 | loop/index add |
| 7 | 228,159 | 30.04% | `_int64_pari_flx_divrem:19` | 312 | add `rem + i` |
| 8 | 228,159 | 33.42% | `_int64_pari_flx_divrem:21` | 312 | `w[rem + i]` bounds |
| 9 | 129,357 | 35.34% | `int64_pari_flx_sqr:15` | 206 | add `out + i` |
| 10 | 129,357 | 37.26% | `int64_pari_flx_sqr:17` | 206 | `w[out + i]` bounds |
| 11 | 129,357 | 39.18% | `int64_pari_flx_sqr:17` | 206 | loop/index add |
| 12 | 118,853 | 40.95% | `int64_pari_flx_copy:14` | 85 | add `out + i` |
| 13 | 118,853 | 42.71% | `int64_pari_flx_copy:15` | 85 | add `a + i` |
| 14 | 118,853 | 44.48% | `int64_pari_flx_copy:16` | 85 | `w[out + i]` bounds |
| 15 | 118,853 | 46.24% | `int64_pari_flx_copy:17` | 85 | `w[a + i]` bounds |
| 16 | 118,853 | 48.00% | `int64_pari_flx_copy:17` | 85 | loop/index add |
| 17 | 79,110 | 49.18% | `int64_shift_right:5` | 52 | subtract `shift - 1` |
| 18 | 60,246 | 50.07% | `_int64_pari_flx_divrem:153` | 351 | `w[quot]` bounds |

The first 16 sites are all fixed nine-word slot movement or clearing. They
come from the readable expressions `w[out + i] = 0`,
`w[quot + i] = 0`, `w[rem + i] = 0`, and
`w[out + i] = w[a + i]`. One slot/span theorem can therefore remove several
independently hot overflow and bounds checks while retaining the public checked
path. The next isolated site is not a buffer operation at all:
`shift -= 1` alone executes 79,110 times and is the best loop-range arithmetic
proof target.

The convolution bodies begin immediately after this fixed-span frontier. They
contain the affine shapes `w[a + j]`, `w[a + i - j]`, `w[b + j]`, and
`w[out + v + i]`; those should be addressed only after the simpler slot proof,
and against the same counter census.

## Reproduction

First emit and build the exact guarded Stage-D catalog with
`check_stage_a_catalog_region.cjs ... stage-d`, then pass the resulting
`outputDirectory` to:

```bash
node bench/pari-class-group-port/profile_stage_d_remaining_checks.cjs \
  /path/to/frozen-fixtures.json /path/to/stage-d-build \
  > /tmp/stage-d-dynamic-profile.json
```

The JSON result contains every one of the 382 sites, source function and IR
operation id, Python file/line/column, normalized C index expression, dynamic
count, cumulative count/fraction, and aggregate rankings by function,
operation family, and index shape. The disposable generated core and raw TSV
counter dump remain in the reported `outputDirectory` for audit.
