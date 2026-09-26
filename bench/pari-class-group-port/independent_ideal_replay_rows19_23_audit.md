# Detached ideal-generator replay: rows 19 and 23

This lane asks a narrow question: after discarding every live owner and every
publisher object, can a cold verifier prove the published class-generator
orders from the durable data alone?

The verifier is
[`independent_ideal_replay_rows19_23.py`](independent_ideal_replay_rows19_23.py).
It does not run either fresh transaction, call either result publisher, or read
a frozen PARI answer.  The checker starts a new Python process and gives it only
the named detached artifacts.

## Result

| row | retained cold replay | result |
|---:|:---|:---|
| 19 | all nine Smith/presentation order witnesses; all nine exact `R*c=n*f` combinations over the 424 by 430 relation matrix; all 3,180 nonzero factors in the nine signed principal products | **partial** |
| 23 | cyclic Smith presentation; exact 31 by 40 relation combination; 22-factor signed principal product; expansion of `alpha`; six degree-five ideal products; independent equality `J^6=(alpha)`; published reduced ideal | **complete** |

Row 23 therefore has a genuinely detached exact order-six ideal witness.  The
degree-five arithmetic is reused as arithmetic only; the cold verifier does
not invoke the final-result verifier or trust its booleans and stored power
chain.

Row 19 must not be promoted to the same status.  Its neutral result retains the
full relation matrix, relation generators, factor base, nine coefficient tapes,
and nine published reduced ideals.  It does **not** retain:

1. the integral-basis multiplication tensor needed to check each raw
   principal equation and multiply cubic ideals; or
2. the exact reduction linkage from each factor-base request to the published
   reduced generator HNF.

Consequently the verifier reports `blocked-by-retained-semantics`, with zero
published ideal-order identities replayed.  The nine factored principal
elements are exactly assembled from the retained relation generators, but that
is not mislabeled as a proof that their principal ideals equal the relation
products.

## Adversarial checks

The focused checker rejects four coordinated mathematical mutations:

- one row-19 relation cell;
- one row-19 order coefficient inside the canonical witness bytes;
- one row-23 order coefficient; and
- one row-23 published generator-ideal entry.

Run it against a durable row-19 neutral envelope and a detached row-23 final
source envelope:

```bash
node bench/pari-class-group-port/check_independent_ideal_replay_rows19_23.cjs \
  ROW19_RESULT.json ROW23_FINAL_SOURCE.json.gz
```

No timings or public-completeness claim are made.
