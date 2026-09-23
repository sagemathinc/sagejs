# Compact/factored cubic unit boundary

## Scope

This lane adds the first immutable result boundary for the plan's **usable
compact units** tier. It does not change the shared final driver and it does
not claim a completed public unit group.

The frozen field is the authentic totally real cubic
`x^3 - 20018*x + 20034`. Its rank-two unit transformation is the one produced
by the resident 73-relation path and the translated PARI 2.17.4 `getfu`
boundary:

- a column-major `7 x 2` unit transform;
- a column-major unimodular `2 x 2` normalized `getfu` factor;
- their exact `2 x 7` product, stored row-major as factored-unit exponents;
- seven stable relation-factor identities and their exact norm signs;
- the high-precision packed logarithms, 0/pi phase bits, and regulator;
- exact source, run, owner-generation, and external factor-pool hashes.

The serialized result is 6,259 bytes. It contains neither algebraic factor
coordinates nor expanded units. Its materialization state is exactly
`not-requested`, with policy `separate-hash-authorized-replay`. Thus publishing
this result cannot accidentally add a `makeunits`-like expansion to a matched
flag-zero timing.

## Replay and materialization

`publish_compact_units` validates and detaches caller-owned data before
returning an `ImmutableCompactUnitResult`. `cold_replay_compact_units` requires
an out-of-band publication hash plus the field, run, owner generation, and
factor-pool authority. It recomputes the transform product and all unit norm
signs rather than trusting the public exponent table.

`materialize_cubic_compact_units` is a deliberately separate operation. It
accepts the immutable result, a factor pool whose canonical hash was already
published, and the cubic multiplication tensor. It authenticates every factor
norm, performs exact signed exponentiation, and checks every materialized unit
norm. It does not mutate or cache anything in the compact result.

For this boundary test, the replay-only factor pool is algebraically derived
from pristine PARI's two exact units so that the already-authentic exponent
matrix expands to those exact units. The first five factors are one, the sixth
is the product of the two units, and the seventh is the first unit. This is
useful evidence that the compact ABI and exact replay are sound, but it is
**not** evidence that the timed driver already retained PARI's original seven
relation generators. The driver must publish its genuine relation-factor pool
under the same hash contract before this tier can be counted as an end-to-end
usable result. No answer-derived pool belongs in the timed workload.

## Frozen provenance

- PARI version: 2.17.4.
- PARI archive SHA-256:
  `02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`.
- `src/basemath/buch2.c` SHA-256:
  `904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
- Input unit-bridge fixture SHA-256:
  `83ce9a256e29b06530e8de2846d274e093f2021c4a547496ccf8122b310061e7`.
- Pristine source-oracle trace SHA-256:
  `a0bca6c1993558845dda93d6d9fd55de6aff2cf1e169e3f8cd544cc0d6d719df`.

The fixture's two exact expanded units have 1,258- and 2,115-bit maximum
coordinate size and norm `-1`. They are oracle-only expected outputs; neither
appears in the compact publication.

## Mutation evidence

`check_compact_unit_result.cjs` rejects 24 independently rehashed semantic
mutations, including source identity, owner generation, assumptions, shapes,
factor identities, pool hash, both transforms, composed exponents, norm signs,
packed-log precision, phase parity, regulator, eager materialization, and false
completion claims. It separately rejects four exact materialization mutations:
factor coordinates, factor norm, factor identity, and multiplication tensor.

After the explicit exact expansion, cold replay produces the identical
publication hash and the compact payload still has no expanded units.

## Remaining integration work

1. Retain the authentic relation-generator factor pool at the relation/getfu
   ownership boundary and compute its canonical pool hash without expansion.
2. Construct this payload from the successful high-precision unit component,
   rather than from a frozen replay fixture.
3. Run the usable compact-unit tier on the predeclared 12-field panel and time
   it separately from flag-zero correspondence.
4. Keep `public_complete=False` until independent rank, saturation, regulator
   enclosure, torsion, and principality evidence satisfies the existing public
   `UnitGroupComputation` contract.
