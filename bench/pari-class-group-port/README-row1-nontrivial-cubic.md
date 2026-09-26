# Authenticated row-1 nontrivial cubic

`check_row1_nontrivial_cubic.cjs` consumes the frozen development payload for
panel row 1. It first verifies the payload, prepared-event, complete event-list,
and terminal-result SHA-256 digests recorded in
`development-default-driver-manifest.json`; the `/scratch` file is therefore a
live authority artifact, not an answer fixture copied into this repository.

The path binds the `class_group_input.W` presentation back to the retained
58-relation HNF event, then passes only `W = [3]`, the authenticated maximal
order multiplication table, and the first retained `Vbase` descriptor into
`row1_nontrivial_cubic.py`. The native leaf derives:

- the complete Smith transforms and cyclic invariant `[3]`;
- class number `3` as the product of the derived invariants;
- the row-major HNF generator ideal `[11,8,6; 0,1,0; 0,0,1]` from the retained
  prime descriptor `(11, -3 + w, e=1, f=1)`;
- the exact replay `[3,1,1,3,11]`, recording invariant, generator coordinate,
  relation coefficient, common relation multiple, and ideal norm.

The checker independently compares those derived values with the authenticated
PARI 2.17.4 `class_group_output` and terminal result. It also rejects the unit
presentation before publishing the generator or order witness.

This closes the requested downstream nontrivial-class path but does not claim
that the resident collector can regenerate row 1 from the polynomial alone.
Row 1 has equation-order index 3, and the current
`pari_prime_degree_catalog` deliberately returns `-3` at the rational prime 3.
Supporting that earlier stage still requires PARI's full index-divisor
`idealprimedec` branch. The resident entry now authenticates the correct field
discriminant identity `disc(polynomial) = disc(field) * index**2` and reaches
that explicit frontier without retaining row-0 polynomial constants.
