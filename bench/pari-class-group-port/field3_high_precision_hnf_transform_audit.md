# Field-3 high-precision local-HNF transform audit

## Scope and result

This lane prepares C2/C3; it does **not** claim that C1 is complete and does
not publish a real field-3 `A`.  The Python protocol accepts only a complete
authenticated C1 owner with 301 source columns and the frozen field/run/source
digests.  A 28-column or other qualified prefix is rejected before arithmetic.
The coordinator additionally requires immutable mode-0444 files and explicit
SHA-256 values for both inputs, and publishes only after the Python process has
returned a complete result.

The eventual local-HNF protocol owner must be captured from the resident
field-3 run which produced the exact relations and HNF states.  Its required
owners are the initial 293-column cleanup transform, initial `hnffinal` local
owners, and all three append-stage `U`, full-H, dependent, trailing, diagonal,
permutation, and new-relation owners.  The current exact producer holds these
as `v['hnf_transform']`, `ancestry_stages[0]`, and `ancestry_stages[1:]` in
`check_post_rnd_lie_iteration.cjs`.  This lane deliberately does not replace
them with a copied answer fixture.

## Integer certificate

The protocol reconstructs the column-major integer transform `T` with shape
`301 x 13` using `pari_field3_retain_unit_relation_transform`.  Before any
floating result is returned, it calls
`pari_field3_validate_unit_relation_kernel` on the exact column-major relation
owner `R` (`288 x 301`).  Success is the exact integer statement

```text
R * T = 0, kernel state [0, 288, 301, 13, 3744].
```

The certificate state is transactional: a nonzero product leaves the supplied
state untouched.  Fixed dimensions, append counts `2, 1, 5`, concatenation
offsets, permutations, padding, and owner extents are checked before retention.

## Floating schedule

The accepted packed logs are not computed as a flat `rawLogs * T` product.
That reassociation changes PARI rounding.  Replay instead follows the resident
PARI 2.17.4 sequence:

1. apply the 293-column cleanup transform in source accumulation order;
2. apply the initial local `hnffinal` transform and reverse-row quotient
   reductions;
3. for each append, construct the new log columns from the exact appended
   relations and current B columns in their stored order;
4. apply that append's local `hnffinal`; and
5. preserve the zero-prefix/accepted-column placement used by `hnfadd_i`.

Packed components use the existing ports of PARI integer-real multiplication
and signed real addition.  Those ports admit the C1 component precisions
153088, 153152, and 153216 bits.  No 192-bit `sourceRawLogs`,
`accepted_checkpoints`, `terminalAcceptedA`, regulator, lattice, or unit owner
is an input to this protocol.

## Atomic failure controls

The focused checker covers:

- a 153088-bit identity transform and a 4352-bit differential schedule oracle;
- exact rejection of raw dimension and precision mutations;
- rejection of append-stage order/owner dimension mutations;
- exact non-annihilation with an unchanged held certificate;
- rejection of a mismatched file hash before Python execution; and
- absence of an output file on rejection.

The output records both input hashes, the complete `T`, its kernel state, and
the packed high-precision `A`.  It is written under its own content hash by a
temporary-file rename and then made mode 0444.

## Remaining dependency

There are two required content-addressed inputs not manufactured here:

1. the complete C1 joined raw-log owner
   `sagejs.pari-class-group/field3-raw-log-owner-v1`; and
2. one `sagejs.pari-class-group/field3-local-hnf-protocol-v1` owner emitted
   directly from the authentic resident run's exact local owners listed above.

Until both hashes are recorded by the integration lane, only synthetic
arithmetic and qualified-prefix rejection controls are scientifically valid.
In particular, this lane has no real complete-A receipt to advertise.
