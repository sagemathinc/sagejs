# Row-6 rank-two C5/C6 suffix

## Result

The retained row-6 Gate-C, post-1137, prepared-number-field, and full HNF
ancestry records now feed the translated rank-two unit suffix without frozen
W0 as a runtime input.  The source-replayed ancestry supplies seven exact
relation-kernel columns, their 147-cell packed archimedean image, the exact
21-bit real-sign image, and an authenticated packed value of pi.

The suffix obtains

```text
C5 state                 [0,0,0,2,7]
private getfu factor     identity 2 x 2
C6 status                2
C6 state                 [2,49,0,0,0,0,0,1]
materialization          not_given(LARGE)
unit transform shape     7 x 2
```

The exact compact transform is

```text
[1,0,0,0,0,0,0, 289737766830681,1,1,0,0,0,0]
```

and is retained despite the authentic flag-zero refusal to materialize
expanded algebraic units.  The two selected cleaned logarithm columns and
their signs reproduce the accepted regulator

```text
(3626834249414306903656792336633990244294399400949119764057, 192, 56).
```

## Authority and mutation evidence

The checker authenticates the compressed and plain Gate-C owner, exact
post-1137 result, independently authenticated prepared projection, and full
source-replayed ancestry.  The ancestry contains transforms of shapes
`1137 x 7` and `1137 x 2`, the three byte-identical packed-log checkpoints,
and exact selected sign/phase evidence.  The resulting C5/C6 owner has
canonical SHA-256
`5308cfc9a128a1b5d1667a21c84866f0c91c8db6107e777eefd9cf88c0243551`.
The full external ancestry consumed by the check is separately pinned at
`3ae88d05e68ed5687b9cb1939dca9ae641d4a09e52b914a03bd5041d919d17f7`;
the focused receipt retains that digest explicitly rather than pretending the
smaller C5/C6 owner embeds all 10,233 transform entries.

Three ancestry mutations alter an accepted real component, an exact sign bit,
and packed pi.  Seven result mutations alter the compact transform, cleaned
logs, output signs, C5/C6 states, terminal reason, and publication policy.
All ten fail closed against the exact authority.

The validated suffix itself took about 0.22--0.25 seconds in repeated capped
Python executions after its retained inputs were available.  This excludes the
much more expensive Gate-C and full-ancestry reconstruction stages and is not a
qualified comparison with PARI.

## Oracle policy and scope

W0 is optional and is opened only after the live suffix returns.  When given,
it confirms `fu = null`, the matching regulator, public `A` shape `3 x 2`,
public `U` shape `7 x 2`, and empty `CU`.  The live compact transform is an
alternate valid basis, so the checker deliberately does not claim byte
equality with frozen PARI's `U` matrix.

This closes the internal compact-unit correspondence for C5/C6, but not public
completion.  Expanded fundamental units remain absent by authentic `LARGE`
policy, and the separate class-owner/C7 join is still required.

Run without W0:

```sh
node bench/pari-class-group-port/check_row6_rank2_c5_c6.cjs
```

Add the postcompute differential explicitly:

```sh
node bench/pari-class-group-port/check_row6_rank2_c5_c6.cjs \
  --w0 /scratch/sagejs-pari-development-panel-a998/panel-06-26fed17015f6479f.json
```
