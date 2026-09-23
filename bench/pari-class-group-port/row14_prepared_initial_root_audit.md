# Row-14 prepared initial-root audit

## Result

Gates A and B of the prepared-input root are complete for the authenticated
row-14 field.  A single native invocation, starting from prepared number-field
data and neutral runtime tables, reconstructed the PARI 2.17.4 initial
factor-base and relation state.  A cold oracle comparison performed only after
the invocation agreed on every checked value.  The resulting immutable owner
is ready to feed Gate C, but this lane deliberately did not run the 42-to-806
continuation.

The live result is:

```text
C1 = C2                         5,978
KC                                799
KCZ = KCZ2                        487
selected descriptors              799
subfactor indices        [2, 4, 5, 8]
initial rational relations         42
target / need                806 / 764
Nrelid / missing               4 / 757
automorphism count                    0
```

The native call took `1,225,469,767 ns` (1.22547 seconds).  The worker's
maximum resident set size was `424,436 KiB`; this is the process high-water
mark and includes compilation/runtime infrastructure, not merely the root's
owned buffers.

## Input boundary

[`row14_prepared_initial_root.py`](row14_prepared_initial_root.py) accepts the
authenticated prepared polynomial, maximal-order data, embedding data, and
neutral runtime prime/product tables.  It does not accept capsule factor-base
descriptors, a successful bound, counters, a relation schedule, initial
relations, RNG snapshots, target/need values, or capacities derived from the
known answer.

The public owner policy admits at most 1,024 selected ideals and 16 additional
relation slots.  The neutral runtime product table is sized from the exact
maximum absolute bit length of the authenticated prepared input.  This field
requires 1,470 64-bit limbs; the field-independent admission ceiling is 2,048
limbs.  Both values are recorded in the immutable owner, and inputs exceeding
the ceiling are rejected before native invocation.

The root is intentionally fail-closed and row-14-specific.  It checks the
polynomial, discriminant, signature, precision, equation index, roots of unity,
basis denominator, prime-table endpoint, and public factorization limits.  It
also requires the equal-bound corridor and rejects nonempty automorphism or
nonidentity minimum-index behavior instead of importing a preselected
permutation.

## Differential evidence

After the worker exited, the checker loaded the frozen capsule and W0 trace as
cold oracles.  It compared:

- all 799 descriptors, including `p`, generator, `e`, `f`, and every `tau`
  entry;
- the 799 selected HNF packets, norms, factor-group metadata, bad flags,
  permutation, and subfactor base;
- the final source RNG state;
- all 42 sparse and dense rational relations, metadata, hashes, and rational
  generators; and
- the complete 799-by-799 initial relation basis recovered independently from
  the W0 event.

All comparisons passed.  Three allowed prepared-input mutations were rejected.
Mutating forbidden capsule descriptors, relations, bounds, and RNG fields left
the allowed prepared-payload digest unchanged, demonstrating that those values
do not cross the invocation boundary.

The stable digests are:

```text
plain owner       b2088268bca4b735816d280d15bccb94f45faab9831bc7523c9dc671b6716ae0
gzip owner        b06f0146d8d21bfaac6f43e0e33b176d30e6b61fe480050bb51ff74d9d35b833
descriptors       0cf82c0cc5183697ec5aae15c61467875d6c1820003b8d3f7990731571f5c9e0
packets           79c04f125794fb98157ac642a35fb3e36b66c2a244a937819042f63cd2f55208
relation owner    fb66cbc68a84e4fb97175c28571c09de3beaaac16030b489c1f35228ce9a6480
RNG state         c1084b71784a5c2d2769417798403180447aee7620f68d264b34e25c8e3414ad
```

The content-addressed owner contains 3,149,152 uncompressed bytes and 136,158
gzip-compressed bytes and is published read-only.  Validation-only mode re-read
that exact owner and repeated the cold comparisons without invoking the root a
second time.

## Qualification and limits

This establishes Gate A (live frontier/factor-base construction), Gate B
(live initial rational relations), and Gate-C readiness.  It does **not** claim
that the 42-to-806 collection, HNF, units, or final class-group result ran from
this owner, nor does it make an end-to-end performance claim.  Prime
decomposition remains eager, and the general automorphism/minimum-index path is
still absent.  Those are explicit limitations rather than capsule-assisted
shortcuts.

One earlier harness attempt failed while packing the neutral product table and
made zero root calls.  The successful native result above is the first and only
root invocation.  A subsequent cold-checker field-name error (`tau` versus
`groupTau`) did not affect the immutable result; validation-only mode corrected
the oracle mapping and verified the preserved owner.
