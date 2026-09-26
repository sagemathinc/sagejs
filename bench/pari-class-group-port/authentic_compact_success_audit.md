# Authentic h=1 success with genuine compact units

## Outcome

The authentic cubic h=1 success now has a separate immutable composition that
binds its class-group result, selected unit lattice, regulator authority, and
genuine resident-derived seven-factor pool.  The result is a 2,264-byte compact
record.  It contains no factor coordinates and no expanded units.

This removes the old compact fixture's answer-derived factor-pool limitation.
That fixture is not an input to the composer.

## Cross-authority proof

The composer first cold-replays the complete existing authentic-success
payload and the qualified resident kernel pool.  It then checks two independent
paths through the evidence:

1. Each of the seven factor provenance rows is recomputed as the product of
   the authentic 15 by 7 HNF kernel and the relation authority's 15 by 73
   active-to-retained map.  The resulting 7 by 73 matrix must equal the pool's
   provenance over the original principal relation generators.
2. The relation authority's selected 2 by 7 exponent matrix is applied to the
   seven exact resident-derived factors.  Exact cubic arithmetic must reproduce
   both published integral-basis units coefficient-for-coefficient.  Their norm
   signs must agree with the independently replayed regulator authority, and
   the corresponding power-basis coordinate hash must equal the regulator's
   retained exact-unit hash.

Thus the usable compact unit path is now

```text
73 authenticated principal generators
  -> collector cleanup transform
  -> 7 genuine HNF-kernel factors
  -> selected 2x7 unit provenance
  -> exact published h=1 units and regulator authority.
```

No pristine PARI unit coordinate is used to create a factor.

## Honesty boundary

The immutable result explicitly retains:

- `answer_derived_factor_pool = false`;
- `expanded_inside_matched_workload = false`;
- `expanded_units = null`;
- `phase5_complete = false` and `public_complete = false`;
- the unchanged live-oracle and public saturation/completeness blockers.

Exact expansion happens only during qualified replay to prove the binding; the
expanded values are neither serialized nor cached.  This remains an
upstream-assumed internal h=1 result, not a certified public class/unit group.

## Mutation evidence

The focused checker rejects 11 coordinated/rehashed composition mutations,
including factor identities, norms, exponents, result hashes, eager expansion,
and false completion.  It also rejects six mutations of the authentic success
authority (HNF kernel, unit provenance, retained relation map, exact published
unit, multiplication table, and regulator norm) and two mutations of resident
principal-generator/cleanup owners.

Run against a built replay runtime:

```bash
SAGEJS_REPLAY_RUNTIME_ROOT=/home/user/sagejs-worktrees/pari-class-group-e2e-integration \
  node bench/pari-class-group-port/check_authentic_compact_success.cjs \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```

Qualified result:

```text
resultBytes = 2264
resultSha256 = 468f5289b23e51584f21e8bf09f689f57bd77cf72a60d3669efed5d3f6dc46a4
genuineKernelFactors = 7
answerDerivedFactors = false
expandedInsideMatchedWorkload = false
```
