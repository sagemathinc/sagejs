# Stage H: guarded direct result

## Result

Stage H validates the guarded direct-result mechanism, but rejects this
particular use of it. The frozen catalog and all malformed cases remain exact,
and the new residual guard succeeds at every one of the 1,413 profiled calls to
`_int64_pari_flx_small_ddf:200`. Despite that perfect hit rate, Stage H is
consistently **2.364% slower** than its same-tip Stage G2 control:

```text
Stage G2 pooled geometric mean   2.154735544 ms/catalog
Stage H pooled geometric mean    2.205666280 ms/catalog
Stage H / Stage G2               1.023636653
```

All 14 alternating pairs in two fresh processes are slower. The cause is not
guard failure or fallback traffic. GCC stops specializing the shared copy core:
the 57-byte constant-propagated Stage G2 body becomes a 341-byte generic body.
That 284-byte expansion, together with 202 bytes added to DDF, outweighs the
benefit of the fourth direct edge. Stage H is therefore rejected as-is.

Exact samples and the structural census are in
[`stage_h_guarded_direct_result.json`](./stage_h_guarded_direct_result.json).

## Construction and correctness

The experiment uses finalized guarded-direct-result compiler commit
`4f78ddea9f802b090eeec2c4ad59638259ec9c6c`. It retains the Stage G2 direct
copy core and its three unconditional calls, then selects exactly operation
origin `_int64_pari_flx_small_ddf:200` for an edge-local guarded call.

The declared copy contract is:

```text
len(w) >= 393
a       in [0,384]
da      in [-1,8]
out     in [0,384]
```

At the selected edge, the compiler proves the workspace and output predicates.
Generated C retains only the residual source-start and degree checks, followed
by the ordinary checked private-copy fallback. The prepared and generated
census is exactly:

```text
direct-result cores          1
unconditional direct calls  3
guarded direct calls         1
other newly direct calls     0
```

The frozen packet-zero oracle agrees on all 7,081 active outputs. All nine
malformed packets agree result-for-result, exception-for-exception, and
buffer-for-buffer. Ordinary Python is unchanged.

## Guard profile

The selected edge executes 1,413 times across the four frozen packets. Every
execution satisfies the generated residual guard, so there are 1,413 direct
calls and no checked fallbacks at this edge.

GCC simplifies the emitted predicate further in machine code. It removes the
`dt` comparison and retains only the unsigned `t` range test, represented by a
`cmp`/`ja` pair. Thus the slowdown cannot be attributed to an expensive dynamic
degree check or to mispredicted fallback selection.

## Machine shape

| measure | Stage G2 | Stage H | delta |
|---|---:|---:|---:|
| generated core bytes | 6,322,765 | 6,323,260 | +495 |
| addon bytes | 354,880 | 358,976 | +4,096 |
| object text bytes | 212,843 | 213,345 | +502 |
| linked ELF text bytes | 347,455 | 347,983 | +528 |
| shared direct-copy body | 57 | 341 | +284 |
| private DDF body | — | — | +202 |
| object call instructions | 1,770 | 1,771 | +1 |
| direct-core text relocations | 3 | 4 | +1 |
| checked-copy text relocations | 23 | 23 | 0 |

The generated-core identities are:

```text
Stage G2  1db8d76a096ff7076f1811f0beb0ccdf4064685e280f6a35cb09cd7026213252
Stage H   888d246ba5deb4599067edce9423055c2cf34bca7e22114d4c272d8915b1f832
```

Stage G2's three proved callers let GCC form a 57-byte
`constprop.0.isra.0` copy core. Adding the fourth, more general call context
poisons that shared specialization: Stage H emits a single 341-byte generic
core instead. The checked fallback remains structurally stable at 23
relocations. The extra guarded direct call adds one call and one core
relocation, while the larger generic leaf and DDF caller account for nearly all
of the object-text growth.

## Timing

Two fresh processes each ran seven alternating control/candidate pairs. The
combined corpus therefore contains 14 pairs.

| process | Stage G2 GM (ms) | Stage H GM (ms) | H/G2 |
|---|---:|---:|---:|
| 1 | 2.153736065 | 2.207661964 | 1.025038304 |
| 2 | 2.155735487 | 2.203672401 | 1.022236918 |
| pooled | 2.154735544 | 2.205666280 | 1.023636653 |

Every paired ratio is above one. The least unfavorable pair is
`1.019502735`; the slowest is `1.029513901`. The consistent direction across
both processes rules out a pooled result driven by one outlier.

## Decision

Reject Stage H in its present shared-core form. The experiment demonstrates
that an always-true guarded edge is not automatically profitable: adding a
general call context can destroy a valuable compiler specialization even when
the residual predicate itself is nearly free.

A follow-up should preserve separate specialized and generic direct cores, or
clone the direct-result leaf per materially different call shape. Repeating
the current shared-core experiment would not address the measured cause.
