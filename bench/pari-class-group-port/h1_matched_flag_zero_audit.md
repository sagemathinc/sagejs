# H1 matched flag-zero Outcome-C audit

## Question and fixed threshold

This lane asks whether a matched PARI flag-zero boundary removes at least 80%
of the measured H1 duration gap without calling Sage.js's stronger exact-unit
replay. The fixed baseline gap is `931,341,545 ns`, so the fixed Outcome-C
threshold is `745,073,236 ns`. The existing eager exact-unit visit accounts for
about `624,947,000 ns`; consequently the matched relation-prefix/control work
must independently explain at least `120,126,236 ns`. These numbers are frozen
before this implementation is timed.

## Boundary

The Sage.js matched root consumes the authenticated outputs of the existing
prepared H1 relation/HNF computation and compact p192 bridge. It transposes the
authenticated prepared embedding owner into the basis-column-major layout used
by `getfu`, makes exactly one `pari_getfu_signed_real_cubic` call at p192, and
accepts either exact success or PARI-compatible `not_given(PRECI)`. It never
enters the p192-to-p2304 retry/reconstruction suffix and never publishes a
complete public class-and-unit result (`public_complete=false`).

The existing `pari_live_retrying_h1_suffix` remains a separately callable,
strictly stronger post-pass. It reconstructs relation units from the compact
provenance owner and may retry at increasing precision. Its work and timing are
reported as exact replay, never as matched flag-zero work.

## Canonical evidence

`h1_matched_flag_zero.py` defines two capacity-independent canonical records:

1. a pre-HNF relation-prefix record, using column-major relation order,
   relation-major algebraic generators, named logical counters, and all 66
   words of terminal RNG state;
2. a compact p192 record containing clean logs/phases, compact provenance,
   factor transform, one-attempt status, zero retry/suffix counters, and the
   same terminal RNG owner.

Integers are canonical decimal strings and hashes are SHA-256 of sorted compact
JSON. Workspace padding is excluded. Mutation tests cover relations, RNG state,
authority/counter state, and `getfu` status.

## PARI control

`h1_matched_flag_zero_control.cjs` authenticates the pinned PARI 2.17.4 archive
and pristine `src/basemath/buch2.c`, then instruments two source boundaries
without changing arithmetic or branches: immediately before the first
`hnfspec_i`, and immediately after flag-zero `getfu`. It records the logical
relation matrix/generators/counters/RNG and the compact p192 logs/factor/
regulator/result reason/RNG. This is a source-adapted control, not an API-level
reconstruction.

## Pending admitted validation

Heavy compilation is deliberately deferred until the integration coordinator
admits this lane to a shared build slot. The admitted run must record separately:

- isolated post-bridge differential correctness and mutation rejection;
- the source-instrumented PARI control agreement;
- a single compiled root (no host conversion between live H1 and compact
  `getfu`) generated mechanically from the existing signature/layout;
- matched relation-prefix duration, avoided exact-replay duration, their sum,
  and the frozen `745,073,236 ns` pass/fail decision.

No timing from two public native calls is acceptable as the final matched-root
timing because intermediate host conversion changes the boundary.
