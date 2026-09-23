# Row 4 fresh-prepared class-and-unit transaction

Panel row 4 now runs from its authenticated normalized prepared maximal-order
data to an immutable internal class-and-unit correspondence result.  No frozen
W0 relation, factor-base, HNF, acceptance, class, or unit owner is a runtime
input.

The private computation constructs, within one invocation:

```text
prepared real cubic
  -> degree and descriptor catalogs
  -> C1=C2=4033, KC=560, KCZ=KCZ2=360
  -> 567 principal relations and packed logarithms
  -> exact relation HNF and analytic acceptance
  -> class number 2 with invariant [2]
  -> exact cyclic order-two compact class witness
  -> two compact fundamental units with norms (-1,+1)
  -> exact torsion and a neutral immutable envelope
```

The presentation retains all 317,520 relation coefficients, all principal
generators, all 560 factor ideals and descriptors, the raw-to-kernel and
raw-to-class maps, the 397-factor exact class-order witness, and both compact
unit provenance columns.  Every principal relation is replayed against the
freshly reconstructed prime ideals.  The class generator square and both unit
ideals and norms are independently checked.  The `LARGE` source policy is
represented honestly: expanded fundamental-unit coordinates are not claimed,
while their exact factored representation is retained.

`row4_fresh_prepared_transaction.cjs` accepts only the exact prepared authority
`9421ca79dcf494d3834d7fa1869e037a26804be210b61b2ab28a088aef862ab4`.
It publishes a read-only content-addressed envelope and returns a frozen
receipt branded by a module-local `WeakSet`; the verified neutral result is a
non-enumerable property.  The result is explicitly upstream-assumed and has
`public_complete=false`.  It makes no timing, reserve, or independent
certification claim.

Reproduce the genuine run with:

```sh
node bench/pari-class-group-port/check_row4_fresh_prepared_transaction.cjs \
  /scratch/sagejs-pari-development-panel-a998/panel-04-beb19c9584069e83.json
```

The checker also rejects an injected retained-owner path, a mutated prepared
polynomial, a copied receipt, and a mutated published payload.
