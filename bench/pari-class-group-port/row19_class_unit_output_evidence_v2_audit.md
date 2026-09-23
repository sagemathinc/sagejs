# Row 19 output-evidence v2 projection

Row 19 now publishes a complete valid
`sagejs.pari-class-group/class-unit-output-evidence-v2` sidecar. In addition
to the retained relation, presentation, class, and unit evidence, its phase-5
maps are backed by executable ordinary Python for every fractional cubic ideal
whose prime-ideal support is contained in the 424-prime retained factor base.

## Phase 3: complete

The immutable fresh result contains the actual relation surface:

- 424 factor-base ideals, each a 3-by-3 HNF (`[424,9]`);
- 430 relation vectors (`[430,424]`);
- 430 principal generators (`[430,3]`); and
- 430 packed log rows (`[430,14]`).

`row19_raw_relation_smith_proof.cjs` expands the retained 430-by-430 HNF
ancestry and exact 9-by-9 terminal Smith result into full matrices

```text
U_raw [430,430] * R [430,424] * V_raw [424,424]
    = D_raw [430,424].
```

The diagonal contains 415 copies of 1, eight copies of 3, and one copy of 6;
its product is 39366. The v2 adapter consumes this proof without relabelling
the smaller terminal presentation. It publishes dimension-matched evidence
for `U_raw`, the raw relation matrix `R`, `V_raw`, and `D_raw`, plus the six
relation dependencies and authenticated construction provenance. The shared
v2 contract accepts this `smith_uwvd` presentation, so phase 3 is truthfully
complete; there is no remaining schema capability gap.

## Phase 4: complete

The sidecar also binds all nine class-generator ideals and their exact
principal-order witnesses. The retained presentation puts the order-six
generator first; the adapter applies the authenticated Smith ordering
`[1,2,3,4,5,6,7,8,0]` so the published generators match the normalized
invariant factors `(3,3,3,3,3,3,3,3,6)`. It publishes the retained rank-one compact unit,
its relation transform and logarithmic state, the rigorous regulator
enclosure and acceptance evidence, and the order-two torsion generator. PARI
declined to expand the unit for reason `LARGE` at 192 bits, which is represented
by the contract's explicit `exactUnits.status = not_given` variant rather than
treated as missing phase-4 evidence.

## Phase 5: complete on the supported ideal domain

[`row19_general_ideal_maps.py`](row19_general_ideal_maps.py) consumes only the
authenticated fresh result and the dimension-compatible raw Smith proof. It
implements:

- factorization of an arbitrary integral ideal HNF using the 424 retained
  prepared prime-ideal `tau` matrices and an exact norm-support check;
- the same operation for a fractional ideal represented by an integral HNF
  numerator and positive rational denominator;
- Smith quotient coordinates from the exact `V` in `U R V = D`;
- reduction to a word in the nine published class-generator ideals, together
  with an exact signed combination of the 430 retained principal relations;
  and
- combination by signed factor-exponent addition followed by the same exact
  reduction.

The domain is mathematical rather than fixture-specific: any supported ideal
HNF is accepted, while an ideal or denominator with a prime outside the
retained base fails closed. The map evidence hashes the source-transparent
implementation, its source-owner contract, and the raw Smith proof hashes.
All three maps are ready, `phase5Complete` and `outputBoundaryComplete` are
true, and the missing list is empty. This is still not a qualified timing
claim.

## Independent replay

The focused checker:

1. authenticates the immutable fresh correspondence bytes;
2. validates and canonical-round-trips the v2 sidecar;
3. recomputes relation, class-witness, unit, regulator, and torsion evidence
   hashes directly from retained owners;
4. independently rebuilds the full raw Smith proof and exactly multiplies all
   430-by-424 cells of `U_raw R V_raw = D_raw` using sparse raw rows;
5. checks that the diagonal product is 39366; and
6. authenticates the factor/reduce/combine evidence hashes; and
7. rejects a one-byte source mutation.

The separate focused map checker factors all 424 factor-base prime HNFs back
to their unit tapes, factors all nine published generator HNFs as arbitrary
inputs, replays their exact Smith/relation witnesses, checks a mixed-order
combine law, checks a nonintegral principal-denominator input, rejects two
out-of-support inputs, and rejects mutations of both a retained `tau` matrix
and raw Smith `V`.

Run:

```bash
node bench/pari-class-group-port/check_row19_class_unit_output_evidence_v2.cjs \
  /scratch/sagejs-row19-fresh-transaction-check/row19-class-unit-result-a9642e255d536cde1c13740b0452bbdedf917cc851b753c2ec6152df2622eb66.json

node bench/pari-class-group-port/check_row19_general_ideal_maps.cjs
```
