# Panel row 23: first authentic relation collection and HNF

The row-23-specific bounded collector closes the exact blocker identified by
the initial-relation frontier. Starting only from the authenticated prepared
field and its live 31-ideal factor owner, one connected native call now:

1. initializes the empty relation cache;
2. visits the 31 live ideal packets in the computed factor-owner order;
3. collects all 40 required relations with owned exact generators;
4. constructs the resident logarithm columns; and
5. completes the first sparse HNF.

The isolated source graph consists of `row23_unreduced_small_norm.py` and
`row23_connected_relation_hnf.py`. The former admits exactly degree five,
31 prebuilt packets, zero initial relations, target 40, precision 192, five
real places, and the first non-outer small-norm pass. The latter preserves the
shared connected-HNF ABI and differs only in selecting that bounded collector.
The already-audited row-21 collector contract is unchanged.

The authentic terminal state is:

```text
relation = [40, 450, 0, 1, 0, 40]
chain    = [3, 0, 0, 40]
HNF      = [1, 10, 30, 0, 9, 3, 0, 40, 0]
schedule = [21, 1, 1, 1]
progress = [3, 40, 1, 1]
```

The HNF result has the single nonzero invariant `6`; all dependency-owner
entries are zero. This agrees with the frozen trace's one-by-one exact `W=[6]`
and proves the cyclic order-six relation-lattice quotient at this boundary.
The transform `B` is intentionally not compared entry-for-entry: the live
factor owner preserves its computed ideal order, while equivalent equal-degree
prime ideals can be ordered differently from the frozen trace. Importing the
frozen column permutation would make that comparison easier but would violate
the experiment's dependency policy.

The first cold execution took about 165 seconds including native compilation.
A subsequent cached execution took about 19.4 seconds. Both are diagnostic
development-host observations, not qualified timings.

Reproduce with a lane-private cache:

```sh
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-native-cache-row23-relations-hnf \
SAGEJS_NATIVE_CACHE_ROOT=/scratch/sagejs-native-cache-row23-relations-hnf \
node bench/pari-class-group-port/check_row23_first_hnf.cjs
```

This establishes authentic row-23 relation collection and first HNF. It is not
yet unit reconstruction, regulator acceptance, class generators, the complete
class-and-unit result, or qualified performance evidence.
