# Row 23 output-evidence v2 phase-3 proof and remaining gap

## Result

Row 23 still cannot publish a complete
`sagejs.pari-class-group/class-unit-output-evidence-v2` payload.
`row23_output_evidence_v2.cjs` therefore emits an authenticated, canonical,
machine-readable **gap assessment**, not a complete v2 result.  The important
change is that its presentation phase is now truthfully complete.

The assessment is bound to the retained terminal source
`fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318`,
the neutral correspondence
`5e993b9b3434c9e097531a34254bce07a832e6e4f436a45c4ae77e3ad69d4f8c`,
and a transaction-local branded fresh-prepared receipt. It additionally
requires raw Smith proof authority
`d81fd9858417a3f13ec6c65bf5de535923cfe5bdc19090755f2178ebea7ba350`,
derived from the same-run relation/HNF owner. Freshness is not inferred from
detached files.

## Exact semantic gap

The source retains the actual collection as:

```text
factor-base ideals       31 x 25 coordinates
relation matrix          40 x 31 (stored column-major as 31 x 40)
principal generators     40 x 5
```

The shared v2 schema ties a presentation proof to those dimensions. The new
raw Smith producer supplies exactly the required proof:

```text
U  40 x 40
W  40 x 31
V  31 x 31
D  40 x 31
```

The proof contains 2,227 primitive row/column operations. The adapter starts
again from `W` and identity matrices, checks 2,164 explicit determinant-one
Bezout certificates, replays every operation, and compares the resulting
`U`, `V`, and `D` byte-for-byte. It also binds `W` to the exact 1,240 entries
from the authenticated retained source. This independently proves
unimodularity and `U W V = D`; the diagonal has 30 ones followed by 6.

The source separately retains a valid compressed cyclic terminal proof
`U=[1]`, `W=[6]`, `V=[1]`, `D=[6]`. The assessment continues to distinguish
that useful terminal object from the raw rectangular proof. It never relabels
the 1-by-1 proof as the original relation system.

The shared v2 `smith_uwvd` variant supports these exact rectangular shapes, so
the assessment now sets `phase3Complete=true`. No schema extension is needed
for the presentation. It records both raw and compressed presentations as
distinct evidence and separately replays the useful retained terminal state:

- cyclic class group `C6`, its ideal, and exact principal-order witness;
- all four compact unit transforms and logarithms;
- four exact integral-basis units and their exact norms;
- torsion; and
- the 256-bit PARI-packed accepted regulator state, explicitly not a rigorous
  enclosure.

The source still lacks a per-relation log matrix with a v2-compatible 40-row
shape. Factor, reduce, and combine maps are also absent. Those four objects
are now the complete missing list. Therefore phase 5 and the output boundary
remain false. No public, timing, or qualification claim is made. The canonical
assessment digest is
`fd26d09f1650d10e3d1f7f4e67091aa7eb850b2c92a6811161def1020af353a6`.

## Focused check

The checker starts from the immutable prepared-only row-23 corpus item,
recomputes the factor base and relations, and produces the raw Smith proof
before the live owner leaves the process. The adapter independently replays
that proof. The checker then binds all raw-presentation evidence digests,
replays the compressed identity without confusing its dimensions, checks all
four exact-unit slices and norms, confirms that the remaining gap assessment
is rejected by the complete-v2 validator, and covers source, receipt, proof,
claimed publishability, relation-count, and phase-5 mutations.

Run:

```bash
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-native-cache-row23-output-v2 \
SAGEJS_NATIVE_CACHE_ROOT=/scratch/sagejs-native-cache-row23-output-v2 \
node bench/pari-class-group-port/check_row23_output_evidence_v2.cjs \
  /scratch/sagejs-row23-final-result-correspondence-v3/row23-final-fbd08bfcdac231240ab6085aa7eff96d4f261cedfd37b647024494fa2384a318.json.gz
```
