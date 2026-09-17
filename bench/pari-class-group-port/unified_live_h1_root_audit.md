# Unified live H1 native root

`pari_unified_live_h1_root` is one ordinary CPython-parseable `@native` root.
Its first 351 parameters are mechanically identical to
`pari_resident_generated_class_attempt`. The remaining parameters are the live
bridge outputs and workspaces, an eight-word fixed-width preparation-state
adapter, and a four-word publication state.

The compiled body calls the resident generated candidate and then, only for the
exact terminal state `[4, 0, 0, 1]` with class number one, calls
`pari_live_h1_owner_bridge`. The accepted HNF arch, relation lattice, regulator,
factor-base state, HNF state, acceptance state, candidate state, and class-number
owner pass directly between those calls in one generated addon. No file,
fixture, JSON join, or PARI call occurs in the computation.

The bridge dimension is read from the successful live `hnf_state[1]`, checked
against the accepted arch and relation-lattice owner capacities, and passed to
the bridge. The root does not inject the observed seven-column answer; the
focused checker independently asserts that the live dimension is seven.

The resident candidate and bridge now share the exact `IntegerBuffer`
representation for `prep_state`. The root passes that owner directly, with no
eight-word adapter and no copy of any mathematical owner.

`unified_state` exposes status, candidate status, bridge status, prefix-ready,
public-complete, columns, relation count, HNF rank, KCZ, KCZ2, unit rank, and
compact-factor count. Prefix-ready becomes one only after both calls return
exact success. Public-complete remains zero because exact unit expansion and the
downstream precision authority are outside this prefix. A completed prefix is
replay-idempotent; a partial root is rejected rather than re-entered.

The focused checker reuses the resident checker's sanitizer only to construct
prepared inputs and fresh owners outside the computation. It compiles this root,
checks that the generated isolated core contains both calls and no host callback,
runs one GMP-native entry, verifies the exact class and bridge state, and checks
terminal replay immutability.
