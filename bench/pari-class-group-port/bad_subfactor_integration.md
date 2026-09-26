# Generated bad_subFB flags in initial policy preparation

`check_actual_initial_collector.cjs` now passes generated flags to the existing
subfactor selector. Inputs to `pari_bad_subfactor_flags` are the **actual output**
of `pari_prepared_initial_base`: selected active primes and their group offsets,
sizes, and completeness markers. The PARI `expected.bad` array is retained only
as a differential assertion; neither CPython nor compiled selection consumes it.

The mathematical predicate is the attributed translation introduced in
`31facbe7c`. No collector mathematics, factor-base bounds, subfactor product,
candidate scheduling, or default backend selection changed.

## Validation

The explicit `--policy-only --native` mode checks the chain
initial-base selection → generated flags → subfactor permutation in CPython,
generated JavaScript, GMP, and tagged execution. It does not compile or run the
large native collector/HNF closure. The existing pinned PARI source oracle still
runs to provide independent expected values.

| Declared field | Active ideals | Subfactor size | Policy receipt |
| --- | ---: | ---: | --- |
| 1: `x^3-20010*x+20018` | 51 | 3 | `/tmp/sagejs-actual-initial-collector-3NmUi9/fixtures.json` |
| 2: `x^4-20018*x-20034` | 143 | 4 | `/tmp/sagejs-actual-initial-collector-x05kEh/fixtures.json` |

All four execution paths match the complete flag array, permutation, and
subfactor size on both fields. These are correctness receipts, not timings.
The full CPython field-1 replay also passes through collection, logarithms, and
HNF with 11 initialized relations, 58 collected relations, and HNF status 0:
`/tmp/sagejs-actual-initial-collector-ZnhVeQ/fixtures.json`. Its exact matrices,
generator coordinates, logarithms, and permutation match the source oracle.
This run did not rebuild or execute the large native closure.
Temporary receipt paths are not durable backups; reproduce with:

```
node bench/pari-class-group-port/check_actual_initial_collector.cjs PARI_DIRECTORY PARI_ARCHIVE --field 1 --policy-only --native
node bench/pari-class-group-port/check_actual_initial_collector.cjs PARI_DIRECTORY PARI_ARCHIVE --field 2 --policy-only --native
node bench/pari-class-group-port/check_actual_initial_collector.cjs PARI_DIRECTORY PARI_ARCHIVE --field 1
```

## Remaining boundary

These helper calls are still **host-orchestrated**, not a single native
nfinit-to-class-group entry. Prime decomposition catalogs, prime-ideal packets,
norms, scale/ball volume, subfactor product, and other prepared inputs remain
outside this change. Removing externally supplied bad flags is one specific
policy dependency removed; it does not establish the plan's nfinit-only input
boundary, general completeness, or a performance improvement.
