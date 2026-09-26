# Field-3 high-precision local-HNF transform audit

## Scope and result

This lane prepares C2/C3; it does **not** claim that C1 is complete and does
not publish a real field-3 `A`.  Dependency (2), the exact local-HNF protocol
owner, is now closed. The Python protocol accepts only a complete
authenticated C1 owner with 301 source columns and the frozen field/run/source
digests.  A 28-column or other qualified prefix is rejected before arithmetic.
The coordinator additionally requires immutable mode-0444 files and explicit
SHA-256 values for both inputs, and publishes only after the Python process has
returned a complete result.

The local-HNF protocol owner was captured from the resident field-3 run which
produced the exact relations and HNF states. Its required
owners are the initial 293-column cleanup transform, initial `hnffinal` local
owners, and all three append-stage `U`, full-H, dependent, trailing, diagonal,
permutation, and new-relation owners.  The current exact producer holds these
as `v['hnf_transform']`, `ancestry_stages[0]`, and `ancestry_stages[1:]` in
`check_post_rnd_lie_iteration.cjs`. The capture reruns only the lightweight
integer HNF transformations from the immutable initial capsule and full live
authority. It reproduces the frozen initial and random/post/terminal
H/D/B/C/permutation checkpoints exactly; it does not recollect relations and
does not replace them with a copied answer fixture.

The published owner is:

```text
/scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority/
field3-local-hnf-protocol-892afa9a63da8353cce50eead03b12f031812182a3229a48ed8fbdfa60b94e72.json
```

It is 888286 bytes, mode 0444, and its file SHA-256 is
`892afa9a63da8353cce50eead03b12f031812182a3229a48ed8fbdfa60b94e72`.
The retained exact T hash is
`95f2a721d1f238012079fb1224ffd3c5831c40eb91097cd4b4ed646ad57123b7`.

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
- authentic recapture from the two immutable source owners, byte-for-byte
  initial and three-stage HNF checkpoint agreement, and idempotent mode-0444
  publication;
- rejection of a local-owner mutation against its independently stored hash;
- exact non-annihilation with an unchanged held certificate;
- rejection of a mismatched file hash before Python execution; and
- absence of an output file on rejection.

The output records both input hashes, the complete `T`, its kernel state, and
the packed high-precision `A`.  It is written under its own content hash by a
temporary-file rename and then made mode 0444.

## Remaining dependency

The sole remaining input is the complete C1 joined raw-log owner
`sagejs.pari-class-group/field3-raw-log-owner-v1`. The exact local-HNF owner is
published and independently recapturable as recorded above. Until the C1 hash
is recorded by the integration lane, only synthetic high-precision arithmetic
and qualified-prefix rejection controls are valid for the floating replay. In
particular, this lane still has no real complete-A receipt to advertise.
