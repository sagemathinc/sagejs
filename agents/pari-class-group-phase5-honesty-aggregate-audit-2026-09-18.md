# Phase-5 honesty aggregate correctness gate

`bench/pari-class-group-port/check_phase5_honesty_coverage.cjs` is a new-file-
only aggregate gate for the honesty requirement in Phase 5 of
`pari-class-group-end-to-end-native-plan.md`. It changes no field population,
reserve, registry, row implementation, fixture, or result composer.

## What the gate proves

The gate authenticates the PARI 2.17.4 archive and pristine `buch2.c`, checks
the honesty-specific identities and policy in the frozen Phase-1 ladder, and
then executes three distinct outcomes:

1. **Equal-bound source skip.** The authenticated source predicate derives
   `equal-bound-source-skip` and performs no probes or RNG draws.
2. **Unequal-bound all-failure transaction.** The connected translated graph
   recomputes 51 collector failures and 50 random ideal products, reaches the
   source-required restart outcome, and agrees under CPython, JavaScript, GMP,
   and tagged execution.
3. **Predeclared unequal-bound success.** Frozen panel row 21,
   `36 + 930*x - 305*x^2 - 90*x^3 + x^5`, runs at correctness-only bounds
   `C1=5`, `C2=31`. Sage computes six successful collector observations from
   prepared owners without receiving PARI's status vector or branch answer.
   The translated scheduler consumes all six, increments `KCZ` three times,
   terminates, and restores `KCZ` from 6 to 3. Three transactional mutations
   are rejected.

The aggregate record labels that third outcome `extended-complete`. This label
is deliberately **branch-local**: it means that the selected, predeclared
unequal-bound immediate-success corridor is complete from prepared arithmetic
owners through scheduler restoration. It does not promote row 21 into the
performance population and does not claim that general honesty is complete.

## Exact remaining gap

General `be_honest` remains partial in precisely these source corridors:

- nontrivial automorphism-orbit discovery and simultaneous orbit removal;
- a successful computation after one or more failed probes and random ideal
  products; and
- successful paths requiring `Q_primpart` or high-bit `idealred`.

Those paths have no existing successful end-to-end Sage evidence that can be
honestly reused by this lane. The aggregate gate therefore reports
`generalImplementationComplete=false` and retains all three frontiers. It also
reports `performancePopulationCoverage=false`: the row-21 success uses custom
bounds and is correctness-only under the frozen promotion policy.

No timing is performed or claimed.

The old all-purpose Phase-1 ladder checker is not used as a prerequisite: it
also pins an unrelated qualification-manifest hash which changed when untimed
development qualification execution was added. The aggregate gate instead
authenticates the unchanged panel, selected fixture, live checker, bounds,
status, and remaining-frontier list directly from the ladder.
