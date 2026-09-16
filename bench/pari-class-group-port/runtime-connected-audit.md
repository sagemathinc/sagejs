# Connected regulator runtime audit

Date: 2026-09-15. Static inspection only; no concurrent-load timing or
whole-engine performance claim. The two items below are concrete generated
cost candidates, not a measured ranking of elapsed-time bottlenecks.

## Evidence identity

Inspected the in-progress `regulator_acceptance.py` artifact with cache key
`9b9b30dab4805d9c49cc7ee56af396f6ee04dfb7aaf40612d94a344c66b657ce`,
source hash `e4db0cc565359899f99f7fc95ae416b827686ff8d8af154e337c425a24c7a54d`,
native ABI 23. Its `kernel_core.c` SHA-256 is
`1d2289ed692a482da399525437b2c7de5b7554f96530196c1fe1b94b0ea2e8cc`.
The file is under this directory's ignored `.sagejs-native-kernels/<key>/`.
Line references below are physical lines in that exact generated file, not
the `#line` remapping. The manifest's `coreSourceMap` supplies IR IDs and
Python provenance. Root checkout at inspection was `a0b0bd9c178d9c0aeeb25555e5c3a90bd63f846b`;
acceptance was uncommitted work in progress.

The GMP C entry at line 191421 calls `native_pari_regulator_acceptance`
directly. This audit concerns that path. Generated word and tagged versions
also exist: these findings must not be generalized into identical execution
counts for all backends.

## 1. Machine-sized control remains arbitrary-precision in the GMP path

`regulator_multiple.py:145` copies one scalar slot:

```python
basis[3 * target * rows + i] = prepared[3 * j * rows + i]
```

Generated lines 151969–152010 (IR 269–276) execute **four `mpz_mul` and two
`mpz_add` calls per copied slot just to form the two offsets**, followed by
two `sagejs_mpz_integer_buffer_index` calls. Loop induction also uses
`mpz_add` and comparisons. This excludes actual integer-buffer data movement
and all setup, so it is not a total operation count.

When this copy loop is reached, the preceding rank check guarantees exactly
`rows` selected columns, each containing `3 * rows` scalar slots. Thus this
one source statement emits `12 * rows**2` GMP multiplications and
`6 * rows**2` GMP additions for address arithmetic on its successful path:
192 multiplications and 96 additions at `rows == 4`. This is a static path
count, not a claim about processor instructions or relative runtime.

The issue recurs in reconstruction, rather than being just a copy-loop
artifact. `regulator_reconstruction.py:161–162` forms `at = 3 * i`, then
loads `coordinates[at], coordinates[at + 1], coordinates[at + 2]`.
Generated lines 180362–180410 use one `mpz_mul`, two `mpz_add`, and three
arbitrary-integer index conversions for those three loads. The mantissa
genuinely needs arbitrary precision; the loop counter and offsets do not
need that same representation on any allocatable owner.

**Bounded remediation:** keep mantissas/lattice coefficients arbitrary, but
convert validated dimensions and induction variables to checked machine
types, preserving overflow errors and Python indexing semantics. Propagate
that distinction through helper signatures and constant-offset expressions.
Prefer a compiler range/representation improvement if it can infer these
facts soundly; an explicit checked-source experiment can establish the
benefit first. Existing `Int64Buffer` state storage alone does not establish
machine-sized types for `int` dimensions and derived expressions in this path.
Do not substitute a whole-function signed-word fast path: 128-bit mantissas
already make that inadequate.

## 2. Small real division emulates a stack array with a packed big integer

Upstream `src/kernel/gmp/mp.c:758–762` allocates a short stack chunk, copies
words, and reads `y[2]`/`y[3]`. Its following loop updates individual words
with carry/borrow arithmetic. The port correctly preserves those arithmetic
decisions, including discarded product halves, but represents `r` and `y`
as packed arbitrary-precision integers.

`small_real_division.py:18–22` implements a word store as extraction,
subtraction of the old shifted word, masking, shifting, and addition of the
new word. The generated `native_pari_division_set_word` starts at line
168583. Each successful invocation initializes and clears **four `mpz_t`
scratch objects** and executes 19 annotated IR operations. These include
rebuilding `(1 << 64) - 1`, calculating `64 * index` with `mpz_mul`, and
multiple whole-packed-integer shifts and arithmetic operations. The adjacent
`native_pari_division_word` similarly has four scratch lifetimes and 13 IR
operations merely to extract a word. Scratch initialization is not itself
proof of a heap allocation; allocation behavior requires measurement.

**Bounded remediation:** use a fixed-size local unsigned-word array or a
borrowed, explicitly sized `UInt64Buffer` workspace for these two short
arrays. Retain the literal loop and carry/borrow branches. Word products and
two-word quotient/remainder require a proper wide-intermediate or portable
word primitive, not unchecked signed overflow. A nonescaping fixed-size
local array is an especially reusable compiler feature; borrowed storage is
an available architectural alternative if local arrays need broader work.
Constant folding the mask helps but does not remove the packed-array cost.

This is a representation change, **not permission to replace the loop by
whole-mantissa division**. That replacement previously failed a one-bit
PARI equivalence test. Keep the near-unit, repeat-thirds division controls,
unequal precisions, inverse-matrix regression, and connected regulator
transcripts as mandatory correctness gates.

## Measurement decision

After the connected work-matched computation is available, instrument call
counts or profile symbols on an isolated host, then run paired measurements
for each change separately. Compare GMP and tagged paths explicitly and
report ingress separately from resident computation. Retain source/IR/core
identities and unchanged PARI result/branch transcripts. Neither the size of
this generated source nor these static counts establish a slowdown factor,
and they do not explain all historical collector timing by themselves.
