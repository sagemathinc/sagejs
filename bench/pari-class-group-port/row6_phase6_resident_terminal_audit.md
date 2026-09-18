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
5. Smith invariants and class number;
6. compact rank-two unit preparation, flag-zero `getfu` factorization, signed
   real-cubic unit cleanup, and C5/C6 provenance; and
7. exact factor-base reconstruction, all 1,137 principal ideal equations, and
   the two class-witness projections.

The compiler clones this imported call graph into one generated addon. The
generated root calls `native_pari_row6_prime_degree_catalog`,
`native_pari_row14_analytic_inverse_hr`, and
`native_pari_row14_post806_terminal` directly, then calls the private bounded
unit and class graphs without returning to the host. The host authenticates the
prepared input and retained Gate-C/factor owners, compiles, and allocates all
storage before entry. The correctness run makes one native call, with no
subprocess, filesystem access, serialization, allocation, or inspection in
that call.

The exact output agrees with the prior three-addon path, including:

- analytic state `[12288, 1469]` and inverse-`hR`;
- post-HNF, acceptance, multiple, and reconstruction states;
- the 192-bit regulator and all fourteen unit-lattice entries;
- Smith invariants `[2, 2]`, class number `4`; and
- terminal state `[0,0,7,0,2,1137,0,0,2,0]`;
- the final/bridge unit transforms, exact cleaned logs, sign phases, and C5/C6
  states; and
- active factor rows `[1092,1094]`, the complete 2-by-1,130 factor map, all
  1,130 reconstructed prime ideals, and all 1,137 principal equations (7,819
  exact ideal products).

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

The existing complete correctness transaction still has three implementation
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
The class and unit part of the former fourth boundary is now closed. Their
scalar manifests use closed `TypedDict` mappings and their variable data use
bounded typed buffers. The generated native graph performs the actual exact
mathematics, while the old CPython composers are differential oracles outside
the resident call. C7 result-object construction still remains host-side
publication after these buffers are complete.

The closed scalar mapping ABI also has an executable compiler proof:
`row6_phase6_resident_mapping_obstruction.py`. It declares a standard-library
`TypedDict`, and the compiler validates and copies its required scalar fields
into a fixed-layout value before native entry. The ordinary fallback remains a
dictionary subscript. Generated native code contains neither dictionaries nor
string lookup. Arbitrary `dict[str, int]`, dynamic keys, mutation, escape,
nested mappings, and dynamically shaped values still fail closed. The
composers use precisely this split: closed scalar mappings plus bounded typed
buffers. Hashing, mutation replay, and publication inspection remain outside
the mathematical call.

## Next connected cut

The next row-6 implementation should build one static invocation manifest for
factor base, initial relations, collector, initial HNF, continuation HNFs, and
the terminal root added here. It should retain ancestry as bounded transform
state instead of rerunning HNF. C7 construction can then inspect the completed
class/unit buffers after the clock. Only that complete prepared-input graph may
enable the process coordinator timing method.
