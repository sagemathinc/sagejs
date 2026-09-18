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

The fresh check authenticates the prepared input, rejects four mutations, runs
factor construction, 14-relation HNF, analytic/regulator acceptance, and the
unit root in one invocation, and verifies the exact two unit norms from the
live multiplication tensor.  Under a 4 GiB address-space limit and 600 second
wall limit it produced:

```text
class number: 1
HNF state:    0,7,7,0,7,4,0,14,0
units:        [7,-7,15,-9,9], [-27,15,8,6,-9]
unit norms:   -1, -1
C6 state:     0,3,-186,0,-185,1,2,-1
```

Receipt:

```text
/scratch/row20-phase6-resident-kernel-check-v3.json
sha256 f74193a351f9a7fd11298a07d9f67cb5228497990f98668d8e4ac39cce93083f
```

Run it with:

```sh
ulimit -v 4194304
timeout 600s node \
  bench/pari-class-group-port/check_row20_phase6_resident_kernel.cjs
```

## Remaining matched-clock blocker

This is an honest resident mathematical transaction, but it is **not yet a
qualified timing arm**.  The factor, HNF, and acceptance host adapters still
allocate their native owner buffers inside `runResident`; their signature
helpers also read source files and re-enter the compiler cache API.  Therefore
the result deliberately reports `allocationFreeMatchedClock: false`, and no
Sage/PARI timing ratio may be published from this adapter.

The next exact source cut is executable and narrow:

1. make factor-base generation write descriptors, ideals, norms, permutation,
   and state into fixed maximum-capacity buffers supplied by the caller;
2. split the HNF and acceptance hosts into `prepareInvocation` (compile,
   authenticate, allocate) and `runInvocation` (buffer writes and arithmetic);
3. clone factor -> relation/HNF -> acceptance -> unit materialization beneath
   one native root, with all maximum shapes checked before entry; and
4. move the two final unit norm witnesses into that root, then expose only the
   fixed common class/unit projection after the clock stops.

Until those four items land, row 20 is correctness-complete at the resident
boundary but remains fail-closed for Phase-6 matched timing.
