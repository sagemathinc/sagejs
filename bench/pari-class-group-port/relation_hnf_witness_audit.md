# Relation/HNF replay witness audit

## Boundary

The authentic resident artifact is the totally real cubic
`x^3 - 20018*x + 20034`. The connected attempt accepts 73 relations and
returns class number one. Before `hnffinal` deletes unit pivots, its active
matrix state is:

- `hnf_matbnew`: an 8-by-15 column-major relation matrix `A`;
- `hnf_hnf_transform`: a 15-by-15 unimodular column transform `V`;
- `hnf_full_h`: an 8-by-15 matrix satisfying `A*V = [0_(8x7) | H]`;
- `H`: the 8-by-8 accepted presentation, which is unimodular in this h=1
  example.

This is the last useful bidirectional generation boundary. The later
`hnffinal` state is `[0,7,66,0,7,8,0]`: it has removed all eight unit pivots,
so the published quotient presentation is empty. Trying to reconstruct a map
between the original relation columns and that empty quotient would discard
the exact generation claim that final replay needs.

## Construction

No new lattice solve is required. Put `z = 15 - 8 = 7`. Existing HNF
provenance gives

```
A * V = [0 | H].
```

The exact replay witnesses are consequently

```
R2P = V[:, z:]
P2R = V^-1[z:, :]
A * R2P = H
H * P2R = A.
```

`pari_relation_hnf_witness` first authenticates the full `A*V` identity and
zero prefix. It computes `V^-1` through the already-qualified
`pari_unimodular_inverse`, verifies both inverse orders, and only then
publishes the compact slices. `R2P` has shape 15-by-8 and `P2R` has shape
8-by-15, both column-major.

Exact in-place compaction is supported: `R2P` may alias `V`, and `P2R` may
alias `V^-1`. Both copies move toward lower addresses after all full-owner
reads. The two compact outputs must remain distinct.

## Authentic fixture and qualification

The checker consumes an explicitly supplied resident `output.json`; it has no
ambient `/tmp` default. It accepts only the three hashes already produced by
the qualified CPython/GMP/tagged resident runs and then checks the polynomial,
73-relation count, class number, assembly state, and final HNF state before
extracting the active owners.

The independent oracle consists of four direct exact matrix products:

- `A*R2P = H`;
- `H*P2R = A`;
- `V*V^-1 = I`;
- `V^-1*V = I`.

CPython, JavaScript, GMP, and tagged backends must publish identical owners.
The checker also covers source mutation rejection with output preservation,
malformed dimensions, tail preservation, both supported in-place aliases, and
a deliberate witness mutation that the independent identity rejects.

Focused command, using one qualified artifact from the resident campaign:

```bash
node bench/pari-class-group-port/check_relation_hnf_witness.cjs \
  --resident-output \
  /tmp/sagejs-resident-generated-class-3qtnS5/output.json
```

## Integration handoff

The prepared driver already owns all three required inputs at the successful
HNF boundary. Integration should call the leaf immediately after successful
`pari_hnfspec_complete`, while `hnf_matbnew`, `hnf_full_h`, and
`hnf_hnf_transform` still describe the same active matrix. Durable replay
state needs the two 120-entry compact witnesses; retaining the full 225-entry
`V^-1` is optional once the inverse identities have been checked. The call
must occur before `hnffinal`'s unit-column deletion is treated as the public
presentation boundary.

This lane intentionally does not edit the shared prepared driver or final
result schema.
