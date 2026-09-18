# Row 14 pristine-PARI prepared-`nfinit` timing adapter

This diagnostic adds the missing PARI side of the row-14 timing boundary.  It
does **not** publish a Sage.js/PARI ratio and is not a qualification receipt.

## Authenticated implementation

[`row14_pari_prepared_timing_adapter.c`](row14_pari_prepared_timing_adapter.c)
links only the private PARI 2.17.4 build under
`/home/user/upstream/pari-2.17.4`.  The JavaScript builder rejects any drift in:

- archive SHA-256
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`;
- `src/basemath/buch2.c` SHA-256
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`;
- the adapter source, resolved `libpari.so`, resolved compiler executable,
  compiler version, and normalized compiler arguments.

The check host used private `libpari.so` SHA-256
`fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f`.
`/usr/bin/gp` and the system PARI 2.15.4 are never consulted.

## Exact clock boundary

The helper first constructs

```c
nf = nfinit0(x^4 - 200000002*x - 200000002, 0, nbits2prec(192));
```

and validates PARI version 2.17.4, degree 4, signature `(2,1)`, and
discriminant `-43200003776000087360000787200002480`.  It then prints `READY`.
The reported preparation time is separate and outside the class/unit clock.

Each `RUN 1` restores the PARI stack to the immutable prepared boundary, resets
the PARI RNG, and clocks exactly

```c
bnf = bnfinit0(nf, 0, NULL, nbits2prec(192));
```

with `CLOCK_MONOTONIC`.  Inspection and JSON serialization happen only after
the clock stops.  Process lifetime, compilation, `nfinit`, JSON encoding, and
teardown are therefore excluded.  Construction of the resident PARI `bnf`
object is included.

The post-clock record retains class number 192, source-order invariants
`[24,8]` (and a matched normalized projection `[8,24]`), both generator-ideal
HNF matrices, the full `3 x 2` log-unit matrix, regulator, torsion order and
generator, PARI's authentic flag-zero `not_given(LARGE)` unit result, RNG state,
factor-base size 799, final class-HNF width 3, and process peak RSS.  Repeated
seed-one runs must have identical result/work/RNG digests.

## Alternating protocol

[`row14_pari_prepared_timing_adapter.cjs`](row14_pari_prepared_timing_adapter.cjs)
provides a checked ABBA/BAAB orchestrator.  It requires at least seven pairs,
requires all arms to publish the identical matched result projection, retains
all raw arm times, and deliberately never computes or publishes a ratio.  The
final coordinator must use at least 11 pairs and enough repetitions to exceed
one second per arm, on one quiet pinned core as required by the campaign plan.

This mechanism remains unqualified until the connected Sage.js driver proves
the same input and output boundary.  Merely passing the same polynomial or
returning the same class number is insufficient.

## Development-host observation

The focused checker on 2026-09-18 observed two consecutive pristine-PARI
kernel samples of `1.907818262 s` and `1.778332814 s`, with approximately
`230--237 MiB` process peak RSS.  Its separate `nfinit` preparation observation
was `3.976 ms`.  These are noisy development-host diagnostics, not the planned
quiet-host series and not a performance claim.

## Candid boundary differences still blocking a ratio

The adapter serializes the standard mathematical intersection needed for the
matched flag-zero result, but it does not serialize PARI's entire internal BNF
relation matrices.  The generator HNFs, logs, regulator, torsion, and unit
status are resident at the clock boundary and serialized afterward.  Extra
Sage.js principal witnesses and replay material may likewise remain resident
and be checked after timing; serializing that stronger evidence would require a
separate symmetric PARI workload.

The current row-14 Sage.js integration is a multi-stage diagnostic transaction
with external owner authentication and cold replay.  Until its active connected
driver demonstrates that preparation, fixture access, subprocess startup,
serialization, and replay are all excluded or included symmetrically, dividing
its elapsed time by the numbers above would be invalid.  This adapter therefore
sets both `qualifiedTiming` and `ratioPublished` to false.

## Reproduction

```bash
node bench/pari-class-group-port/row14_pari_prepared_timing_check.cjs
```

The check builds against the pinned private library, performs repeated live
computations, validates exact output and provenance, exercises the alternating
schedule, and rejects mutations of every material output family.

