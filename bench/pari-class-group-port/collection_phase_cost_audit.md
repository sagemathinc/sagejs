# Collection-phase representation audit

Read-only audit, 2026-09-15. No implementation changes or timings were made
for this audit. The parent supplied the diagnostic phase observations
(approximately 38 ms collection, 39 ms logs, 33 ms HNF, versus approximately
3 ms for PARI's whole prepared attempt) and matching outer counts
491/54/12. Those observations motivate this audit; they do not attribute
cost to individual primitives or establish identical primitive work.

## Inspected boundary

The collector is not just its floating-point enumeration cursor.
`unreduced_ideal_collector.py` first calls `ideal_ranked_preparation.py`:
integer embedding product, modular rank, ranked LLL, ideal transformation,
real embedding product, QR/Gauss reduction, and enumeration setup.
`ideal_collector.py:113` then repeatedly calls the candidate search and
admission chain and inserts accepted relations. PARI 2.17.4's
`buch2.c:Fincke_Pohst_ideal` likewise performs `ZM_lll(ZM_mul(G0,I))`,
`ZM_mul(I,u)`, and `gaussred_from_QR(RgM_mul(G,ideal))` before enumeration.
Matching outer enumeration/admission counts does not measure how much
time these preparation stages, arithmetic leaves, or ownership operations
consume.

Generated target inspected:

```
.sagejs-native-kernels/e3e52f8292ef3a1b49215ddbe5b3f7ff01aeabcc69aa55a65f68a37bb7a4b612/kernel_core.c
```

This is the 58,205,896-byte mixed tagged/GMP initial-attempt core identified
by the parent, not the later 61 MB resumable core. Generated line references
below apply only to this exact artifact; Python paths are the durable source
references. No generated artifact is added to Git.

## Concrete divergences, not inferred percentages

1. **Big buffer loads and stores marshal values, not borrowed limb views.**
   Target lines 2071–2111 show `sagejs_integer_buffer_get_mpz` importing the
   occupied limbs with `mpz_import`; `set_mpz` clears the entire reserved
   slot with `memset(word_capacity * sizeof(uint64_t))`, then exports the
   result. The occupied limb count can be much smaller than capacity.
   This is an explicit runtime representation cost, unlike PARI's direct
   GEN/limb access. It is not evidence that GMP arithmetic itself is slow.

2. **The small tagged store optimization is already present.**
   Lines 2143–2187 show small reads/stores avoiding GMP import/export and
   small stores intentionally leaving spare limbs unspecified. Therefore
   the claim that *every* tagged store clears the entire slot would be
   false. Big stores still take the clearing/export path. A capacity
   experiment must distinguish these cases.

3. **Real metadata shares the wide integer-slot representation.**
   `householder.py:pari_qr_store` writes mantissa, precision, and exponent
   to three adjacent IntegerBuffer slots; `pari_qr_load` reads them back.
   `ideal_enumeration_preparation.py:53` onward uses these helpers inside
   embedding matrix products. A normalized 192-bit mantissa cannot fit in
   signed int64, whereas precision and exponent ordinarily can. The same
   wide stride is reserved for all three. There is no zero-copy packed
   real view in these helpers. This connects collection preparation to
   the log/HNF real arithmetic representation, but does not prove an
   identical dominant hotspot in all three phases.

4. **Word indexing exists; promotion needs measurement.**
   `candidate_element.py:36–45` has ordinary bounded coordinate/matrix
   loops. The tagged target at lines 219510 and 219650 onward starts them
   with word loop counters, checked machine multiply/add, and direct
   int64 reads. An out-of-word matrix entry at line 219690 takes a resume
   edge to `sagejs_tagged_promote`; line 219902 onward initializes tagged
   temporaries and resumes the operation. Thus it is wrong to describe
   the current candidate loop as unconditional arbitrary-precision index
   arithmetic. The remaining promotion, checks, temporary lifetime, and
   repeated load/store costs are concrete candidates, not yet measured
   explanations for the phase gap.

5. **Arithmetic leaves are deliberately not all identical to PARI.**
   `short_product.py` documents that longer real products use exact Python
   integer arithmetic rather than PARI machine carry intrinsics. Its
   one-word branch now uses portable half-word machine arithmetic.
   `real_division.py` uses exact quotient/remainder leaves, plus the
   source-specific operand windows and rounding. `pari_prime_to_part`
   uses GMP gcd in place of PARI `gcdii`. These are declared substitutions;
   even source-faithful collector scheduling is not a same-representation
   compiler experiment at those leaves. Normalization and precision
   checks are also explicit in translated scalar functions. Their
   aggregate cost is unmeasured here.

## Minimal next controlled experiments

First run the parent's proposed **64-word versus 8-word IntegerBuffer
capacity** comparison with identical executable/source, inputs, prepared
state, precision, algorithm branches, and outputs. Freeze capacities before
entry; any genuine overflow is an explicit failed case, not permission to
truncate. Retain exact collector checkpoints and outer counts. Separate
allocation/reset from resident call timing. This changes stride/clearing
footprint together, so an improvement does not by itself isolate either.
No improvement would not exonerate import/export or arithmetic leaves.

After that, the smallest informative collector-local experiment is a
captured **one-ideal preparation replay**, not another end-to-end algorithm:

- Capture the actual incoming ideal, G/G0, precision, and existing source
  choice from the accepted cubic attempt, before reduction. Do not supply
  the reduced basis, QR result, or a cached enumeration answer.
- Compare the literal PARI preparation sequence against the existing
  translated preparation entry; assert ideal transform, QR/Gauss result,
  skip-first decision, and floating cursor inputs. If source LLL choices
  differ, record that rather than attributing a timing ratio to language.
- Use an untimed diagnostic build to count big buffer imports/exports,
  occupied versus reserved words written, and function promotion events.
  Keep these counters out of the timed build. Observe operand precision
  distribution, not only number of outer candidates.
- If preparation is not the dominant collection subphase, stop pursuing
  QR on this evidence and split candidate construction, norm/smoothness
  admission, and relation insertion next. Do not infer their costs by
  subtracting unrelated microbenchmarks.

A later runtime change could specialize real mantissa/metadata storage or
avoid redundant big-slot clearing, but neither is implemented or endorsed
as the measured solution by this audit. A compiler fix should preserve
ordinary source, overflow behavior, and CP/JS/native differential tests.

## Result

There is a credible shared representation hypothesis and a narrowly
controlled next test. There is **not yet a quantified explanation** of the
collector gap, nor evidence that a different class-group algorithm is
required. The correct immediate response is to measure the existing
primitive/ownership boundary before changing source scheduling.
