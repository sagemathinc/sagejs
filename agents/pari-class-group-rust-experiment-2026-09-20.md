# Rust class-group experiment (2026-09-20)

## Question

Does ordinary explicit-storage Rust eliminate a material part of the overhead
seen in the compiled-Python H1 class-group graph?

The test field is the existing small real cubic

```text
x^3 - 20018*x + 20034.
```

The first implemented Rust boundary starts from the authentic 66 by 73 exact
relation presentation produced by the translated prepared-field collector and
ends at Smith invariants and class number.  It is therefore a real class-group
suffix, but **not yet** a prepared-field or end-to-end class-group computation.

## Integrity of the experiment

- The checkpoint is exported from the same seed-1 translated H1 run used by
  the current-compiler experiment.
- All 4,818 live relation cells cross the checkpoint; only 290 are nonzero.
- Rust performs 1,562 deterministic unimodular row/column operations and
  obtains 66 unit Smith entries, hence class number one and no nontrivial
  invariant factors.
- Both independent Rust representations produce the identical diagonal hash
  `7bcb0e82ddadef1ef649c72bafbfb8b409251348c49a986cccec1ddbe3982226`.
- The executable neither links nor invokes PARI.  The GMP variant uses
  `rug::Integer`; the bounded variant uses checked `i128` operations.
- Parsing, representation conversion, workspace reset, and verification are
  outside every kernel sample.

## Result

| implementation | exact kernel boundary | median |
|---|---|---:|
| Rust, checked `i128` | 66x73 presentation to Smith invariants | **1.222 ms** |
| Rust, GMP via `rug::Integer` | same algorithm and boundary | **6.333 ms** |
| Sage.js current compiler | prepared input through authenticated class witness | 1,634.500 ms |
| PARI 2.17.4 | complete prepared `bnfinit0(nf, 0)`, including units | 10.699 ms |

The last two rows are context, not matched-boundary comparisons.  The Rust
suffix omits factor-base construction, relation collection, logarithm
transforms, generator ownership, and units.  It would be false to describe
1.222 ms as a Rust class-group time or as 8.75 times faster than PARI.

The old diagnostic compiled-Python sparse-HNF/SNF partition was roughly 64 ms,
but it also performed PARI-specific cleanup, logarithm transforms, and owner
publication.  Thus the roughly 52x numerical ratio to the bounded Rust suffix
is suggestive, not a same-work performance claim.

The bounded run observed a largest absolute intermediate of
`38,497,724,496,350,993,597,661`.  This is an important result by itself:
`i64` is genuinely insufficient for even this tiny presentation under the
simple Smith schedule, while checked `i128` is sufficient.  Rust expressed
that choice directly and made the failure of the narrower representation
immediate.

## What we learned

1. Rust can make one genuine exact class-group suffix comfortably cheap.  The
   language/runtime is not imposing the tens-of-milliseconds overhead visible
   in the current generated graph.
2. Explicit bounded arithmetic matters more than Rust versus C syntax.  The
   same Rust algorithm is 5.18x faster with authenticated `i128` storage than
   with per-cell GMP integers.
3. Rust does not make the algorithm problem disappear.  The remaining prepared
   prefix—factor base, small-norm enumeration, relation admission, generators,
   and logs—is the hard part and is not implemented here.
4. This is enough evidence to continue the Rust experiment, but not enough to
   replace the Python compiler strategy.  A decisive comparison requires the
   collector to produce the same 66x73 presentation from the sanitized
   prepared maximal-order input.

## Next exact boundary

The next Rust milestone is intentionally binary:

```text
sanitized prepared maximal-order H1 input
    -> factor-base and packet construction
    -> seed-1 small-norm relation collection
    -> exact 66x73 presentation hash
```

Only after that hash agrees should the 1.222 ms Smith suffix be attached and a
Rust prepared-class-prefix time compared with the 1,634.500 ms Sage.js prefix
and 10.699 ms complete PARI run.  Replaying or embedding the seven terminal
relations would not satisfy this milestone.

## Files

- `bench/pari-class-group-rust/src/main.rs`: both exact Smith implementations.
- `bench/pari-class-group-rust/h1-rust-smith-development-receipt.json`: exact
  samples and authorities.
- `bench/pari-class-group-port/export_h1_rust_checkpoint.cjs`: authenticated
  relation/HNF seam exporter.

