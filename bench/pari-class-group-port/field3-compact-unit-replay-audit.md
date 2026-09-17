# Field-3 compact-unit exact-replay audit

This lane tried to join the live 13-column unit-log suffix to all 301 retained
principal generators for `x^4 - 2000022*x - 2000042`, without invoking PARI.

The join is not yet mathematically possible from the three durable captures.
The precise missing owner is the column-major `301 x 13` integer transform
from raw relation columns to the accepted HNF kernel columns. It has 3,913
entries and must be retained through the actual `hnfspec`/`hnfadd` column
operations. Its defining identities are

```text
relationRecords * transform = 0
packedRelationLogs * transform = terminalAcceptedA
```

There is also a capture-generation mismatch which must not be hidden. The
pristine suffix `A` agrees with the translated 301-relation run in columns
0 through 6, and the final transform uses only columns 0 and 1. Unused suffix
columns 7 through 12 differ because the pristine run followed a different
relation generation. Thus the selected final packed logs do join, but the
full `L`/basis history is not a same-run authority. A subsequent capture must
retain that same-run suffix together with the missing integer transform.

What is independently replayed now:

- all 301 principal-generator norm identities against the exact factor-base
  relation columns;
- 26 rational-scalar generator/log identities, including the doubled complex
  place convention;
- equality of the two selected terminal packed HNF log columns and suffix `A`,
  plus explicit reporting of the six differing unused columns;
- the live `L`, `U1`, `U2`, `U`, and `finalU` dimensions and exact composition;
- the packed `clean == finalA` publication and pristine `PRECI/not_given`
  decision, leaving expanded units absent;
- rejection of a coordinated relation/generator mutation which preserves the
  superficial ideal norm but conflicts with the independently retained log.

The artifact SHA-256 values select immutable captures and are reported as
provenance only. They, and the modular fingerprints in the full-owner capture,
are not mathematical authority. Until the missing transform is retained and
its packed-log and ideal identities replay, this lane deliberately publishes
neither exact units nor a principal-ideal-one claim.
