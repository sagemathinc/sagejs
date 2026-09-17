# Resident-derived compact unit factor pool

This closes the replay-only limitation recorded by the first compact-unit
handoff for the authentic field

```text
x^3 - 20018*x + 20034.
```

The compact result still does not expand units in the matched flag-zero
workload.  Its seven factor handles now have an independent derivation from
the qualified collector/HNF resident state rather than coordinates recovered
from the final PARI answers.

## Exact provenance

The qualified resident run contains 73 principal relation generators
`alpha_h`, the logical 73 by 73 cleanup transformation `T`, and the 15 by 15
active HNF transformation `U`.  Column `k` of the seven-column HNF kernel has
the original-relation exponent

```text
E[k,h] = sum(U[k,j] * T[j,h], j=0..14).
```

All arrays use the port's documented column-major convention.  The factor is
then reconstructed exactly as

```text
q_k = product(alpha_h ^ E[k,h], h=0..72).
```

The replay separately accumulates positive and negative powers, performs one
exact cubic-field division, rejects a nonintegral quotient, and checks norm
`+1` or `-1`.  The resulting factors are five torsion factors (`+1` or `-1`)
and two large nontorsion units.  Applying the existing authentic 2 by 7
`getfu` provenance reproduces both pristine PARI unit coordinates exactly.

The old fixture's `replay_factor_pool` is not read by this check.  The final
unit coordinates are used only as an independent output oracle.

## Boundaries

- `capture_resident_kernel_pool` is an explicit post-workload replay.  It does
  not add exact products to the matched flag-zero path.
- The 6.8 KB immutable factor authority stores 511 original-relation
  exponents and seven exact unit coordinates, together with hashes of the
  resident cleanup transform, active HNF transform, and principal generators.
- Detached replay rederives every exponent and coordinate from the qualified
  resident artifact and the independently replayed presentation authority.
- This establishes exact factor provenance and materialization, not unit
  saturation or a public completed class/unit group.

## Mutation coverage

The focused check rejects coordinated mutations of source hashes, the 73 by 7
relation provenance, factor identities, factor coordinates, factor norms,
pool hash, and terminal honesty flags.  It also mutates each live resident
owner class (principal generator, cleanup transform, active HNF transform,
and multiplication tensor) and confirms that qualification fails.  Finally,
it rejects a mutation of the compact 2 by 7 unit provenance.

Run:

```bash
node bench/pari-class-group-port/check_compact_unit_resident_pool.cjs \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```

The qualified result is:

```text
residentPoolBytes = 6794
residentPoolSha256 = d1eff4bd22fcf4746bc4224ef56d103bc5403428a171a0d05c15f20f7244d1de
exactUnitsMatchIndependentPariOracle = true
answerDerivedFactors = false
expandedInsideMatchedWorkload = false
```
