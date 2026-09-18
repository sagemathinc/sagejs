# Row 21 complete prepared-input native aggregate

## Boundary

`row21_phase6_prepared_aggregate_root.generated.py` is the single native entry
from the caller-supplied authenticated row-21 prepared number-field packet
through:

1. factor-base construction and initial relations;
2. relation collection and connected HNF;
3. analytic inverse, class-number/regulator reconstruction, and acceptance;
4. integer and real unit lattices, `cleanarch`, and `getfu`;
5. exact fundamental units, exact inverses, norms, and real signs.

`inputPath` is propagated through the aggregate, unit, acceptance, and
connected-HNF hosts to factor preparation. The checker rejects a nonexistent
path, a forged row-21 packet, and an authentic packet for a different row.

The generated wrapper calls the committed exact-unit root privately.  All
mutable storage is an explicit arena parameter.  Authentication, compilation,
allocation, reset, projection, replay, and result serialization occur outside
the clock.  The clock contains exactly one native call.  No retained answer,
cache, final-result, or replay owner is accepted as an input.

## Result and replay

`row21_phase6_final_result.cjs` is now bound to this aggregate rather than the
earlier exact-unit host name.  Its immutable result retains live capabilities
for the 32-relation presentation, exact trivial-class HNF witness and right
inverse, three fundamental units and their exact inverses/norms/signs, accepted
packed regulator, analytic and acceptance states, and the aggregate terminal
ancestry. Publication performs independent class/unit replay from those live
owners. It also binds the fixed PARI source digest and the honesty policy and
outcome to dedicated live metadata capabilities. Mutation tests establish this
specific result-envelope binding; they are not a generic anti-forgery claim.

The checker retains and validates the packed regulator, precision, analytic
state, reconstruction state, and acceptance ancestry. It does **not**
independently recompute a regulator enclosure or determinant from the retained
log lattice; independent regulator replay remains open.

This remains an internal PARI-correspondence result: `public_complete` is
false because the regulator enclosure, saturation, factor-base completeness,
and public API contract remain assumed or unfinished.  The timing is diagnostic
until a matched quiet-host qualification run is authorized.

## Bounded validation

The focused checker performs no build.  The genuine checker must be run in a
separate bounded worker:

```sh
prlimit --as=4294967296 --cpu=600 timeout 600s \
  node bench/pari-class-group-port/check_row21_phase6_prepared_aggregate.cjs \
  --genuine
```

It performs two deterministic one-call computations, replays the complete
class/unit result, rejects a detached aggregate-state mutation, inspects the
generated core for host-runtime tokens, and enforces both the 4 GiB RSS and
600-second per-call limits.

The reviewed genuine development-host run passed with kernel times
4,337,028,746 ns and 4,341,485,055 ns, maximum RSS 1,607,752 KiB, and a
92,805,153-byte isolated
core.  Its projection SHA-256 is
`b494bf59760380e7a27794ce141dd432e080919a514680550fa6f1e09673fd67`.
The ephemeral receipt is
`/scratch/row21-phase6-prepared-aggregate-check-v2.json`, SHA-256
`4a83b39d10ed90c13b58230f21828288cc14daee52d3432fd6a091df5d294c59`.
These are diagnostic development-host measurements, not a matched PARI
qualification pair.
