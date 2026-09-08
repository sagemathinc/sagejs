# Missing-unit search forensics

This is an untimed native diagnostic, not a production change, public receipt,
independent Sage.js replay, or PARI speed victory. The frozen development
population was reused; the twenty reserved unseen neighbors remain unexecuted.

## The first retry is a search failure, not a compaction loss

For $f=x^3-x^2-7x+122$, LMFDB `3.1.384587.1`, the current first native effort
declines with phase 43, reason 434. Its later retry returns $C_2\times C_4$.
The [full staged survey](cubic-full-staged-discovery.md) records that baseline.

A four-way source-copy ablation independently raised the eleven-ideal staging
guard, the eleven-ideal ordering guard, both, or neither. All four first
attempts still declined. The staging-only output was identical to baseline;
the ordering-only and combined outputs were identical to each other. Changing
these guards alone does not repair the missing witness.

Repeating all four variants across the frozen 1,012 fields confirms 948
acceptances for baseline and staging-only, and 946 for ordering-only and both.
There are no exceptions in these four runs. The freshly compiled baseline's
acceptance set is identical to the earlier full-survey first-attempt set.

A diagnostic exit immediately before compaction exports the actual relation
matrix and generators. It always returns `False`, with marker 900, and cannot
publish a class-group result. A second diagnostic additionally exports the
prepared Gram matrices, integral basis transformations, and traversal cursor.

| First-effort search | Raw rows | Rank | Presentation index | Integer kernel rank |
| --- | ---: | ---: | ---: | ---: |
| Original ordering | 34 | 12 | 8 | 22 |
| Ordering guard extended to twelve | 33 | 12 | 8 | 21 |

PARI's exact ideal arithmetic checks every exported principal-ideal equality.
For each integer-kernel basis vector $v$, the exact product
$\prod_i\alpha_i^{v_i}$ is $1$ or $-1$. Thus the entire relation kernel in
either captured set maps into the trivial unit subgroup: no choice of HNF
support or compaction tail can recover a nontrivial unit from these rows alone.
This conclusion relies on the exact integer-kernel/oracle computations, not on
a Lean formalization. It is not a replacement for the project's independent
certificate replay.

The earlier diagnostic count of eighteen was the **compacted** count, not the
raw count. Likewise PARI's trace `*` denotes rejection by `add_rel`; it must not
be described as a retained unit witness merely from its position in the trace.

## One explicit witness locates the mathematical difference

Instrumenting `add_rel` in local PARI 2.17.4 records generator coordinates and
relation rows. PARI uses basis $[1,a,a^2-5]$; the native capture uses
$[1,a,a^2]$. Converting these bases is essential before comparing generators.

Among PARI's accepted generators is $\beta=-11-4a$. Its relation, in the native
factor ordering, is

$$
(\beta)=\mathfrak p_3^2\mathfrak p_{11}^2.
$$

Here factor numbers are one-based. Adding this one exact row to either raw
native set gives an integer dependency with product

$$
u=-17506a^2+106579a-419747,\qquad N_{K/\mathbb Q}(u)=-1.
$$

The oracle checks the additional principal equality, not just its norm, and
records the complete dependency vector. This is the successful native retry's
unit up to sign. The generator is a forensic example, never a production
special case or lookup.

For the reordered search, the relevant ideal is actually prepared. In its
reduced basis $\beta$ has coordinates $(-2,-1,0)$, and its exact squared
embedding length exceeds the stored bound by a factor of approximately
$2.6298825978294853$. It is outside the native search ellipsoid. The original
ordering stops earlier, while visiting zero-based ideal 9; its prepared ideal
2 also excludes this generator, by a factor of approximately $10.88334$.

The current helper's description of its region as “PARI's reduced ellipsoid”
is too strong. For a nonscalar first reduced vector it selects

$$
B_{\rm native}=\min(8g_{00},2g_{11}).
$$

In the inspected PARI 2.17.4 `Fincke_Pohst_ideal`, the bound is instead the
maximum of twice the second vector's squared norm and a volume-based
`Fincke_Pohst_bound`. Its input is $4\cdot500/\operatorname{vol}(B_3)$, and
its recursion uses Gram–Schmidt lengths. The trace reports a bound around
$29370$ for the relevant ideal. PARI also enumerates from the center, rather
than scanning the enclosing coefficient box lexicographically. Search radius,
enumeration order, and stopping policy must be considered together.

## A general enlargement fixes the example but is not releasable

The isolated radius ablation changes only the nonscalar comparison above,
giving $\max(8g_{00},2g_{11})$. This is **not** an implementation of PARI's
volume formula. It leaves exact certification, the 500-candidate limit,
coordinate limits, factor/row capacities, and arena limits unchanged.

Both original-order and twelve-ideal-order variants certify the target on the
first native attempt. Both also return the expected groups for the familiar
$x^3+9x-55$, $x^3-x^2+3x-4$, and $x^3-x^2-11x-63$ examples.

The frozen 1,012-field fixed-effort-five development survey gives:

| Policy | Accepts | Newly accepting | Lost baseline acceptances | Exceptions |
| --- | ---: | ---: | ---: | ---: |
| Existing small radius | 948 | — | — | 0 |
| Larger radius, original ordering | 969 | 29 | 8 | 1 |
| Larger radius, ordering extended to twelve | 968 | 29 | 9 | 1 |

Every accepted class number and invariant list agrees with the frozen oracle.
The exception is `NativeExactArena temporary capacity exhausted` on
`3.1.42525675.2` in both larger-radius variants. The eight original-order
losses are `3.1.341563.1`, `3.1.861580.3`, `3.1.1264364.1`, `3.1.1897772.2`,
`3.1.2155607.1`, `3.1.2696812.1`, `3.1.29289260.3`, and `3.1.43342803.2`.
Extending the ordering adds the loss `3.1.1023547.1`.

These are first-attempt comparisons, not failures of the unchanged production
retry policy. The broad ablation is **not suitable for promotion**. No timing
was collected and no source/resource allowance was raised.

## Next intervention

The subsequent [content and search-order ablations](cubic-content-and-search-order-ablation.md)
test two of the mechanisms below, including controlled `opt` timings. Content
normalization alone improves first-attempt coverage without observed losses;
the simple origin-centered ordering does not resolve the target speed gap.

Preserve the successful small-radius prefix. When exact certification cannot
obtain a unit witness, resume a larger search with the same resident exact
state. Do not discard the small search's successful cases by globally replacing
its policy. Center-out, bounded enumeration should avoid scanning a much larger
box before reaching useful short vectors. A repeated generator or its rational
multiple should not consume scarce relation-tail space unnecessarily: PARI
normalizes generator content, whereas the raw native capture includes both
$a+4$ and $2a+8$. Any normalization experiment must retain exact principal
relations and must not conflate equal exponent rows with equal generators.

The next implementation must explain and eliminate the observed resource
exception and lost acceptances under unchanged limits, before controlled `opt`
timings, public receipts, exact replay, or holdout qualification.

## Reproduction and evidence

The builders take a built worktree root and a fresh disposable directory:

```sh
node bench/class-unit-groups/diagnose-cubic-twelve-ideal-build.cjs ROOT FRESH_DIR
node bench/class-unit-groups/diagnose-cubic-relation-capture-build.cjs ROOT FRESH_DIR
node bench/class-unit-groups/diagnose-cubic-relation-capture.cjs CAPTURE_BUILDS_JSON
node bench/class-unit-groups/diagnose-cubic-raw-relations-gp.cjs CAPTURE_JSON GP
node bench/class-unit-groups/diagnose-cubic-radius-build.cjs ROOT FRESH_DIR
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs BUILDS_JSON [FROZEN_CORPUS_GZ]
```

The radius manifest's record named `baseline` means **original ordering with
the experimental enlarged radius**, not unchanged production. The ablation
runner authenticates each source copy, checks accepted answers, records declined
outputs/exceptions, and does not emit public receipts or timing claims.

Source baseline SHA-256 remains
`678630a3a68b436e71a34966576baa71a1fe6b645ec5f845cabb4f94cdef2447`.
The native mathematical source and its production artifact are unchanged.

Retained local evidence under `build/cubic-next-evidence/`:

- `raw-plans-first-retry.json`:
  `59cde8a65fac83b089084c6c3921d9649a82c2bb9fd9c521ab13cfaeb8e5100c`.
- `raw-plans-first-retry-gp.json`, including executable GP oracle programs:
  `1543ab4cb9bf6847609983b56aff5cded0481df5727ec5d6cfa5ad07e31a1435`.
- `pari-first-retry-generators.trace`:
  `d1c095fffe2546b0bf8c1efb8c7e94642adfaddb2f58a2453e7ad1b91f21b62c`.
- `twelve-ideal-smoke.json`, `radius-smoke.json`, and
  `radius-frozen-discovery.json`: full direct-call outputs and identities.

The [forensics evidence archive](https://github.com/sagemathinc/sagejs/releases/download/cubic-unit-search-forensics-20260908/cubic-missing-unit-forensics-20260908-v2.tar.gz)
also includes the four-way frozen survey and the instrumented source copies.
Archive SHA-256:
`dc92eb14a984380a8cb808e55c813cd7d6146f27e8e20e16c9fd6289c5ce9709`.

Focused transform-policy tests and `pnpm architecture:check` pass.
`pnpm parallel:check` still reports the inherited 395-live-task ambiguity;
metadata was not altered to conceal that failure. This diagnostic change is
not a completed release gate for PR190.
