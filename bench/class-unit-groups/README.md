# Class and unit group oracle harness

This directory is a developer-only, network-free oracle and benchmark harness
for ordinary maximal-order class groups, ideal-class maps, unit groups, and
regulators. Sage/PARI and Magma run as independent persistent processes. They
are not Sage.js runtime or CI dependencies.

The single offline corpus and pinned result baseline is
`test/fixtures/number-field-class-unit-oracles.json`. Integers are decimal
strings. Exact field elements use power-basis numerator vectors over one
positive denominator. Ideals use integer HNF matrices in each oracle's
recorded maximal-order basis. Class logs are coordinate vectors relative to
the generator ideals stored in the same oracle record. No correctness check
parses a displayed ideal, unit, or group representation.

## Run the harness

The capture paths can be overridden with `SAGE_ORACLE` and `MAGMA_ORACLE` or
the corresponding command-line options:

```bash
node bench/class-unit-groups/run-oracles.cjs --tier quick --check \
  --require-sage --require-magma

node bench/class-unit-groups/run-oracles.cjs --tier all --samples 5 \
  --require-sage --require-magma --output /tmp/class-unit-groups.json
```

`quick` contains seven acceptance and nontrivial-map cases. `core` spans
degrees 1 through 5, every signature in degree 4, cyclic and noncyclic class
groups, and unit ranks 0 through 4. `extended` adds alternate and
nonmonogenic presentations. `stress` contains the large-unit real quadratic.
`all` selects all 16 ordinary records. The pure quintic hard case is metadata
only because putting its unconditional Magma computation in `all` would turn
a deterministic developer check into a resource-limit test.

Missing systems produce explicit `unavailable` records. `--require-sage` and
`--require-magma` make those conditions fatal. Julia was absent on the capture
host, so the pinned baseline does not count Hecke/Oscar as a third agreement;
the exact upstream versions and commits remain recorded for a future adapter.

## Mathematical coverage

The corpus includes `QQ`, Gaussian and nontrivial imaginary quadratics, real
quadratics with fundamental-unit norms `+1` and `-1`, isomorphic shifted and
radical presentations, a large exact fundamental unit, both cubic signatures,
a pure cubic whose equation order has index 3, all three quartic signatures,
the discriminant-380452 quintic with class group `C4`, and a totally real
quintic of unit rank 4.

Every nontrivial class-group generator stores its exact ideal and order. The
harness raises the ideal to that order, verifies principality, and records a
sign-normalized exact generator. Prime ideals above selected rational primes
record ramification and residue degrees, class coordinates, class order,
principality, and an exact principal generator where one exists. This includes
the motivating quintic prime over 2 and repeated-factor `C2 x C2` logs.

Both oracle families run named conditional and unconditional modes. Sage uses
`proof=False` and `proof=True`; Magma uses `Proof := "GRH"` and
`Proof := "Full"`. Their records carry the immutable labels
`exact-relations-conditional-grh` and `exact-unconditional`. The labels describe
completeness, not numerical precision: ideal relations and group operations in
the conditional result are still exact.

The Sage adapter recomputes regulators from exact units. It isolates
archimedean roots with Arb balls, applies weight two at complex places, deletes
one logarithmic row, and records determinant interval endpoints at 100 and 200
bits. Magma's independent regulator decimal is compared to the interval value
with a `1e-12` relative cross-family tolerance. The pinned Sage interval
endpoints themselves are exact baseline fields.

## Benchmark boundaries

Each oracle starts once per selected tier. Each sample constructs fresh field
and maximal-order objects for both proof modes. Sage timings separate field
construction, maximal-order preparation, conditional and unconditional shared
class/unit context construction, ideal-map probes, and Arb regulator work.
Magma 2.18-5 exposes `Cputime()`, which is coarse and quantized; its context
times are historical comparisons rather than gates. Process totals include
cold startup and shutdown and must never be compared to an in-process Sage.js
kernel.

The checked-in baseline is a one-sample correctness capture. Timing receipts
are retained separately from stable mathematical projections, and `--check`
ignores timing drift. For performance reports, use at least five samples on an
uncontended host and report medians without combining same-process startup with
warm context time.

## Hard and failure cases

The fixture rejects a reducible polynomial and a nonmonic integral polynomial
before any class-group computation. It also records `x^5 - 1009` as a bounded
hard case: its Minkowski integer bound is 3,542,899 versus Magma's Bach GRH
bound 15,305, its class group is `C10`, and the capture observed about 0.086 s
versus 21.1 s for Sage/PARI conditional and unconditional class groups. Magma's
conditional call took about 0.36 s; its unconditional call was deliberately
interrupted after 60 seconds. These are capability/resource observations, not
performance gates.

## Recommended Sage.js acceptance thresholds

Before the implementation consumes this fixture, all stable exact fields must
match and both proof modes must agree on the group. A returned 100-bit
regulator should contain the pinned 200-bit oracle value and have relative
diameter at most `2^-90`; at 200 bits use `2^-180`. Every stored ideal log,
principality result, generator order relation, and unit norm must replay
exactly.

On an uncontended Linux x64 benchmark host, recommended initial directional
gates are:

- the discriminant-12 quadratic class/unit context takes at most 25 ms warm;
- the motivating quintic conditional context takes at most 250 ms warm;
- its unconditional proof takes at most 2 s warm;
- ideal-map materialization takes at most 25% of total warm context time;
- certificate replay takes at most 25% of original relation discovery time;
- the complete 16-case correctness harness stays below 20 s per external
  oracle process.

These are intentionally generous integration thresholds, not claims that
Sage.js already meets them. Ratchet only from uncontended five-sample Sage.js
measurements, while preserving the plan's stronger long-term goal that the
conditional motivating quintic remain well under one second.
