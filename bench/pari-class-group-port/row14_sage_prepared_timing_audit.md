# Row 14 Sage.js prepared timing boundary

This diagnostic answers two separate questions:

1. does the connected Sage.js computation produce the same mathematical
   flag-zero result as pristine PARI 2.17.4; and
2. are the two clocks sufficiently symmetric to publish a performance ratio?

The answer to the first question is **yes**.  The answer to the second remains
**no**, and the checker therefore does not divide the timings.

## Exact semantic comparison

[`row14_sage_prepared_timing_adapter.cjs`](row14_sage_prepared_timing_adapter.cjs)
reads the immutable C7 envelope produced by the connected prepared-input
transaction and compares it to a fresh seed-one sample from
[`row14_pari_prepared_timing_adapter.cjs`](row14_pari_prepared_timing_adapter.cjs).
The common projection agrees on:

- field ID and `x^4 - 200000002*x - 200000002`;
- class number 192 and normalized invariants `[8, 24]`;
- both class-generator ideal HNF matrices, entry for entry (after making the
  Sage.js column-major storage convention explicit);
- unit rank two, torsion order two, and torsion generator `-1`;
- the exact regulator value (PARI's denominator-exponent triplet is normalized
  from Sage.js's stored binary-exponent triplet before comparison);
- authentic flag-zero `not_given(LARGE)` behavior;
- factor-base size 799, final three-column class HNF, and the `3 x 2` log
  shape; and
- every word of the 66-word terminal seed-one PARI RNG state.

The six log entries use different rounded representations.  Exact dyadic
comparison shows respectively 115, 111, 110, 113, 113, and 112 matching
leading bits.  The checker requires at least 96 bits and fails closed below
that threshold.  Thus this is much stronger than comparing only `h=192`, but
it does not falsely claim byte-identical floating representations.

The common-projection SHA-256 is
`c8c964b2eecc2b61c106240c9e895d39eb3fe96a6d37dc2a530e2de16dbe8e71`.

## Prepared-root attribution run

The first phase-separated run used the already committed connected
transaction.  Its actual clock starts from the authenticated immutable
prepared-root owner, which already contains the 799-ideal factor base and 42
initial rational relations.  It therefore is useful for attribution but is
not the same input boundary as PARI's prepared `nfinit` object.

On the shared development host it observed:

```text
native compilation/cache warmup                    144.714 s
input authentication and hydration                   0.071 s
connected Gate-C-through-C7 transaction             138.701 s
  Gate C                                              85.559 s
  post-806 terminal arithmetic                       14.712 s
  rank-two unit suffix                                0.189 s
  terminal class ancestry/witnesses                  29.141 s
  fused orchestration/replay/publication residual     9.098 s
final 3.7-MiB envelope read and parse                  0.017 s
detached publication-integrity projection             0.024 s
maximum process RSS                                1,549,544 KiB
```

These are development-host observations, not stable performance claims.  The
separately recorded live initial-root kernel took 1.225 seconds, but merely
adding that historical number cannot repair the boundary: it would omit its
allocation/lifetime interactions and would not be one transaction.

## Strict prepared-`nfinit` path

The adapter also consumes
`runStrictPreparedComplete(preparedEnvelope, outputDirectory)` from
[`row14_strict_prepared_complete_host.cjs`](row14_strict_prepared_complete_host.cjs).
That path admits only the authenticated neutral prepared-number-field
projection, constructs the initial root live, and then continues through Gate
C and C7.  The derived 66-word RNG state is returned as output evidence rather
than imported from the old root owner.  This closes the **mathematical input
coverage** gap and produces the same content-addressed final envelope.

The strict receipt separately exposes the initial-root kernel, downstream
stages, root compilation/serialization envelope, mathematical total, and
whole transaction.  The Sage timing adapter can therefore consume it without
using W0 or any answer-derived runtime owner.

It still does not make the implementation clocks identical.  PARI restores a
resident stack and clocks one in-process call to `bnfinit0(nf,0)`.  The current
Sage.js transaction includes downstream child-process startup, immutable owner
serialization and authentication, detached replay, and publication.  Some of
those costs are deliberately fused inside the existing coordinators, so they
cannot yet be subtracted as separately measured exclusive intervals.  The
strict result therefore proves the input and output semantics, but remains a
diagnostic clock until those coordinators acquire a resident in-memory timing
mode.

The capped strict check on the shared development host observed:

```text
native compilation/cache warmup                     74.170 s
prepared-nf authentication/hydration                 0.043 s
live initial-root mathematical kernel                 1.229 s
downstream connected transaction                    137.692 s
  Gate C                                              84.545 s
  post-806 terminal arithmetic                       14.512 s
  rank-two unit suffix                                0.185 s
  terminal class ancestry/witnesses                  29.210 s
reported inclusive mathematical interval            138.921 s
root child compilation/warmup/serialization          11.215 s
whole strict transaction                            150.170 s
final envelope read and parse                         0.015 s
detached publication-integrity projection             0.025 s
maximum process RSS                                1,529,464 KiB
```

The final envelope SHA-256 remains
`edb2b0bdf5753497b51e4b4a34229c3ad8977de8b877de72005a18472d43cff2`.
The strict root's live 66-word RNG output exactly matches the pristine-PARI
terminal RNG state.

The genuinely comparable subset is therefore the **mathematical input and
output projection**, not yet an elapsed-time subset.  Both sides begin after
prepared `nfinit` data and return the same class/unit object semantics.  No
Sage.js elapsed interval is directly divisible by PARI's 1.8--1.9-second
resident clock: the 1.229-second root kernel is only one component, while the
138.921-second inclusive interval still contains asymmetric coordinator,
authentication, replay, and publication costs.  PARI exposes no independently
timed counterpart to the Sage.js component clocks.  Publishing even a labeled
"kernel ratio" at this point would therefore overstate what was measured.

## Alternating campaign status

The deterministic ABBA/BAAB scheduler from the PARI adapter accepts the common
projection above.  It is ready for integration, but is deliberately not run as
a comparative campaign while the clock-implementation mismatch remains.  A
valid next step is a resident Sage.js worker that:

1. retains compiled modules and bounded workspaces across samples;
2. restores only the authenticated prepared-`nfinit` state before each sample;
3. clocks live root construction through resident C7 result construction;
4. stops before detached certification and JSON publication; and
5. runs certification and serialization after the clock, as the PARI adapter
   does.

Only then should the at-least-11-pair quiet-core campaign publish a ratio.

## Reproduction

Prepared-root attribution boundary:

```bash
node bench/pari-class-group-port/check_row14_sage_prepared_timing.cjs
```

Strict prepared-number-field input boundary:

```bash
node bench/pari-class-group-port/check_row14_sage_prepared_timing.cjs --strict
```

Both checks enforce 4-GiB address-space/RSS and 600-second CPU/wall ceilings,
verify the final immutable envelope, compare against a fresh pristine-PARI
sample, exercise semantic mutations, and keep `qualifiedTiming` and
`ratioPublished` false.
