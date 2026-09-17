# Phase 3--6 class-group integration audit

This is an adversarial, read-only audit of integration commit `944a12911`.
It compares the merged leaves with PARI 2.17.4's `class_group_gen` and asks a
narrow question: what still prevents one real prepared field from reaching a
faithful class-group/fundamental-unit result? It does not reassess the focused
differential checks, all of which remain valuable evidence for their stated
boundaries.

## Executive result

The leaves do not yet form an execution path. A repository-wide call search
finds the new Smith, `nf_cxlog`, signed reduction, `getfu`, and honesty entries
only in their defining modules and focused checkers. The resident driver still
ends by calling invariant-only `pari_class_invariant_output`, copying the class
number and invariant factors, and returning phase 4
(`prepared_class_group_resumable.py:1243-1260`).

The first substantial missing mathematical edge is bounded cubic `genback`.
Most other immediate edges are small ownership/representation adapters. Two
publication requirements, however, need deliberate contract work: HNF
provenance witnesses and the incompatible interpretation of packed logarithms
in the immutable unit schema.

## Prioritized blockers

### P0: no `Uir`-to-generator `genback` path

The Smith leaf successfully publishes `Uir`, `M1`, and `M2`
(`class_group_smith_transform.py:111-140,339-375`). PARI next calls `genback`
on each nontrivial column of `Uir`; that call produces both a reduced ideal
generator `G[j]` and its ordered factored principal multiplier `Ge[j]`.

The signed-reduction leaf cannot perform this operation. Its public tail takes
an *already selected* T2 candidate (`signed_prime_ideal_reduction.py:200-226`),
and its module explicitly leaves generic `genback` separate
(`signed_prime_ideal_reduction.py:5-8`). The recorded exclusions are exactly
the missing signed exponent-vector schedule: arbitrary extended-ideal binary
multiplication and squaring, intermediate reductions, inversion, and generic
`genback` (`signed_prime_ideal_reduction.md:75-85`). Consequently no real
`Uir[:,j]` can currently produce `G[j]` or `Ge[j]`.

The narrow implementation should be a totally-real cubic `genback` over one
integer exponent column:

1. initialize positive and negative prime powers from prepared `Vbase` packets;
2. follow PARI's binary extended-ideal multiply/reduce schedule, including
   intermediate reductions;
3. invoke the connected candidate-selection/LLL boundary rather than accepting
   a preselected candidate at the outer interface;
4. accumulate the ordered compact factors without cancellation or reordering;
5. repeat only for the nonunit Smith prefix.

This is not replaceable by a buffer-copy adapter.

### P1: compact factors can feed `nf_cxlog` with a small adapter

Once `genback` exists, this boundary is straightforward. Signed reduction owns
`kinds`, four values per factor, `exponents`, and `metadata[0]`
(`signed_prime_ideal_reduction.py:133-167`). `pari_prepared_famat_cxlog` expects
factor offsets and separate kind, numerator, denominator, coordinate, and
exponent owners (`nf_cxlog.py:119-143,175-185`).

For every retained factor, copy `a`, the positive denominator, `(a,b,c)`, and
the exponent; basis factors use denominator one. Append one offset per class
generator. No change in mathematical representation is required.

### P1: `get_clg2` archimedean assembly has no caller

PARI constructs

```text
GD = act_arch(M1, C) - diag(cyc) * Ga
ga = act_arch(M2, C) - act_arch(Ur, Ga).
```

No merged function assembles those two matrices. The arithmetic is already
available: `pari_log_matrix_transform` implements column-major seven-word log
matrices times exact integer matrices (`log_matrix_transform.py:115-200`). The
minimal adapter is therefore three matrix transforms, one diagonal scale, and
packed entrywise subtraction, with explicit logical dimensions for `C`, `Ga`,
`M1`, `M2`, and `Ur`.

### P1: the rank-two suffix still does not reach `getfu`

The latest suffix selects/reduces the rank-two unit lattice, composes its two
integer transformations, and checks a binary64 real-cubic `cleanarchunit`
decision (`unit_lattice_reduction.py:19-364`). The `getfu` leaf, in contrast,
accepts two already-clean, sign-free unit-log columns in the resident packed
real representation. It explicitly excludes relation-to-unit lattice
reduction and characteristic-two sign handling
(`unit_reconstruction_cubic.py:5-11,251-324`).

The remaining bridge must:

1. form packed `A * U` with `pari_log_matrix_transform`;
2. perform the exact packed real-cubic `cleanarchunit` and sign-phase decision,
   rather than treating the binary64 checker as the value-producing path;
3. compose the selected/reduced integer transforms into relation-factor
   provenance; and
4. pass the resulting 18 packed words to `pari_getfu_real_cubic`.

Without the provenance composition, `getfu` can return algebraic units but the
result publisher cannot replay their relation-factor exponents.

### P1: immutable-v1 misinterprets packed logarithm storage

This is a contract incompatibility, not missing orchestration.
`snapshot_prepared_candidate` copies `hnf_result_c` directly as
`transformed_logs` (`class_group_internal_result.py:327-330`). Its producer
stores seven integers per logarithm entry: kind, real mantissa/precision/
exponent, and imaginary mantissa/precision/exponent
(`prepared_class_group_resumable.py:113-125`; see also
`log_matrix_transform.py:86-110`).

The immutable units validator instead selects individual raw integers from that
flat stream, requires them to equal `log_minor_numerators`, assigns one common
integer denominator, and computes their ordinary integer determinant
(`class_group_internal_result.py:645-683`). A mantissa, precision word, exponent,
or kind tag is not a rational log numerator. Thus a real resident packed-log
minor cannot honestly satisfy the mathematical interpretation asserted by the
schema, even if synthetic integers satisfy its equations.

The minimal safe correction is a new schema revision. It should either:

- select complete packed entries and replay the determinant with packed-real
  arithmetic; or
- publish a separately derived scaled-rational minor, together with exact
  indices and a checked conversion from each complete packed source entry.

The current rule equating arbitrary selected raw words with rational numerators
must not be used for a real result.

### P2: immutable transform replay needs unproduced witnesses

The transform validator requires `right_inverse` and both rectangular
relation-to-presentation and presentation-to-relation witnesses
(`class_group_internal_result.py:442-509`). The Smith leaf emits `V`, but not
`V^-1`, and emits neither relation/HNF witness.

`V^-1` is one call to the existing checked unimodular inverse. For a full-rank
triangular presentation `W`, `W^-1 R` supplies the
presentation-to-relation witness after exact-divisibility checks. The reverse
witness must be retained through HNF construction or obtained from a genuine
integer solve; it cannot be inferred merely from equal determinants. At the
JSON boundary, every native column-major matrix must also use the existing
column-to-row-major normalization.

### P2: unequal-bound honesty is incomplete and cannot be resumed

The resident driver turns unequal relation/checking bounds into terminal action
`-206`, then rejects reuse of any phase-4 state
(`prepared_class_group_resumable.py:467-485`). The honesty module explicitly
lacks the complete probe loop, automorphism orbits, no-cache Fincke--Pohst call,
and ideal reduction (`honesty_branch.py:5-8`). It currently supplies only the
RNG sequence and one positive-prime-power retry ideal
(`honesty_branch.py:20-110`).

The first real integration should therefore use an equal-bound field. The
later honest path needs a complete outer scheduler that runs before a *fresh*
resident-driver invocation and records the original unequal bounds and proof.
It must not resume `-206` or silently substitute equal counts.

### P3: immutable-v1 intentionally cannot be a final result

`make_internal_payload` hardcodes `phase5_complete` and `public_complete` to
false and records five unverified requirements
(`class_group_internal_result.py:813-825`). Validation rejects any stronger
claim (`class_group_internal_result.py:750-758`). This is appropriate. Even
with all optional v1 objects present, the result remains authenticated partial
evidence until exact ideal/unit replay, factor-base authentication,
`buchall_end`, and rigorous regulator acceptance exist.

## Shortest path to one real result

Use one frozen equal-bound totally-real cubic so honesty is not on the critical
path:

1. run the existing prepared resident path to an accepted phase-4 state;
2. run the full Smith transform on its accepted square HNF;
3. implement bounded cubic `genback` for only the nonunit `Uir` columns;
4. flatten each ordered compact multiplier into the existing `nf_cxlog` ABI;
5. assemble `GD` and `ga` with the packed matrix-transform adapter;
6. connect the rank-two suffix to packed `A*U`, packed cleanarch/sign handling,
   and `getfu`;
7. add HNF provenance witnesses and repair the immutable unit-log schema; and
8. publish an honest partial-v1-style internal result, without claiming public
   completeness.

The only large new implementation on this path is bounded cubic `genback`.
The famat, archimedean, orientation, and inverse adapters are small and should
be kept separate so that each can have a direct PARI correspondence fixture.
