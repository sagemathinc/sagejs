# Row-13 prepared Gate-C audit

## Result

The authenticated row-13 prepared owner now continues through the complete
live relation/HNF schedule.  The translated computation starts from the 54
prepared rational relations, constructs the first 995-column HNF state, runs
the two authentic no-relation stalls, and terminates at 1,006 relations with no
remaining dependent row.

```text
checkpoint columns       995  996  999  1000  1001  1002  1005  1006
dependent rows            11   10    7     6     5     4     1     0
new relations            135    1    3     1     1     1     3     1
collector passes          10
final relation state      [1006, 10110, 0, 0, 1006, 1006]
```

Pass 1 stalls at 995 columns and pass 8 stalls at 1,005 columns.  The other
passes advance exactly as frozen PARI W0 does.  The final schedule flag is set
only on the pass that reaches 1,006.

## Newly closed exact boundaries

The prepared field contains 384- and 448-bit real components, so the existing
384-bit ceiling was not enough to reconstruct its logarithms.  Commit
`2644f1053` raises only the exact real logarithm, arctangent, complex logarithm,
and complex argument corridor to 448 bits.  Lower-precision behavior remains
covered by the expanded PARI differentials.

The first HNF also needs an exact 72-by-72-by-71 CUP update.  The same commit
raises that explicitly bounded bridge from 200,000 to 500,000 operations.  It
does not introduce an unbounded transform owner.

The second collector pass exposed a separate honest frontier: its rounded norm
is

```text
153478191335764572837
  = 3^2 * 7 * 37 * 179 * 1913 * 3851 * 6637 * 7523.
```

At 68 bits it passed the translated `Z_ppo` support test but stopped at the old
word-factor boundary.  PARI instead calls arbitrary-precision `absZ_factor`.
Commit `338f89654` adds the narrower operation actually justified here: after
the exact support proof, divide by the authenticated prepared prime catalog.
This deterministically completes every supported smooth norm at arbitrary
integer precision and retains an explicit residual for a direct caller without
that proof.  The authentic norm and two larger controls match PARI
`absZ_factor` under CPython and the JavaScript, GMP, and tagged compiled
backends.  The existing 278 word-factor cases and 344 connected admission
cases still pass.

## Transaction and resources

The checker consumes only these immutable owners:

```text
prepared projection
  8e982cf9703ced18cb815b5d18bcdf3596b28c8b455ff8c01cb1cd9f5a8aad51
prepared root, plain
  9cf71f92330b0477388a4d7d5676d53fc02b352015dcf9cc8d0f422e5863378b
prepared root, gzip
  f3c33401b8d98069c0c75299a08088c6cc7d42bcdb3b329524bd135236a92404
frozen W0
  50df5fa8a7b676b5216fecf2f57f3c9c60564c420a31bd0f5524447999694589
```

It verifies hashes and read-only modes before invoking mathematics.  The W0
file is opened only after the capped worker exits.  Three adversarial boundary
mutations are rejected.

The qualifying worker used a 4 GiB address-space limit, 600-second CPU limit,
and 600-second wall timeout.  Its live mathematical call took
`127,394,229,209 ns` (127.394 seconds), with maximum RSS `1,546,392 KiB`.
The conservative simultaneous-owner upper bound is 2,163,051,764 bytes.  Large
first-HNF scratch owners are dropped before continuation; each append retains
only the resident H, dependent block, B block, logarithmic block, and
permutation.  No global transformation matrix or full checkpoint scratch graph
survives an HNF call.

## Differential evidence

At every checkpoint, the following match frozen W0 byte-for-byte:

- all accepted dense relation records;
- all raw exact logarithmic embeddings;
- the H block and dependent block; and
- the basis-versus-dependent permutation partition.

The live B, transformed-C, and within-partition permutation representations are
not byte-identical to W0.  They are the resident transforms selected by the
translated HNF path: the schedule, ranks, relation owner, raw logarithms, H,
dependent block, and selected row sets are identical, while the internal basis
coordinates use a different valid pivot representation.  The checker records
both sets of hashes instead of claiming false representation identity.  A
later terminal lane must consume the live B/C/permutation consistently; it
must not replace them with W0 values.

## Qualification boundary

This closes row 13's prepared relation/HNF Gate C.  It does not yet construct
the class generators, unit lattice, regulator, or final public result.  It also
does not claim that every general integer has a newly translated
general-purpose factorization algorithm: the completed path is the exact
smooth-norm corridor reached after the prepared-support proof.
