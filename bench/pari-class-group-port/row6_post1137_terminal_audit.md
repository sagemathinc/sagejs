# Row-6 post-1137 terminal arithmetic audit

## Result

The immutable row-6 Gate-C relation/HNF owner now feeds the shared ordinary
Python post-HNF arithmetic without importing a terminal answer.  From the
authenticated prepared-number-field projection, factor-base owner, and Gate-C
owner, the live computation obtains

```text
analytic acceptance code                   0
class number                               4
Smith invariants                         [2,2]
regulator       (3626834249414306903656792336633990244294399400949119764057,
                 192, 56)
accepted unit-lattice shape              2 x 7
```

The accepted lattice is the exact 14-entry regulator-reconstruction lattice,
not yet PARI's later `7 x 2` compact fundamental-unit transform.  The latter is
checked only as a postcompute differential and remains outside this owner's
claim.

## Authority and oracle boundary

The retained input identities are

```text
prepared authority  1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0
factor-base owner    1afc78df4b2ff4fe85dd3385589835095c8123da86082de0f66dce4e0897fbef
Gate-C owner         6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98
frozen W0            2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5
```

Both compressed owners must be mode 0444 and match their compressed and plain
SHA-256 identities.  The prepared projection has a separately pinned file
digest and authenticated mathematical-authority digest.  The capped worker
reads only these three inputs.  Frozen W0 is opened only after the worker exits
and serves solely as a differential oracle for acceptance, class number,
Smith invariants, regulator, and the shapes/policy of PARI's subsequent unit
event.

Six boundary mutations independently alter prepared authority/data, Gate-C
authority/state, and factor authority/state.  Three result-owner mutations
alter its authority, mathematical result, and bytes.  All nine are rejected.

## Resource contract

The live checker uses a 4-GiB address-space/RSS ceiling, 600-second CPU and
wall ceilings, and a 3-GiB V8 old-space ceiling.  The dominant retained owner
is the already-qualified Gate-C state.  Post-HNF work has 1,130 factor-base
rows, a `2 x 2` H block, a `21 x 1137` transformed-log block, and an analytic
catalog of 6,543 primes with at most 19,629 residue-degree slots.

A cached-artifact capped run completed the mathematical worker in
`25,482,363,880 ns` at `515,372 KiB` maximum RSS.  It published a 2,341-byte
mode-0444 checkpoint owner with SHA-256
`2f9ee729818e65d11fdd810fa139a2b8bafff95913b9dcfebb94b72b7467f2a0`.
This is focused correctness/resource evidence, not a qualified comparison with
PARI and not a measurement of the preceding relation/HNF computation.

For development without repeating native compilation, the checker also accepts
an already computed host JSON through `--postcompute-output`.  That route
authenticates and seals the same result but explicitly records that it is not a
capped timing measurement.

## Honest incompleteness

This checkpoint is not an end-to-end class-and-unit result.  It does not retain
the full Smith transform, construct the two class-generator ideals, prove their
orders, replay principal-relation witnesses, reconstruct PARI's compact
fundamental-unit transform, or compose C7.  Accordingly both
`correspondenceComplete` and `publicComplete` are false.  Frozen W0 says the
later flag-zero unit event has `A` shape `3 x 2`, `U` shape `7 x 2`, empty
`CU`, and `fu = null`; none of that later answer is a runtime input here.

Reproduce the focused postcompute check with

```sh
node bench/pari-class-group-port/check_row6_post1137_terminal.cjs \
  --postcompute-output /tmp/row6-post1137-result.json
```

Omit `--postcompute-output` to execute the post-1137 native worker under the
declared resource cap.
