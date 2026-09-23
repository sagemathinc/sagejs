# Panel-row-1 C7 class-and-unit result

`panel1_c7_result_composer.cjs` publishes the internally complete PARI
class-and-unit correspondence for `x^3 - 20010*x + 20018`. It is a
field-neutral, data-only adapter: it performs no filesystem access, starts no
process, and cannot create its own publication authority.

The composition consumes detached replay boundaries for five inputs:

- immutable presentation owner `c5442d0848ec…`, giving class number 3 and
  Smith invariant `[3]` from all 58 exact principal relations;
- immutable C3 witness `77e3a6dd0011…`, giving the exact generator ideal, its
  nonzero Smith coordinate, and an exact principal generator for its cube;
- immutable exact-unit owner `75c7f8957115…`, produced by source commit
  `f60734fc92f42f6fe50ab133b54a0eb669d006ca`;
- authenticated pristine W0 `f043f34a7c73…`, from which the equal
  `KCZ=KCZ2=36` honesty skip is derived; and
- the exact real-cubic torsion leaf, cold-replayed from the defining
  polynomial and proving roots of unity `{1,-1}`.

The sealed payload owns the complete 51-by-51 class presentation, C3
generator ideal and order-principal witness, both exact integral-basis units,
their 58-by-2 raw-relation provenance, exact norms `[1,1]`, six real-place
phase bits, packed regulator, and torsion generator `-1`. It reports rank 2,
torsion order 2, `correspondence_complete=true`, and
`public_complete=false`.

The source record labels three upstream facts as assumptions rather than
proofs: PARI's factor-base/bound selection, the GRH-conditional bounds, and
the faithfulness of PARI 2.17.4's class-and-unit correspondence. Consequently
the result is suitable as an internal correspondence-complete C7 owner, not
as an independently certified public class group.

`check_panel1_c7_result_composer.cjs` authenticates all owner bytes and the
exact-unit source commit, performs two detached cold compositions, reruns the
torsion proof, and independently replays each injected owner verifier. It
rejects mutations of the presentation, class coordinate, order-principal
generator, exact units, signs, regulator, honesty counters, and torsion. It
also rejects a false public-complete promotion and coordinated, validly
resealed changes to unit coordinates, the order-principal witness, and the
honesty outcome. Publication is atomic, idempotent, content-addressed, and
mode `0444`; the focused runner enforces a 600-second timeout and 4-GiB
address-space ceiling.

Run:

```bash
node bench/pari-class-group-port/check_panel1_c7_result_composer.cjs
```
