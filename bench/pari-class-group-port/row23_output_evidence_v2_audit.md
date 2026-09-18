# Row 23 output-evidence v2 gap

## Result

Row 23 cannot yet publish a semantically valid
`sagejs.pari-class-group/class-unit-output-evidence-v2` payload.
`row23_output_evidence_v2.cjs` therefore emits an authenticated, canonical,
machine-readable **gap assessment**, not a v2 result.

The assessment is bound to the retained terminal source
`fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318`,
the neutral correspondence
`5e993b9b3434c9e097531a34254bce07a832e6e4f436a45c4ae77e3ad69d4f8c`,
and a transaction-local branded fresh-prepared receipt. Freshness is not
inferred from detached files.

## Exact semantic gap

The source retains the actual collection as:

```text
factor-base ideals       31 x 25 coordinates
relation matrix          40 x 31 (stored column-major as 31 x 40)
principal generators     40 x 5
```

The shared v2 schema ties a presentation proof to those dimensions. A Smith
proof for that relation system would require:

```text
U  40 x 40
W  40 x 31
V  31 x 31
D  40 x 31
```

Those raw transforms are not retained. The source instead retains a valid
compressed cyclic terminal proof `U=[1]`, `W=[6]`, `V=[1]`, `D=[6]`. It would
be incorrect to relabel that 1-by-1 proof as the original 40-by-31 relation
system. The source also lacks a per-relation log matrix with a v2-compatible
40-row shape.

The gap assessment records the actual 40-by-31 collection and the compressed
1-by-1 proof as distinct evidence. It sets `publishableAsV2=false`,
`phase3Complete=false`, and names every missing raw transform and relation-log
object. It separately replays the useful retained terminal state:

- cyclic class group `C6`, its ideal, and exact principal-order witness;
- all four compact unit transforms and logarithms;
- four exact integral-basis units and their exact norms;
- torsion; and
- the 256-bit PARI-packed accepted regulator state, explicitly not a rigorous
  enclosure.

Factor, reduce, and combine maps are all absent. Therefore phase 5 and the
output boundary remain false. No public, timing, or qualification claim is
made.

## Focused check

The checker binds evidence digests independently to the retained source,
replays the compressed Smith identity without confusing its dimensions,
checks all four exact-unit slices and norms, confirms that the assessment is
rejected by the publishable v2 validator, and covers source, receipt, claimed
publishability, relation-count, phase-5, and shape mutations.

Run:

```bash
node bench/pari-class-group-port/check_row23_output_evidence_v2.cjs \
  /scratch/sagejs-row23-final-result-correspondence-v3/row23-final-fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318.json.gz
```
