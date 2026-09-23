# Row-6 prepared Gate-C audit

## Result

The authenticated row-6 prepared factor-base and initial-relation owners now
continue through the complete live relation/HNF schedule.  The translated
computation starts from 203 retained principal relations, constructs the first
1,133-column HNF state, survives the authentic retry stalls, and terminates at
1,137 relations with no dependent row.

```text
checkpoint columns       1133  1136  1137
H diagonal                  2,2   2,2   2,2
dependent rows                4     1     0
new relations               930     3     1
collector passes             14
final relation state       [1137, 11420, 0, 0, 1137, 1137]
```

The second pass stalls at 1,133 columns.  Passes 3 through 12 stall at 1,136;
pass 13 obtains the final relation.  Counting the initial collection gives 14
passes.  Every checkpoint state, relation, exact logarithm, selected HNF block,
and permutation matches the frozen PARI W0 trace exactly.

## Authentic search policy

The first qualifying collection exposed a degree-specific constant which had
been obscured by earlier quartic work.  For this cubic, PARI uses the
degree-three ball volume

```text
2 * (2*pi/3)
```

so the search scale is `2000 / (2 * (2*pi/3))`.  Reusing the quartic
`4000/pi^2` scale produces a different relation stream.  Preserving PARI's
evaluation order yields exactly 1,133 columns at the first HNF and the frozen
continuation schedule above.  No relation, HNF state, or answer-bearing W0
value is injected into the live computation.

## Ownership and bounded storage

The worker consumes only the authenticated prepared projection and immutable
factor-base/initial-relation owner chain:

```text
prepared authority
  1620c2d7e9ab145eb7400c3dd0e5dc8c2c689ef88f250f2800dde05768b493a0
factor-base owner
  63400f72e6fb39da326daf57bcceba7810400ee9619abae5264da17af4f0570c
initial-relations owner
  9887a25a21fd040f76a335398c1dfb8569238ecdf22a29f6c31eb37eea5333e1
frozen W0
  2736e19b166c11a5997a6825cd99b612ae23cf6740d2248ac3dd91bc883286a5
```

The owner chain is hash-checked and read-only before mathematics begins.  The
answer-bearing W0 trace is opened only after the capped worker exits, when it
serves as a differential oracle.  Three adversarial input-boundary mutations,
five material published-owner mutations, an attempted duplicate publication,
and a second immutable read are checked.

The collector uses compact relation storage and a 16-limb general exact
corridor.  Cubic-only scratch shapes are bounded explicitly.  Before the first
HNF, non-durable collector scratch is released while relation, log, scheduler,
and cache owners remain live.  HNF uses six-limb general storage and a 16-limb
exact transform corridor.  Its scratch graph is then released before collector
scratch is rebuilt around the durable owners.  Incremental HNF appends retain
only H, the dependent block, B, transformed logarithms, and the permutation.
There is no retained full global transform and no retained historical
checkpoint matrix graph.

The qualifying worker is limited to 4 GiB address space, 600 CPU seconds, 600
wall seconds, and a 512 MiB V8 old-space ceiling.  Its conservative
simultaneous-owner upper bound is 2,210,319,968 bytes.  Under a contended
integration run, the live mathematical call took `322,252,784,611 ns`
(322.253 seconds) with maximum RSS `1,133,356 KiB`.  An isolated replay took
125.593 seconds; the slower capped receipt is retained as the qualifying run.

## Differential evidence

For all three HNF checkpoints, the checker compares SHA-256 projections of the
complete frozen and live structures:

- all dense accepted relation records;
- all exact logarithmic embeddings;
- H, dependent, and B blocks;
- transformed logarithmic block C; and
- the complete permutation.

The final relation hashes, origins, automorphism metadata, and degree-three
principal generators also agree exactly.  The immutable result retains the
1,137 relation records and logarithms plus only the final selected HNF blocks.
Publication is exclusive and read-only; replay cannot overwrite the first
owner.

The qualifying immutable owner is 6,456,410 bytes before compression and
477,655 bytes after compression:

```text
plain SHA-256
  6b6a4ee102f8682254470dc8e7d05f63d5e449282df248a15bc54b938adaac98
gzip SHA-256
  526cf175619801919509bdf21d4296a31864876e3d563a3728678e66b80b813d
```

## Qualification boundary

This closes row 6's prepared live relation/HNF Gate C.  It deliberately stops
before analytic acceptance, class-generator reconstruction, units, regulator,
and final public result construction.  The frozen field is known to continue
to class number 4 with invariants `[2, 2]`, but this owner does not claim or
publish that answer because it lies beyond the qualified cut.
