# Row 6 Phase-6 resident terminal source cut

Row 6 still does **not** have a complete resident prepared kernel. This audit
records the largest connected native source cut implemented during the
resident-lifecycle campaign, and fails closed for timing.

## What is now genuinely resident

`row6_phase6_resident_terminal_root.py` mechanically composes the reviewed
ordinary-Python translations for:

1. the 6,543-prime degree catalog, including the maximal-order index prime;
2. analytic inverse-`hR` construction;
3. post-HNF acceptance;
4. regulator and unit-relation lattice reconstruction; and
5. Smith invariants and class number.

The compiler clones this imported call graph into one generated addon. The
generated root calls `native_pari_row6_prime_degree_catalog`,
`native_pari_row14_analytic_inverse_hr`, and
`native_pari_row14_post806_terminal` directly. The host authenticates the
prepared input and retained Gate-C/factor owners, compiles, and allocates all
storage before entry. The correctness run makes one native call, with no
subprocess, filesystem access, serialization, allocation, or inspection in
that call.

The exact output agrees with the prior three-addon path, including:

- analytic state `[12288, 1469]` and inverse-`hR`;
- post-HNF, acceptance, multiple, and reconstruction states;
- the 192-bit regulator and all fourteen unit-lattice entries;
- Smith invariants `[2, 2]`, class number `4`; and
- terminal state `[0,0,7,0,2,1137,0,0,2,0]`.

The check also rejects prepared/gate/precision mutations, rejects a short
publication state before publication, and proves that a fresh invocation after
the failed call reproduces the exact projection.

Run:

```bash
node --expose-gc \
  bench/pari-class-group-port/row6_phase6_resident_terminal_check.cjs
```

## Why this is not timed

This source cut begins at authenticated Gate-C and factor owners. It does not
yet replace the complete prepared-input computation, so reporting its time or
a PARI ratio would optimize and measure a suffix. The exported process
coordinator adapter therefore has `timingEligible: false`; its timing method
throws `SAGEJS_PHASE6_INCOMPLETE_RESIDENT_CUT`. It supports correctness runs
only.

## Exact remaining boundaries

The existing complete correctness transaction still has four implementation
boundaries that prevent a complete resident lifecycle:

1. The factor-base and initial-relation roots are CLI programs. Their native
   entry points are usable, but allocation and conversion into owner-shaped
   mappings live inside child-only coordinators.
2. Gate C compiles and allocates collector/HNF/continuation owners while it is
   running. Its durable state is repeatedly projected to arrays and allocated
   into the next native entry rather than supplied as one preallocated
   invocation manifest.
3. Column-ancestry replay is in-process but separately allocates and reruns the
   HNF schedule after Gate C rather than retaining the required transform state
   in the live graph.
4. The terminal class and rank-two unit composers accept nested Python
   mappings and dynamically shaped lists. Their purported `composeInMemory`
   coordinators actually spawn CPython and serialize the owners. C7 then
   consumes those mapping-valued results.

The last point has an executable minimal compiler diagnostic:
`row6_phase6_resident_mapping_obstruction.py`. Compiling its one mapping-valued
native argument currently fails with
`unsupported argument annotation AST_ItemAccess`. This is not an argument for
adding arbitrary Python dictionaries to the native ABI. The narrower and more
credible next step is to translate the mathematical portions of the class and
unit composers to bounded buffer inputs/outputs, leaving hashing, mutation
replay, and publication inspection outside the mathematical call.

## Next connected cut

The next row-6 implementation should build one static invocation manifest for
factor base, initial relations, collector, initial HNF, continuation HNFs, and
the terminal root added here. It should retain ancestry as bounded transform
state instead of rerunning HNF. Once the class/unit mapping work is expressed
as typed buffers, C7 construction can inspect the completed buffers after the
clock. Only that complete prepared-input graph may enable the process
coordinator timing method.
