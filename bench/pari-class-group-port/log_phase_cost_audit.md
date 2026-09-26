# Relation-logarithm cost audit

Read-only audit, 2026-09-15. No new performance runs or implementation changes.
The supplied phase profile records 38.893 ms in relation logarithms and 112.118
ms in the entire prepared native core. These are instrumented diagnostic
averages, not qualified timings. They do not identify the cost of individual
leaves. Comparing this phase with the approximately 3 ms whole-PARI reference
motivates investigation; it does not assign any percentage to a cause below.

## Evidence boundary

Inspected the Python relation-logarithm dependency path and the actual tagged
generated graph used by `prepared-phase-profile-20260915.json`:

- Cache `e3e52f8292ef3a1b49215ddbe5b3f7ff01aeabcc69aa55a65f68a37bb7a4b612`.
- Original `kernel_core.c` hash recorded by that profile:
  `052512849c16228619410f6c1626b1ed5f32273250e7ddf27b759d56e1c27f10`.
- The profile reports tagged phase calls, not fallback to native GMP function
  bodies. Tagged large-integer arithmetic still uses GMP primitives.

The source path is `relation_log_embeddings.py` → `log_embedding.py` →
`short_product.py` embedding products, `complex_logarithm.py` /
`complex_argument.py`, `real_logarithm.py` / `real_arctangent.py`, and their
real arithmetic / constant-cache helpers. The comparisons below concern PARI
2.17.4, not a different analytic algorithm or revised precision policy.

## Concrete differences

1. **Packed real values are not native PARI real objects.** Each output place
   occupies seven arbitrary-integer slots: kind plus two mantissa/precision/
   exponent triples. Matrix components use three separate IntegerBuffers.
   Large values are imported into temporary `mpz_t` values and exported again;
   they are not borrowed limb views. In this pinned graph,
   `sagejs_integer_buffer_set_mpz` clears the *entire reserved slot capacity*
   before exporting the significant limbs (around line 2091). Small tagged
   stores already avoid that clearing. This is direct evidence supporting the
   separately assigned capacity experiment, not evidence of its speedup.

2. **Integer square-root leaf differs.** `real_square_root.py` explicitly uses
   an integer Newton iteration with repeated integer division, then the source
   guard-word and rounding rules. PARI's `src/kernel/gmp/mp.c:sqrtr_abs` calls
   `mpn_sqrtrem`. The non-AGM logarithm and arctangent translations repeatedly
   call this leaf during argument reduction. Matching their schedules does not
   make these primitive algorithms identical. The tagged graph contains the
   Newton loop (`tagged_pari_sqrtrem_integer`, around line 166393); there is no
   hidden replacement with a library square root.

3. **Quotient and remainder are computed separately.** In `real_division.py`,
   the one-word-divisor and wider-divisor branches calculate `numerator // b`
   and `numerator % b` separately. The tagged body, around line 183515, retains
   separate `sagejs_tagged_floordiv` and `sagejs_tagged_mod` calls. Their big
   paths call `mpz_fdiv_q` and `mpz_fdiv_r` separately. The same generated runtime
   already provides `sagejs_tagged_divmod`. Thus there is a concrete, narrow
   source-expression experiment available without changing rounding decisions.

4. **Indexes and precision metadata are generic Python integers, but not
   necessarily arbitrary-precision operations.** The tagged graph retains
   tagged additions/multiplications, checked conversion to int64, bounds checks,
   and buffer loads for offsets/precision/exponents. Small operands have
   machine-word fast paths. It would be inaccurate to say all these indexes
   currently use GMP. The generated embedding wrapper enters the tagged body
   directly; many small metadata operations coexist with large mantissas.
   A later machine-metadata experiment could isolate this, but cannot safely
   assume unchecked machine arithmetic or omit Python overflow semantics.

5. **There are extra copies and validation boundaries.** Each appended
   relation copies coordinates to scratch, computes a scratch log column, then
   copies its seven-slot entries to the resident embeddings. Each helper
   validates precision and mantissa shape again. The source PARI `get_log_embed`
   produces a column of real/complex objects, and `get_embs` preserves prior
   columns by pointer. The port also preserves the previous prefix; it does not
   recompute all old logarithms. Constant caches are resident. Therefore neither
   full-prefix recomputation nor per-relation cache reset is a supported
   explanation. Generated tagged temporaries are initialized per helper and
   cleared on return, but tagged initialization is lazy: it does **not** allocate
   an mpz for every small temporary.

6. **Scalar rational relations take extra source work.** The append wrapper
   always passes `scalar_relation=False`; rational generators stored as
   `(p,0,...)` go through matrix multiplication. Upstream `get_log_embed` uses
   `const_col` for scalar generators and matrix multiplication only for columns.
   This is already documented in the translation. It violates strict operation
   count equality for that subset even when resulting logs agree. Correcting
   it is a fidelity experiment, not evidence that it dominates this phase.

The short-product implementation already uses explicit uint64 limb products
and source retained-product structure. It should not be described as a blanket
full-precision multiplication replacement. Complex logs preserve the selected
`garg` plus `log(cxnorm)/2` path rather than substituting an unrelated `atan2`
or floating-point library logarithm.

## Next controlled experiment

Finish the independent capacity experiment first; do not mix it with arithmetic
changes. Then the smallest arithmetic experiment is to change **only** the two
quotient/remainder pairs in `pari_real_division` to explicit `divmod`, inspect
that the generated big path uses one quotient/remainder primitive, and retain
the identical rounding wrapper. This tests a demonstrated duplicate operation
using a runtime capability that already exists.

Declare the two source sites and freeze input operands before measuring.
Require exact quotient/remainder and real-triple differential controls across
CPython, generated JS, native GMP, tagged, and pinned PARI; include rounding
boundaries and all already accepted real precision widths. Replay the unchanged
prepared log inputs and complete prepared computation with the same owner
capacity, caches, work counts and output assertions. Measure a paired unchanged
baseline/candidate only after correctness, within the parent's budget and
resource caps. Report a null result as such; do not tune inputs retrospectively.

If this is small or inconclusive, the next algorithm-level leaf experiment is
an exact `sqrtrem` primitive with the existing Newton implementation retained
as the dynamic fallback and the real rounding wrapper unchanged. This requires
an explicit source-transparent runtime boundary, Windows/backend support or
correct capability fallback, and source/leaf differential tests. It is a
broader change than `divmod`, but directly tests the acknowledged difference
from PARI's `mpn_sqrtrem`; it should not be hidden as a compiler rewrite based
on a mathematical function's name.

No new execution timings or expected speedup are claimed by this audit.
