# Authentic h=1 exclusive stage timing contract

This contract prepares, but does not run, the first end-to-end stage timing of
the authentic field `x^3 - 20018*x + 20034`. It is diagnostic infrastructure;
the schema fixes `qualifiedTiming` and `qualifiedForFinalTiming` to `false`.

## One clock, one active category

`ExclusiveStageTimer` owns one inclusive monotonic wall-clock root. At every
instant inside that root exactly one of five categories is active:

1. `relation-retry`;
2. `sparse-hnf-snf-transform`;
3. `unit-regulator`;
4. `honesty-generators-final`; or
5. `unattributed-remainder`.

Changing stages closes the previous half-open interval and starts the next at
the same timestamp. The receipt retains every interval as a root-relative
segment. Validation requires the segments to be ordered, positive, gap-free,
nonoverlapping, and to cover the root exactly. It independently recomputes
stage totals from those segments and requires their sum to equal the root.
Repeated visits during retries are legal and remain disjoint. Consequently a
nested timer can never be summed into its parent and counted twice.

The residual category starts at root entry and is selected again whenever work
is outside a named stage. Timer-read calibration is recorded separately but is
not subtracted after seeing results. Clock reads inside the root therefore
remain honest measured overhead in the currently active category.

## Exact gap accounting

Each diagnostic pair has one Sage.js arm and one PARI arm in the predeclared
alternating `AB`, `BA` schedule. Repetition counts may differ. For stage `i`,
the per-call gap is represented with a shared exact denominator:

```text
gap_i numerator = sage_i * pari_repetitions
                - pari_i * sage_repetitions
common denominator = sage_repetitions * pari_repetitions
```

The verifier requires the five exact stage-gap numerators to sum to the root
gap numerator. Thus every nanosecond of the root gap has one category and no
category overlaps another.

For a pair with a positive root gap, the reported attribution fraction is

```text
sum(max(named_stage_gap, 0))
-----------------------------------------------
sum(max(named_stage_gap, 0)) + max(residual_gap, 0)
```

This measures what fraction of the observed positive slowdown burden belongs
to named stages. Faster named stages remain visible as signed gaps but cannot
cancel an unexplained positive residual and manufacture attribution. A pair
with no positive root gap reports `null`. The receipt summary is the
predeclared median of non-null fractions across at least seven alternating
pairs. Raw exact pair decompositions remain in the receipt.

This definition is deliberately distinct from `named_gap / net_root_gap`,
which can exceed one when one stage is faster, and from summing old nested
timers, which double counts work.

## Matched-result and provenance gates

Every pair must have identical result, replay, RNG-state, and source-work
digests across Sage.js and PARI. The receipt pins the shared seed, integration
commit, root source,
generated Sage.js source, Sage.js object, PARI library, and PARI executable.
The final runner must additionally satisfy the repository's quiet-host,
pinned-core, lock, warmup, and minimum-duration qualification contract. Those
host rules are intentionally not duplicated here.

Run the contract-only check with:

```bash
node bench/pari-class-group-port/check_h1_exclusive_stage_timing.cjs
```

The check uses a deterministic injected clock. It performs no performance
measurement and reports `finalTimingRun: false`.
