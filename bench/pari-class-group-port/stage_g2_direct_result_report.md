# Stage G2: direct result with preserved virtual views

## Result

The corrected direct-result compiler at `c085e4b2a` fixes the G1 structural
regression. Stage G2 preserves all Stage E virtual views, passes the complete
semantic and static protocol, and is consistently faster than its same-tip
Stage E control in two fresh processes.

The measured pooled improvement is **0.957%**:

```text
Stage E pooled geometric mean    2.175907735 ms/catalog
Stage G2 pooled geometric mean   2.155084161 ms/catalog
Stage G2 / Stage E               0.990429937
```

That ratio narrowly misses the frozen adoption threshold of `<= 0.990` by
`0.000429937` (0.043 percentage point). Consequently this is strong positive
evidence for the direct-result mechanism, but under the predeclared rule G2 is
not yet accepted as a performance optimization.

All exact samples and identities are in
[`stage_g2_direct_result_evidence.json`](./stage_g2_direct_result_evidence.json).

## Inputs and construction

All arms came from the same clean compiler commit and exact fixture:

```text
compiler  c085e4b2a1bdb9cf4fd416fe1669de800328ebe7
fixture   /tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json
sha256    f61f6aed8d229a2fc10a6336559e97a23d58758151481fb1dfc09fb84a906312
```

The same driver invocation built:

```text
Stage D  /tmp/sagejs-stage-a-catalog-JyBKqg
Stage E  /tmp/sagejs-stage-a-catalog-syWGCM
Stage G2 /tmp/sagejs-stage-a-catalog-hF0oNK
```

The three modes used identical `-O3 -fPIC -Wall -Wextra
-ffunction-sections -fdata-sections` flags and the same linker flags and
adapter. Stage G2's generated core SHA-256 is
`1db8d76a096ff7076f1811f0beb0ccdf4064685e280f6a35cb09cd7026213252`.

## Correctness and structure

Validation-only replay passed all 12 valid catalog executions, 27 malformed
executions, and 45 public-copy degree/bounds/overlap executions. Outcomes and
every post-call buffer agree with Stage E. The tagged packet-zero oracle still
covers all 7,081 active outputs.

The prepared graph contains exactly one direct-result leaf and three proved
call sites in `int64_pari_flxq_powu`. Generated C and ELF contain exactly one
ordinary checked private copy and one direct core. The direct core has no
status/result-output ABI, view descriptors, or machine calls; its specialized
machine body is 57 bytes. The ordinary checked body remains 660 bytes and
continues to serve all public and unproved calls.

Unlike G1, both Stage E and Stage G2 have:

```text
UInt64 descriptor locals    0
.data assignments           0
.length assignments         0
.data offset adjustments    0
```

Thus the correction preserves the seven virtual views that G1 accidentally
materialized.

## Machine gates

| measure | Stage E | Stage G2 | delta |
|---|---:|---:|---:|
| generated core bytes | 6,305,446 | 6,322,765 | +17,319 |
| private textual slice | 1,355,770 | 1,372,849 | +17,079 |
| object text | 212,853 | 212,843 | -10 |
| linked ELF text | 347,495 | 347,455 | -40 |
| object calls | 1,771 | 1,770 | -1 |
| addon calls | 1,850 | 1,849 | -1 |
| checked-copy text relocations | 23 | 21 | -2 |
| direct-copy text relocations | 0 | 2 | +2 |
| ordinary-copy text relocations | 45 | 45 | 0 |
| total copy text relocations | 68 | 68 | 0 |

Every frozen machine gate passes. In particular, the direct mechanism now
replaces two surviving checked private calls without perturbing the ordinary
fallback, total copy relocation count, or broader inlining budget.

## Timing

One process started while unrelated disposable C rebuilds overlapped the host.
It was discarded and overwritten. After confirming the host was quiet, the two
required processes ran sequentially. Each performed three warmups and seven
alternating pairs with independently calibrated batches of at least 900 ms.

The harness names its first supplied arm `stage-d`; for these commands the
first supplied directory was Stage E, so all values below relabel that field
correctly.

| run | Stage E GM (ms) | Stage G2 GM (ms) | G2/E |
|---|---:|---:|---:|
| 1 | 2.174118645 | 2.156451955 | 0.991874091 |
| 2 | 2.177698296 | 2.153717235 | 0.988987886 |
| pooled | 2.175907735 | 2.155084161 | 0.990429937 |

All 14 paired candidate/control ratios are below one; the largest is
`0.993882929`. This rules out a result driven by one favorable aggregate or an
unexplained slower pair. The limitation is simply that the repeatable gain is
about 0.96%, just short of the deliberately round 1% adoption threshold.

For orientation only, the pooled G2 result is 1.550x the historical 1.39 ms
mechanical-C ceiling and 1.062x the historical 2.03 ms PARI measurement. Those
are not same-process comparisons.

## Implication

The direct-result ABI is validated: it reduces real calls without sacrificing
readable Python, checked public behavior, or virtual storage. The remaining
gap is not this copy leaf alone. The next targeted change should apply the same
mechanism to another hot, proved private edge or remove a larger surviving ABI
island, while preserving the now-stable private-graph code shape. Repeating G2
unchanged merely to cross a threshold would be benchmark selection, not new
evidence.
