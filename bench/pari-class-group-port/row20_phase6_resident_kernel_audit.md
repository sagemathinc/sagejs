# Row 20 Phase-6 resident-kernel cut

This cut removes the two semantic boundary violations previously identified for
qualification row 20:

- factor-base construction now returns a retained live owner without writing a
  compressed owner to the filesystem; and
- the C3--C6 rank-two unit path is one compiled typed-Python call graph.  It no
  longer starts CPython or serializes the live HNF/acceptance owners.

`row20_phase6_resident_unit_root.py` is not a benchmark-only restatement of the
answer.  It calls the translated integer and real LLL, logarithm-transform,
`cleanarchunit`, and `getfu` functions.  All workspaces are explicit borrowed
buffers.  The generated call graph contains the full transitive arithmetic
closure and performs no filesystem or subprocess operation.

The fresh check authenticates the prepared input, rejects four mutations,
prepares every maximum-capacity owner once, then runs factor construction,
14-relation HNF, analytic/regulator acceptance, and the unit root twice on the
same owner graph. The factor root writes the relation primes, local descriptor
data, ideals, norms, groups, and permutations directly into retained HNF
ingress buffers. HNF and acceptance outputs are likewise the exact owners
consumed by their successors. The check verifies stable owner identity, equal
repeated projections, and both unit norms from the live multiplication tensor.
Under a 4 GiB address-space limit and 600 second wall limit it produced:

```text
class number: 1
HNF state:    0,7,7,0,7,4,0,14,0
units:        [7,-7,15,-9,9], [-27,15,8,6,-9]
unit norms:   -1, -1
unit state:   0,0,0,0,0,0,2,1
second clock: 4.058664856 s
```

Receipt:

```text
/scratch/row20-phase6-aggregate-kernel-check-v2.json
semantic sha256 b6a844c8ca857090bbd975f8222752be89130b421313c85d90abe77cf32cfeb7
```

Run it with:

```sh
ulimit -v 4194304
timeout 600s node \
  bench/pari-class-group-port/check_row20_phase6_resident_kernel.cjs
```

## Matched-clock boundary

`prepareResident` performs authentication, compilation/cache access, owner
allocation, setup-oracle comparison, argument binding, and reset-snapshot
construction. `resetResident` restores those buffers before the clock starts.
The inclusive clock contains one call to a private aggregate typed-Python root
and no owner allocation, filesystem access, subprocess, reset, projection, or
serialization. The aggregate body calls the six imported mathematical roots in
sequence and propagates their status. Its ABI has 450 retained arguments and
its generated C is approximately 3.37 MB. It reports
`allocationFreeMatchedClock: true`.

The cut is not yet the public class-group API (`publicComplete: false`). It also
does not claim that the native roots perform no internal GMP scratch activity;
the proved property is that all algorithmic input/output/workspace owners are
prepared and retained across calls.

The next performance cut should profile the approximately four-second resident
interval by native stage. The likely dominant work is relation/HNF or unit
reconstruction rather than the now-resident boundary machinery.
