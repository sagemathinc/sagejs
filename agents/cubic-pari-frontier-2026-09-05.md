# Complex-cubic campaign checkpoint: 2026-09-05

Status: active; corpus-wide PARI parity has not been achieved.

This checkpoint supplements
[the campaign plan](cubic-number-field-class-group-pari-frontier-plan.md).
The current coverage corpus is the frozen 1,000-field survey documented in
[the corpus guide](../bench/optimization-engine/complex-cubic-frontier-corpus.md),
not the earlier 60-field tuning population in the original plan.

## Retained baseline

Source: `cf1307beb646e0a8cd4c7071fc512f7992c2bf05`.
Authenticated runtime closure:
`a712274c99e448d0289cf2bfc5431bb263756bc9c873a209b44cc6570298f348`.

Dedicated `opt`, Linux x64 AMD EPYC 7B13, Node 26.7.0, PARI/GP 2.17.4,
automatic qualified integer backend, identical conditional-GRH requests.
The census has 1,000 authenticated native passes, exact agreement with PARI,
and ordinary-object exact replay. Retained timing uses eleven rounds of
twenty shards for each boundary, at least 1.2 seconds per timed root,
CPU affinity, fresh processes, and rotating system order.

| Boundary | Paired-shard geometric-mean Sage.js/PARI ratio |
| --- | ---: |
| Scalar prepared | 5.32736 |
| Fresh complete | 14.5833 |

These measurements precede the online trivial-quotient and support-transcript
changes. They are not measurements of the current branch.

Raw evidence on `opt`:

- `/home/user/frontier-results/cf1307be-auto/census.json`, SHA-256
  `b131092d49224ffcd4b5e5ec7455abd1a136115e81b2908995ff40819122a6e5`;
- `/home/user/frontier-results/cf1307be-auto/timing.json`, SHA-256
  `3b44d8e67f055210d9ea452c6d76789d95783bb332f19086b2be6d4f0065fee7`.

Both files are published as content-addressed gzip assets in the
[retained baseline release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-frontier-baseline-cf1307be).
The hashes above identify decompressed bytes. Keep large evidence outside Git;
local scratch copies are convenience caches, not the only retained copy.

## Integrated intervention awaiting controlled measurement

Online prefix-HNF support reuse preserves the original principal elements and
the exact compact relation lattice. The proof and regression witness are in
[the mathematical justification](../docs/complex-cubic-native-class-group-proof.md).

For C15 field `3.1.83062751.1`, a local shared-host ABBA diagnostic measures
26.078325 ms before versus 23.854329 ms after: 1.093232× speedup. The
42-row transcript is byte-identical and passes independent replay. Reproduce
with `node bench/cubic-online-support-transcript.cjs OLD_ROOT NEW_ROOT` and
source-matched production packs. This boundary excludes host preparation and
retries and is not a controlled PARI comparison.

The small-unit route retains its tall HNF; reuse of a square HNF there was
rejected after a shape regression. The early GMP checkpoint includes resident
FLINT children, with a measured 3 MiB qualified cap and correct Python
`MemoryError` fallback on exhaustion. Semantic arena capacity remains separate.

## Next selected field

The retained baseline selects `3.1.12716.2`, with polynomial
$x^3-x^2-11x-63$, class group $C_3$, and field discriminant $-12716$.
Its equation-order index is $3$, since its polynomial discriminant is
$-114444=9(-12716)$.

Important metadata correction: the frozen corpus projected LMFDB's `index`
as `equation_order_index`. LMFDB's value is the gcd over integral primitive
generators, not the index of the displayed generator. Preserve frozen bytes,
identities, fields, and timing protocol; use separately derived exact indices
for structural analysis. See the
[LMFDB definition](https://www.lmfdb.org/knowledge/show/nf.zk_index).

Local PARI 2.17.1 forensics finds eight factor-base ideals, three rational
relations, three small-norm lattices, thirteen candidate vectors, and fourteen
retained relations; no random search is needed. Local instrumented native
prefix measurements put the total around 4.07 ms, spread over field/order
analysis, generator bounds, relation collection, unit recovery, and rigorous
analytic certification. These are diagnostic measurements, not retained `opt`
evidence or additive substitutes for an inclusive timer.

Current effort 5 collects thirty rows before compaction. Forced effort 3
succeeds with fourteen rows at roughly 3.67 ms on the same shared host.
The next hypothesis is in-call staged collection: attempt exact closure at an
initial relation budget, preserve the search cursor and workspace, and continue
only if the existing rank/unit/analytic certificate is insufficient. Choose
budgets from development evidence and freeze them before held-out measurement.

## Continuation invariants

A future in-call continuation must preserve more than the relation matrix:

- Keep field/order analysis, factor base, exact arithmetic workspace, and
  search position live. Avoid a host retry that reconstructs this prefix.
- Only a successful existing exact certificate permits early publication.
  Rank, missing-unit, and analytic-index failures may authorize more work;
  resource or arithmetic failures must fail closed.
- Separate stage-local search flags from accumulated unit-proof evidence.
  Carrying `unit_found` unchanged can suppress later compound searches.
- Preserve principal-element witnesses. Equal valuation rows can encode a
  useful unit quotient and must not be deduplicated merely as equal rows.
- Combining earlier and later units must reconstruct their generated subgroup
  exactly; preserving only one unit can lose saturation information.
- Replay must reproduce the adaptive path, not assume that the final successful
  effort was run alone. Publication records the accepted path unambiguously.
- GMP checkpoint use is monotone until rewind. Do not reuse scratch storage
  without explicit ownership and promotion rules for surviving exact objects.

## Next gates

1. Finish integrated build, generated audit artifacts, focused regressions,
   architecture audit, and full native validation.
2. Build a clean candidate on `opt`; run the authenticated 1,000-field census.
3. Run retained timing on that exact artifact with unchanged population and
   boundary protocol. Report regressions and declines as well as gains.
4. Use the corrected structural metadata and new timing to select the next
   bottleneck. Implement staged native continuation only with exact replay and
   representative old/new measurements.
5. Freeze the next intervention before checking at least twenty previously
   unseen neighboring fields; do not reuse already exposed holdouts as unseen.
