# Row 19 symmetric prepared-adapter audit

Date: 2026-09-18

## Scope

This is a row-specific, unqualified parity experiment. It does not enable the
Phase-6 registry, execute a qualification campaign, approve a timing host, or
open a reserve field.

The Sage.js arm is a normalization layer over the committed one-call row-19
prepared aggregate. Authentication, compilation, allocation, and projection
are outside the clock. Each resident is single-use because the aggregate
mutates its live owners and no reset is hidden in the measured path. The clock
contains exactly one already-bound native call.

The PARI arm authenticates the pinned pristine PARI 2.17.4 archive,
`buch2.c`, and private shared library. It constructs `nfinit0` before emitting
`READY`. Each request restores the prepared stack, installs the requested RNG
seed, and clocks exactly `bnfinit0(nf, 0, NULL, nbits2prec(192))`. Result
inspection, terminal RNG capture, and JSON serialization occur after the
clock.

Both arms publish the same neutral projection:

- field `3.1.1086061775432017340256300.107`, defined by
  `x^3 - 51050867718180330`;
- class number `39366` and canonical invariant factors
  `[3,3,3,3,3,3,3,3,6]`;
- nine class generators;
- unit rank one, torsion order two, and a nonzero regulator; and
- flag-zero class-and-unit completion semantics under the experiment's stated
  PARI-bound assumptions.

## Exact parity probe

`check_row19_phase6_qualification_pair.cjs` ran one fresh Sage.js prepared
aggregate and two PARI calls with seed `1`, the seed fixed by the translated
row-19 source. The two PARI calls produced identical projections and terminal
RNG state. The Sage.js and PARI semantic projections and all 66 words of the
terminal RNG state were exactly equal. Reuse of the consumed Sage.js resident
was rejected. The receipt also retains the prepared-input authority, native
cache key, exact semantic replay projection, and common work counters.

The authoritative receipt is
`/scratch/row19-phase6-unqualified-pair-check-v2-rng.json`, SHA-256
`0e81217dd0139d303055e08d44721f354899ba584f31f6e78570f3274dc110e5`.
It explicitly records `qualifiedTiming: false`, `campaignExecuted: false`, and
`reservesOpened: false`.

The authoritative shared-host diagnostic took 10.222203112 seconds for
Sage.js and 0.667743797 and 0.641237307 seconds for PARI. These numbers
establish boundary execution and parity, not a qualification decision; an
approved quiet host and the sealed campaign protocol remain necessary for any
retained performance conclusion.

## Repeated-fresh worker protocol

`row19_phase6_fresh_adapter.cjs` exposes the exact qualification-core sample
shape without enabling the registry. Every Sage.js `runFresh()` allocates and
authenticates a genuinely fresh single-use resident before starting the
kernel clock. Every PARI `runFresh()` starts a fresh helper and waits for its
prepared `READY` record before requesting the timed call.

The bounded two-repetition smoke completed under the four-GiB gate without
retaining either Sage resident. Both implementations reproduced stable output,
replay, RNG, and work digests, and all four cross-arm digests were identical.
The receipt is
`/scratch/row19-phase6-unqualified-fresh-protocol-v1.json`, SHA-256
`c1bfc5689ecef7d69431fabfb1f77b0fcda75f49f04bcdaeb25faba6a268213d`.
Sage.js reported peak RSS 1,413,776 KiB across the two fresh residents. The
receipt remains explicitly unqualified and records no campaign or reserve
opening.

## Validation

The focused Node test checks the exact common projection, rejects changed
class semantics, and statically verifies the placement of PARI preparation,
stack/RNG restoration, and the clock. The C helper passes strict warning-free
syntax compilation against the pinned PARI headers. It also checks the
repeated-fresh factory contract and the authoritative v2 receipt path.
JavaScript syntax and whitespace checks pass.
