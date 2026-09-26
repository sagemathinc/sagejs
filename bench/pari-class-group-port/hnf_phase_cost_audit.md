# HNF phase cost: static attribution audit

This is a source/generated-code audit, not a timing experiment or a measured
cost breakdown. It examines the prepared-attempt cache `e3e52f8292ef3a1b49215ddbe5b3f7ff01aeabcc69aa55a65f68a37bb7a4b612`
(core SHA-256 `052512849c16228619410f6c1626b1ed5f32273250e7ddf27b759d56e1c27f10`).

## What the phase includes

`pari_hnfspec_complete` includes sparse cleanup, rank, block assembly, **the
real/complex logarithm transform C*T**, and `hnffinal` (including another
logarithm transform where required). Thus its measured phase cannot be read as
integer elimination alone. `log_matrix_transform.py` represents each entry by
seven exact integers: kind, real mantissa/precision/exponent, and imaginary
mantissa/precision/exponent. Its multiply/add operations call the same translated
real arithmetic family used in logarithm construction. Shared representation
costs can therefore affect both reported phases.

## Concrete representation costs present in this artifact

1. **Packed large-value loads/stores cross a representation boundary.**
   `sagejs_integer_buffer_get_mpz` imports active limbs into an mpz temporary
   (`kernel_core.c:2071`). `sagejs_integer_buffer_set_mpz` clears the entire
   reserved slot and exports the value (`:2090`). The diagnostic currently
   reserves 64 limbs per ordinary IntegerBuffer slot: 512 limb bytes even for
   a three-limb 192-bit mantissa. Reducing a safe capacity can change both
   store clearing and cache footprint without changing mathematical work.
   This is a plausible experiment, not an established fraction of elapsed time.

2. **The small-store clearing problem is already fixed here.**
   `sagejs_integer_buffer_set_int64` (`:2143`) writes one limb and the signed
   size, leaving spare limbs unspecified. Tagged small stores use this path.
   Do not attribute current cost to clearing all reserved limbs on every small
   store. Large stores still take the path described above.

3. **Index semantics are not uniformly machine-sized.**
   IR gives `i`, `j`, `h`, and `base` in `pari_log_matrix_transform` type
   `Integer`; the complete HNF wrapper's `i` and `j` are also `Integer`.
   Tagged buffer operations convert/check an index before access. Pure exact
   helpers can enter speculative word paths, so this does not mean all executed
   index arithmetic uses GMP. Once large mantissas require tagged execution,
   metadata/index arithmetic still carries tagged machinery unless separately
   proved word-sized. Mixed helpers disable speculative whole-word loops.

4. **Scalar temporaries have nontrivial ownership, but initialization is lazy.**
   The IR has 177 Integer locals in `pari_hnfspec_complete`, 175 in
   `pari_log_matrix_transform`, and 124 in `pari_signed_real_sum` (including
   compiler temporaries). Generated tagged bodies initialize/clear scalar tags.
   `sagejs_tagged_init` only sets flags and a small value (`:1546`): it does
   **not** allocate GMP storage. Promotion initializes mpz storage; helper exit
   clears initialized big values. Repeated calls involving large real mantissas
   can consequently incur allocation/copy costs, but static local counts are
   neither allocation counts nor a measured hot-path cost.

## Explicit algorithm/work differences to keep separate

- `pari_validate_log_entries` scans entries in the complete wrapper, and the
  matrix-transform helper validates its input again. Permutation validation in
  the complete wrapper uses a quadratic duplicate scan. These prototype checks
  are additional work, not language dispatch alone.
- Logarithm column tasks execute serially rather than through upstream
  `gen_parapply`; actual reference threading must be recorded before assigning
  a performance consequence. The source accumulation/skip rules are retained.
- `hnf_bezout.py` explicitly substitutes a scalar exact Euclidean recurrence
  for the multiword GMP `mpn_gcdext` leaf. Its word path remains source-derived.
  It is a real arithmetic-backend difference, but there is no evidence here
  that the multiword branch dominates, or even runs, in this field's HNF phase.
- CUP uses exact IntegerBuffer arithmetic for modular values rather than
  PARI's specialized word matrix representation. Do not infer that the large
  quartic CUP path is exercised by this successful cubic merely because it is
  present in the shared graph.

## Next discriminating checks

Keep exact result/work-count assertions while testing smaller safe packed
capacities, then split the HNF phase into cleanup/rank/assembly/log transforms/
finalization. If needed, count large packed imports/exports and promotions,
rather than inferring them from generated source size. None of these findings
supports an unmeasured percentage or establishes that all remaining PARI
overhead is a compiler defect. The prior call-graph audit already rules out
whole-helper GMP bridging in this tagged artifact.
