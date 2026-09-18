# Independent class-generator replay audit

The Phase-5 gate requires more than a publisher hash: every published class
generator `I` and order `n` must carry an exact principal witness for `I^n`,
and a cold verifier must be able to replay the mathematics from retained data.
This audit distinguishes three materially different claims:

1. the producer checked an exact ideal identity before publication;
2. the neutral result retained enough mathematical data for a detached replay;
3. an independent verifier actually performs that detached replay.

## Current fresh-row matrix

| row | class group | producer-side exact status | detached neutral replay status |
|---:|:---|:---|:---|
| 0 | trivial | vacuous | vacuous |
| 1 | `C3` | `P^3=(alpha)` is replayed with cubic ideal arithmetic | blocked: neutral result omits the multiplication tensor, factor base, and raw relations |
| 3 | `C6` | all used raw principal equations and the sixth ideal power are replayed | blocked: neutral result retains the compact tape but omits the multiplication tensor, factor base, and raw relations |
| 6 | `C2 x C2` | both square witnesses replay | **complete**: the new cold verifier replays 884 used principal equations, both order relations, and both published generator ideals from neutral storage |
| 8 | trivial | vacuous | vacuous |
| 13 | `C2` | all raw quartic principal equations and the square witness replay | blocked by one omitted owner: `field-multiplication-table` |
| 14 | `C8 x C24` | the raw presentation/order combinations replay, and raw relations are authenticated | incomplete: the neutral payload has raw arithmetic owners, but does not retain the two Smith quotient vectors/reduction multipliers needed to link the published reduced ideal HNFs to those order tapes |
| 19 | `C3^8 x C6` | nine presentation and factored principal witnesses are produced | blocked: neutral storage omits the integral-basis multiplication table and independently replayable reduction linkage for the nine published reduced ideals |
| 20 | trivial | vacuous | vacuous |
| 21 | trivial | vacuous | vacuous |
| 23 | `C6` | the final source owner expands the principal generator and replays the degree-five ideal identity | self-contained source bytes are retained, but the neutral cold verifier currently authenticates their authority rather than independently rerunning the degree-five identity |

Thus all four fresh trivial-class rows are already mathematically complete for
this requirement, and row 6 is now independently replayable from the published
neutral payload. The other six nontrivial rows must not be counted as satisfying
the strict detached-replay gate merely because their producer checked an identity
or their envelope hashes are authentic.

## Implemented cold verifier

[`independent_class_generator_replay.py`](independent_class_generator_replay.py)
is deliberately row-neutral within its retained layout. It consumes the neutral
payload, replays every raw principal relation actually used by an order tape,
checks `R*c = n*f` over the full factor base, reconstructs each published
generator ideal from its exact factor map, and keeps the principal element as a
signed factored product. It calls no row-specific publisher and reads no frozen
PARI answer.

On the durable fresh row-6 result it reports:

```text
factor-base ideals                 1130
raw relations                     1137
used principal equations replayed  884
generator order relations             2
exact ideal multiplications         6202
```

The focused checker also mutates one order coefficient and one published ideal;
both coordinated mathematical mutations fail independently of envelope hashes:

```bash
node bench/pari-class-group-port/check_independent_class_generator_replay.cjs \
  /scratch/sagejs-row6-fresh-registry-O0wYh2/\
row6-prepared-complete-b3bfd9122875729853f0421ab5ffe6220f161f07add30a9753eb79df784dad73.json
```

## Smallest completion proposal

Do not build a second general class-group engine. Extend the neutral storage
contract with the few exact owners which the existing producers already have:

1. rows 1, 3, 13, and 19: retain the integral-basis multiplication tensor plus
   the factor-base/raw-relation owners required by the compact order tapes;
2. rows 14 and 19: retain each generator's factor-base request and the exact
   principal reduction multiplier which links that request to the published
   reduced ideal HNF;
3. row 23: extract the existing degree-five arithmetic replay into a small
   publisher-independent verifier and run it directly on the retained source
   envelope bytes;
4. extend this verifier by degree (`3`, `4`, then `5`) and require a cold replay
   receipt before the fresh registry may count a nontrivial class group toward
   Phase 5.

This is bounded: it reuses already implemented arithmetic, changes retention
rather than algorithms, and makes the remaining failures explicit missing-owner
errors instead of trusting publisher-local booleans or hashes.
