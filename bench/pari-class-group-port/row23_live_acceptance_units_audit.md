# Row 23 live acceptance and rank-four unit boundary

This corridor now runs development-panel row 23
`5.5.1002836007889.1` from its authenticated prepared field and live factor
base through authentic small-norm relation collection, first HNF, analytic
normalization, regulator acceptance, and the rank-four unit-lattice suffix.
No frozen relation, regulator, lattice, unit, or column permutation is a
runtime input.

The row-23-specific regulator roots are source-transparent extensions of the
PARI 2.17.4 translations already used for ranks at most three. They extend the
bounded shapes to five real logarithm rows, rank-four reconstruction, and nine
relation columns. Shared lower-rank sources are unchanged. In particular,
rank-four denominator powering now computes the fourth power rather than
silently reusing the earlier rank-three prototype.

The live transaction gives class number `6`, acceptance state `[2,0,0]`, and
reconstruction state `[0,5,244,4]`. Its 256-bit regulator packet is

```text
[58120758344776579206426528395464800380047988883988014887510864319728839258178,
 256, 12]
```

Its mantissa differs from the independently recorded PARI packet by 981 units
at the same 256-bit precision and exponent. The live 4-by-9 lattice is a valid
but noncanonical basis, so it is not required to equal PARI's frozen basis
entry-for-entry.

The live lattice and HNF logarithms then drive integer LLL, real LLL,
transform composition, `cleanarchunit`, and private `getfu` factor selection.
All stages succeed; the private factor is the 4-by-4 identity. The resulting
transform is live and can differ from PARI's recorded transform by a change of
unit basis.

The corridor stops fail-closed before the existing bounded four-right-hand-side
reconstruction. Its `candidateA` owner is still a packed logarithm matrix.
The reconstruction requires exponentiated 5-by-4 embedding right-hand sides;
passing logarithms as those values would be mathematically false. The exact
next missing source boundary is therefore totally-real exponentiation from
the logarithmic candidates, followed by the already available bounded solve,
rounding, and exact unit verification.

Run the unqualified Linux diagnostic with:

```bash
node bench/pari-class-group-port/check_row23_live_acceptance_units.cjs
```

Only after all live stages finish does the checker open W0's acceptance event,
and then solely to compare the class number and regulator enclosure.
