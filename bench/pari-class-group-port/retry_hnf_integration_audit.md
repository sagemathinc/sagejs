# Resident retry/HNF integration audit

PARI 2.17.4, the four declared tuning polynomials, prepared `nf` at 192
bits, unchanged `Buchall_param(nf,0,0,BNF_RELPID,0,192)` policy. Diagnostic
source tracing and CPython replay, not a timing or certification claim.

## Finding

The existing `pari_hnfadd` handles **all six actual quartic append stages**.
Every H, dependent-row matrix, B, seven-field C and permutation matches the
full PARI driver exactly under CPython. No modular-rank, CUP, or exact-product
frontier is reached by these appends. The remaining immediate work is resident
state plumbing and the source next-pass collection policy, not another HNF
algorithm. The subsequent connected gate below covers these actual appends
under native GMP, in addition to CPython.

| Field | cache.chk → cache.last | HNF retained rows × new-plus-H columns | Output H rows | Unit columns | Acceptance |
| --- | --- | --- | --- | --- | --- |
| 2 | 150 → 151 | 0 × 1 | 0 | 8 | RELAT (1) |
| 2 | 151 → 152 | 0 × 1 | 0 | 9 | accepted (0), h=1 |
| 3 | 293 → 295 | 6 × 6 | 5 | 7 | RELAT (1), tentative h=96 |
| 3 | 295 → 299 | 5 × 9 | 3 | 11 | RELAT (1), tentative h=8 |
| 3 | 299 → 300 | 3 × 4 | 3 | 12 | RELAT (1), tentative h=8 |
| 3 | 300 → 303 | 3 × 6 | 2 | 15 | accepted (0), h=4 |

Field 3 j=1 produces no new relations at all: keep `cache.chk=cache.last=293`,
do not call HNF or acceptance, and continue the source collector with need=2.
Field 2 begins with 150 relations and an already complete ideal lattice but
an index-two unit lattice: the accepted regulator exponent becomes 27 rather
than the multiple's 28. Field 3 has two missing ideal rows after initial HNF.
All passes remain at 192 bits; neither field enters random relations,
factor-base enlargement, or the precision-rebuild path in this trace.

## Minimal connector

1. Retain collector records, generators, metadata, admission basis/missing
   count, target/end, and all source next-pass state. Separately retain H, dep,
   B, transformed C, permutation and full original embedding cache `embs`.
   Transformed C is **not** a replacement for original `embs`.
2. After an actual source collector pass, if `last==chk`, do not invoke HNF.
   Otherwise form `mat` from records `(chk,last]`. Append original weighted
   logarithms for these generators to `embs` in the source order.
3. Set `new_columns=last-chk`, `E=embs[chk:last]` in zero-based notation.
   Source writes this as `vecslice(embs,k-l+1,k-1)` with
   `k=lg(embs)` and `l=last-chk+1`. Existing C has exactly `chk` columns;
   after append it has `last` columns. Pass all seven fields of complex/real
   entries without converting to float or dropping imaginary parts.
4. Invoke `pari_hnfadd` with old H/dep/B/C and disjoint result owners. Publish
   new owners and dimensions only on status0, then advance `chk=last`.
   Preserve raw frontier status if nonzero; never interpret partial scratch.
5. Recompute `need=KC-h_rows-b_columns`, then account for a unit-column
   shortage as in the source. Do **not** invoke acceptance while this source
   dimension need is positive. Reconstruct `F.L_jid`/sorting/rotation and
   `squash_index` through the source caller policy; do not substitute merely
   a fixed target increment.
6. When dimensions are ready, feed native H/C into existing
   `pari_post_hnf_acceptance`. Keep `old_cache` distinct from HNF `chk`:
   source updates `old_cache=last` immediately before `compute_R`, even if
   reconstruction rejects. Hence another collection pass without an append
   is not a fresh reconstruction attempt. The acceptance wrapper action5 is
   source `fupb_RELAT` code1 and requires need=1; action6 is PRECI, not another
   relation request. Lambda/NULL-R/unchanged-cache exits remain separate.
7. Preserve the rejected reconstruction's multiple/coordinates as diagnostic
   state, not a published result. Publish final reconstructed R/L and class
   invariants only on acceptance0. The L shown by a failed source call must
   not be consumed as accepted output. Existing single-attempt wrapper's
   terminal rejection state must not be confused with this resident loop.

Current acceptance preparation eagerly forms `h*invhr`; this remains a
documented placement difference from the source, not matched-work timing.
Precision failures would require source `flag=0` behavior: recompute embeddings,
restore original permutation, set `chk=base`, clear W and redo initial HNF.
That path is **not** exercised or authorized away by this bounded connector.
Honesty, final unit materialization/maps and general retry coverage remain
outside an accepted class-invariant diagnostic.

## Evidence and reproduction

`check_actual_hnfadd_inputs.cjs` extends the pristine archive full-driver
checker with read-only pre/post append events and the reconstruction lattice.
Instrumentation preserves `avma`; source decisions are untouched. It accepts
the same `--field0` through `--field3` selection. It writes full `trace.json`,
stdout/stderr and `hnfadd-replay.json` under the reported temporary directory.
The CPython replayer feeds genuine source stage inputs to the existing helper,
then compares all exact output matrices against the next full-driver event.

- Field 2: `/tmp/sagejs-default-driver-9VENBy/trace.json`;
  instrumented source SHA256
  `6a37fa581ae8fec3663446d22d6cc852c3b36e03ff508596689e00d19313b43a`.
- Field 3: `/tmp/sagejs-default-driver-GGNcnA/trace.json`;
  instrumented source SHA256
  `54d285335961451e1a55a37a0681d1fb714733fade770cd7b6d1d09df106e304`.

Run through the campaign meter:

```sh
node bench/pari-class-group-port/check_actual_hnfadd_inputs.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz --field2
```

Replace `--field2` with `--field3` for the other quartic. The source compiler
uses UBSan. Temporary paths are evidence locations, not persistent inputs or
class-answer fixtures for the implementation.

## Connected append/acceptance qualification

`connected_hnfadd_acceptance.py` composes existing hnfadd, dimension bridge
and regulator acceptance without implementing a retry policy. The bridge runs
once. Only after its need is zero does the connector initialize the regulator
multiple's in/out need to zero, matching the source caller. Prior input H/D/B/C
are preserved; new HNF output remains available after regulator rejection.
Regulator/L are candidate output owners, not overwrites of a published result.

`check_connected_hnfadd_acceptance.cjs` passes all six source-produced append
stages under CPython and GMP, with exact H/D/B/C/perm and accepted regulator/L
comparison against the full driver. Additional controls cover unchanged-cache,
empty-append and dimension need; two atomic CP state guards pass. JavaScript
qualification here is limited to empty/dimension gates (two cases), not the
large actual appends. This is not a full native-produced collector chain yet.

- Artifact: `/tmp/sagejs-connected-hnfadd-acceptance-48aiNY`.
- Trace: `ea81af743194bcd330ef4d1da32143b51f1ca2b62e9bd9209b8039fd2d7f0121`.
- Core: 23,474,550 bytes; no host callbacks in emitted core.
- Cache: `3dfdcd21d2ea862b24e6f69a748e00ea347a78515cb393cb047691409924f0f9`.
- Source inputs with exact newly collected generators/search permutations:
  `/tmp/sagejs-default-driver-eot7pJ/trace.json` and
  `/tmp/sagejs-default-driver-5In4kt/trace.json`.
- Actual analytic normalization:
  `/tmp/sagejs-analytic-invhr-d88QqB/fixtures.json`.

### Harness resource failure and correction

An initial diagnostic incorrectly treated `createIntegerBuffer`'s second
argument as bits rather than **64-bit words**. Passing 4096 caused about 24GB
peak RSS, breaching the intended resource cap. It was terminated without a
native validation receipt. A later wall-capped run also failed to complete.
These are retained in the campaign CPU ledger, not counted as passes.

The corrected checker uses 64 words, explicitly audits CP output bit lengths
(maximum 320 here), estimates packed allocation per case (95–192MB for actual
appends, largest 192,008,340 bytes), and refuses Linux execution without an
address-space limit at most 4GiB. The successful run used
`prlimit --as=4294967296`, `NODE_OPTIONS=--max-old-space-size=1536`, peaked at
901,696KiB RSS and consumed 20.034150 child CPU seconds. The source mathematical
workloads were not reduced; the packed-buffer capacity units were corrected.
The 300-second local task allowance was exceeded by 5.457805 CPU seconds before
the explicitly authorized additional bounded validation. No timing claim is
based on this diagnostic or its oversized uniform scratch allocations.
