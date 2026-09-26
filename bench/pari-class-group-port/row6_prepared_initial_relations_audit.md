# Row-6 prepared initial rational-relation audit

## Result

The authenticated row-6 real cubic now continues from its immutable prepared
factor-base frontier through PARI 2.17.4's initial rational relations.  One
native invocation reproduces the frozen trace exactly:

```text
factor-base rows (KC)                         1,130
complete rational-prime groups (KCZ)            740
initial rational relations                      203
target                                         1,137
need                                              934
missing after initialization                      927
BNF_RELPID (Nrelid)                                 4
relation-record reserve                        11,420
```

The successful invocation took `86,272,018 ns` (0.086272 seconds) and the
4-GiB-capped child reported `264,652 KiB` maximum RSS.  The published owner is
only 38,905 bytes uncompressed and 7,323 bytes compressed because it retains
the 203 records and 593 nonzero modular-basis entries sparsely.

## Boundary and source correspondence

[`row6_prepared_initial_relations.py`](row6_prepared_initial_relations.py)
translates the `init_rel` step at approximately `buch2.c:3556-3581`.  It calls
the existing ordinary-Python `pari_initialize_owned_relations`, which builds a
relation for each complete rational-prime group, inserts it into the resident
modular cache and retains the exact rational generator `(p,0,0)`.

The child accepts only:

- the authenticated prepared maximal-order projection;
- a mode-0444, content-addressed row-6 factor-base owner produced and checked
  by the preceding committed frontier; and
- fresh relation storage sized from that owner's live `KC` and `KCZ`.

It does not receive W0, initial-relation answers, later relation candidates,
the 14-pass source schedule, an HNF checkpoint, or any class/unit output.  The
native root validates the frozen field corridor and the internal factor-owner
dimensions before it writes.  Its publication word remains negative until the
entire initial cache has succeeded.

The factor owner supplies the live RNG snapshot, but `init_rel` consumes no
randomness.  All 66 unsigned words remain exact.  The next random collector
therefore starts from the authentic source state rather than a reset or an
answer-provided snapshot.

## Storage discipline

This cut allocates the storage PARI's relation cache logically requires:

```text
modular relation basis cells                1,276,900
reserved relation-record cells             12,904,600
full HNF/SNF transformation cells                   0
retained HNF checkpoint cells                       0
```

The large record reserve is fixed by PARI's source formula
`10 * (KC + additional) + 50`; it is not a durable transformation matrix and
only its 203 initialized rows cross publication.  The lane deliberately stops
before the large 14-pass collection/HNF schedule.  In particular, it does not
materialize a 1,130-square exact transformation owner or retain every future
checkpoint.

## Differential and mutation evidence

The pristine trace remains:

```text
/scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json
SHA-256 2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5
```

The checker first completes the factor-frontier checker.  It then launches the
new stage under a 4-GiB address-space limit, 600 CPU seconds and 600 wall
seconds.  Only after the native child exits and publishes its immutable owner
does the parent extract the answer-bearing PARI `initialized` event.  The
1,130-square oracle basis is projected to sparse triples rather than kept as a
second dense owner.

All 203 relation rows, their first-nonzero hints, rational multipliers, exact
three-coordinate generators, origins and automorphism tags agree.  All 593
nonzero modular-basis entries agree.  The retained digests are:

```text
owner       9887a25a21fd040f76a335398c1dfb8569238ecdf22a29f6c31eb37eea5333e1
basis       627b28a7d2db6c51600c7b27d5c2103d993f2aa11f5da19cc1c67fd3b182e9b2
records     2585b7736b926d86e8021a7051053e2cefc10c3cf7b8aad28199c884369cac64
RNG         2711135312f700cb58554b7d93b3932a55c9e317a2bef877ae4d1b396b533d94
```

Two prepared-input mutations, three factor-owner mutations and five result
mutations are rejected.  A second call against the published buffers is
rejected before mutation, and a second authenticated read of the immutable
owner is identical.

## Scope

This proves the prepared factor-base-to-initial-relations cut only.  Random
relation collection, HNF/SNF, unit reconstruction and final class-group
assembly remain outside this owner.  The next row-6 cut must preserve this RNG
and cache state while using bounded reused storage across the 14-pass schedule;
this result does not authorize a giant durable transformation history.
