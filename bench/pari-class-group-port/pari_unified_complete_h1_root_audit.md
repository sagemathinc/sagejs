# Unified prepared-`h = 1` completion frontier

## Boundary

`pari_unified_complete_h1_root.py` is one source-transparent native entry that
currently composes three live computations without host serialization:

1. `pari_unified_live_h1_root`, which constructs and accepts the resident
   class candidate and publishes compact rank-two unit provenance;
2. `pari_live_h1_class_witness_suffix`, which derives the `8 x 15` relation to
   `8 x 8` presentation maps and proves the Smith quotient is trivial; and
3. `pari_exact_real_cubic_torsion`, which proves that the roots of unity of the
   irreducible totally real cubic are exactly `{+1, -1}`.

The root reserves the complete workspace/output ABI of
`pari_unified_full_h1_suffix` arguments 8 through 42.  Its first eight inputs
are intentionally absent from the public ABI: a connected suffix must receive
the live polynomial, basis, multiplication tensor, relation generators,
cleanup transform, active HNF transform, compact provenance, and accepted
regulator directly from prefix owners.

## Honest stopping point

The current root does not invoke the forthcoming live precision-retry suffix.
It therefore returns status `4`, records missing stage
`MISSING_LIVE_PRECISION_SUFFIX`, keeps correspondence and public-completion
bits zero, and leaves every final fixed-shape output owner unchanged.  The
reserved suffix authority state is erased and marked `-1`; a caller cannot
turn a detached or expected suffix status into authority.

The component publications from the prefix, exact class witness, and torsion
leaf remain available for inspection.  They are not mislabeled as the final
immutable result.

## Answer-shaped inputs

The inherited resident prefix presently accepts analytic discriminant and
roots-of-unity scalars.  Before calling it, this root recomputes the cubic
discriminant from `prep_polynomial`, requires positive discriminant, and
requires the real-cubic roots-of-unity value two.  Thus neither scalar can be
used to inject an expected final answer.  The precision authority, exact
units, regulator replay, and final output buffers are all output-only owners.

## Transactionality and mutations

The focused checker initializes every final mathematical owner to sentinel
`777`, initializes the reserved precision authority to an apparently
successful transcript, and invokes the one native root.  The computation
reaches 73 accepted relations, the exact trivial Smith quotient, and exact
torsion order two, but it destroys the submitted precision status and leaves
all final sentinels unchanged.

The checker also mutates the defining polynomial to reducible and non-real
cubics.  Both the generated native leaf and ordinary CPython fallback reject
without changing the torsion outputs or publication state.

## Focused receipt

On Linux x86-64 at integration base `c461638a3`, the command

```text
node bench/pari-class-group-port/check_pari_unified_complete_h1_root.cjs \
  /tmp/sagejs-prepared-class-inputs-MRFSOe/inputs.json \
  /tmp/sagejs-analytic-invhr-d88QqB/fixtures.json \
  /tmp/sagejs-initial-kummer-catalog-Kc48PL/fixtures.json
```

passed with native cache key
`db674bd650efe021a3a671b70ccf08725be4043835ed7dfb91ed3ecc6d1f08b2`.
The isolated core contains all three intended calls and no Node-API, V8,
JavaScript, or Python callback.  The checker separately exercised the new
torsion leaf under CPython.

## Next insertion

The live precision component should be inserted immediately after torsion and
must write the already-reserved `precision_*` owners itself.  Only after its
terminal authority state validates exact unit reconstruction, p2,176 log
rebuild, and regulator replay may the root copy the class, unit, regulator,
and torsion evidence to the `final_*` owners and atomically set
`correspondence_complete = published = 1`.  Public saturation remains a
separate false bit.
