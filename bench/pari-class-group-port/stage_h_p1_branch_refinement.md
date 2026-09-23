# Stage H/P1: raising-guard path refinement

## Result

Compiler commit `a99b79c87` adds fail-closed interval refinement through
simple raising guards and preserves immutable scalar facts through bounded
`range(int64)` loops.  It changes no mathematical Python source.

The frozen Stage-G catalog replay passed unchanged.  As expected for this
enabling milestone, P1 alone does not prove a fourth direct-copy edge: the
prepared graph still has the same three unconditional direct-result calls in
`int64_pari_flxq_powu`.  The emitted C is byte-for-byte identical to the G2
control:

```text
G2 core SHA-256       1db8d76a096ff7076f1811f0beb0ccdf4064685e280f6a35cb09cd7026213252
P1 core SHA-256       1db8d76a096ff7076f1811f0beb0ccdf4064685e280f6a35cb09cd7026213252
G2/P1 core bytes      6,322,765 / 6,322,765
G2/P1 addon bytes       354,880 /   354,880
G2/P1 ELF text bytes    347,455 /   347,455
```

One seven-pair identity check measured a geometric-mean ratio of
`0.999532260` (P1/G2).  Since the generated source and binary are identical,
this is an environmental identity control, not evidence of a performance
change.

Exact selected evidence is in
[`stage_h_p1_branch_refinement_evidence.json`](./stage_h_p1_branch_refinement_evidence.json).

## Safety boundary

Refinement is accepted only when the final condition producer is a boolean
`int64.compare` or `uint64.compare` whose two operands have exactly the
corresponding scalar type.  The analysis handles reversed operands and
`lt/le/gt/ge/eq/ne` true and false successors.  An arm is removed from the
successful join only when its reachable outcomes are exclusively `raise`.

The focused suite covers overwritten conditions, absent operands, mixed
signed/unsigned comparisons, non-boolean results, return-before-raise,
assigned loop scalars, post-preparation mutation, and signed endpoint cases.
It passed 21/21 tests.  `pnpm architecture:check` and
`pnpm test:baselib:strict` also passed, with zero strict errors.

## Fourth-edge implication

The read-only frontier analysis identified the precise missing facts for
`_int64_pari_flx_small_ddf:200`:

```text
len(w) >= 393
t in [81,108]
dt in [0,4]
tr == 211
```

P1 already preserves the root and constant output start, but it cannot derive
`t` or `dt`.  Those require a successful squarefree return bound and a sound
metadata-content fact.  Consequently this stage deliberately makes no
fourth-edge or speedup claim.  The next experiment is a separately
authenticated guarded direct-result edge: test the missing degree/span facts
at runtime, use the status-free core on success, and retain the exact checked
fallback otherwise.  This measures the ABI opportunity without trusting an
unproved mathematical postcondition.

