# Live equal-bound/cleanarch final-driver status

This lane removes the two fixed status strings in the authentic h=1 root's
final-driver frontier. The statuses are now computed from the same live owners
that produced its accepted class candidate.

`pari_equal_bound_cleanarch_driver_status` checks:

- `KCZ` and `KCZ2` in the resident initial factor-base state are equal (both
  are 48), which is precisely PARI's source condition for skipping
  `be_honest` at `buch2.c:4134-4140`;
- the factor-base, HNF, accepted-relation, rank, and acceptance owners agree;
- the seven live class-log columns pass the source-translated transactional
  `cleanarch` operation at `buch2.c:4178-4190`; and
- no public-complete bit is set.

The resulting native state is `[0,1,1,48,48,7,7,73,8,0]`. The host adapter
maps the two derived decision codes to `equal-bound-source-skip` and
`accepted`, and constructs the existing `FinalDriverComponentOutput` using
candidate, transform, unit, generator, and Buchall state hashes from the live
authentic correspondence payload.

The adapter remains deliberately incomplete. It publishes neither a public
class/unit result nor a Phase-5 claim. Exact ideal replay, unit principality,
factor-base authentication, and rigorous regulator certification remain
separate requirements.

The focused checker reruns the pristine PARI cleanarch oracle, the successful
unit oracle, CPython composition, and generated JavaScript/GMP/tagged native
backends. It rejects mutations of each live source decision, both status
strings, the cleaned-output hash, and both completeness flags.

```sh
node bench/pari-class-group-port/check_class_group_final_driver_status.cjs
```
