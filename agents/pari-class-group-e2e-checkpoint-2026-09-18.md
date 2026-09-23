# PARI class-group end-to-end checkpoint — 2026-09-18

This checkpoint records the first complete fresh-prepared development aggregate
and the exact-output advances immediately surrounding it. It supplements, rather
than replaces, `pari-class-group-e2e-checkpoint-2026-09-17.md`. The campaign is
still active and has not reached a Phase-6 A/B/C/D timing decision.

## Complete 16-row correctness aggregate

All frozen non-reserve development rows
`[0, 1, 3, 4, 6, 8, 10, 11, 13, 14, 16, 18, 19, 20, 21, 23]` now execute from
their authenticated normalized prepared-number-field inputs in distinct
resource-bounded children. The common registry admission requires exactly the
22 reviewed prepared keys, reruns the mathematical prepared-NF authenticator,
and binds its digest to the selected row before invoking the private runner.

The first complete sequential aggregate passed under the per-row 4 GiB address
space, 600 CPU-second, 600 wall-second, and 1 GiB file bounds. Every row reported
`correspondenceComplete=true`, `publicComplete=false`, no W0 mathematical runtime
input, no retained answer owner, and no timing claim. The immutable receipt is:

- `/scratch/fresh-prepared-development-aggregate-v1-20260918.json`;
- file SHA-256
  `7c8b9ca9cf8db44a7a1860c0a702c3d6bceb73af2578a85b665d848f2604471e`;
- canonical aggregate SHA-256
  `8eb14e33dff10ea7c9e99e7c619d8b4cc43dc2cbf18c7bda1f10fe1523be041c`.

The independent aggregate checker rebound all 16 corpus identities and prepared
authorities, recomputed the canonical digest, rejected three input/admission
mutations, and reported `aggregateReceiptVerified=true`. No temporary child tree
survived success.

The first attempted aggregate correctly failed closed at row 21 because a fresh
unit owner did not equal a historical source-sensitive pin. Rows 21 and 23 now
carry explicit same-run authorities containing both owner and canonical-content
digests through final assembly and cold replay. Historical default transactions
remain byte-identical and pinned; changed owner or content digests reject.

## Exact output-evidence advances

- Row 0 has a full `73 x 73`/`73 x 66`/`66 x 66` raw Smith proof and now a
  detached rigorous conditional unit-saturation proof. The authenticated
  phase-three class-number-one presentation, exact units, regulator enclosure,
  and Belabas--Friedman zeta enclosure prove unit index interval `[1,1]`.
  Phase 4 is complete at this evidence boundary. The factor-base generation
  theorem and general class maps remain explicit public-completion gaps.
- Row 14 now retains the complete `806 x 806` left transform, `806 x 799`
  diagonal, and `799 x 799` right transform. Independent replay checks all
  643,994 cells of `U R V = D`, with determinants `-1` and `-1`, invariant
  factors `[8, 24]`, and class number 192. The regenerated ancestry stays below
  4 GiB and has maximum coefficient size 62 bits.
- Row 19 now factors arbitrary integral and fractional cubic ideal HNFs whose
  complete prime support lies in the retained 424-prime base, computes exact
  Smith coordinates, retains signed principal-relation witnesses, and replays
  reduction and combination. Its internal v2 phases 3--5 and output boundary
  are complete. Ideals containing unsupported prime factors reject.
- Row 21 has an independently replayed bounded arbitrary-ideal semantic oracle
  backed by pristine PARI 2.17.4, but it deliberately reports `nativeMap=false`:
  the native SPLIT/extended-ideal-reduction tape is not yet retained.
- Row 23 has a full raw Smith proof and a genuine prepared-only terminal
  transaction. Its relation-log and native arbitrary-map output material remain
  active gaps at this checkpoint.

None of these internal correspondence results is thereby a public certified
`ClassUnitComputation`. Conditional PARI policy, correspondence, or an internal
phase completion cannot substitute for the public factor-base theorem,
saturation, replay, and map contracts.

## Validation state

The final combined tree passed:

- the focused aggregate producer and independent receipt checker;
- focused row 0, row 14, row 19, row 21, and row 23 mutation/replay checks;
- `pnpm architecture:check`;
- a clean full build, including compiler convergence in two passes, 94 standard
  library modules, 67 baselib dependencies, and all 41 native-kernel families;
- all 247 unit-test files.

`pnpm test:changed` selected the branch's entire 1,876-file historical delta and
then stopped in `pnpm test:compiler`: 7 of 66 legacy compiler fixtures could not
import existing lazy modules `sagejs.kernels.polynomial.packed_prime_field`,
`sagejs.polynomial_algorithms.field_capabilities`, or
`sagejs.polynomial_algorithms.extension_mpoly_backend`. The failure is in the
standalone compiler-fixture import closure, after the successful full build and
unit suite; it is under separate diagnosis and is not reported as a passing
gate.

## Remaining decisive work

1. Finish native factor/reduce/combine maps and required logs for the remaining
   output-evidence rows, without a PARI class/unit routine behind the boundary.
2. Exercise and retain the unequal-bound honesty branch and remaining retry/
   precision corridors required by the frozen plan.
3. Close the reserve/holdout population needed for the predeclared 24-field
   outcomes; the 16-row development aggregate alone does not satisfy Outcome A
   or B.
4. On one quiet pinned Linux core with no agents or builds, run the predeclared
   alternating PARI 2.17.4/Sage.js stage and complete-kernel measurements. No
   timing number from the correctness aggregate is admissible.
5. Publish the resource/code-size ledger, raw paired samples, exact remaining
   failures, and the unweakened final A/B/C/D outcome.
