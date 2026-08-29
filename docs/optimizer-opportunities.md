---
title: "Optimization opportunity dashboard"
---

# Optimization opportunity dashboard

This generated dashboard compiles every ordinary Python module under `src/lib` at `O2`
without executing it. Imports are stubbed, optimizer IR is independently verified, and
every loop-bearing function or method is retained with its exact source location.

Input identity: `50037b6ec2935d471ff85e01de9c75093b2ca176f74933c57064bdb9dd287f2f` (477 files, 10278295 bytes).

Regenerate or verify it with:

```bash
pnpm optimizer:opportunities
pnpm optimizer:opportunities:check
pnpm optimizer:opportunities:query -- src/lib/sagejs/number_fields/class_unit_groups.py:1
```

## Summary

| Measure | Count |
| --- | ---: |
| Source modules compiled | 417 / 417 |
| Functions and methods compiled | 11520 |
| Loop-bearing functions and methods | 3652 |
| Loops in functions | 10289 |
| Selected optimized loops | 43 |
| Compiler-rejected loops | 2748 |
| Unrecognized loops | 7498 |
| One-reason compiler near-misses | 232 |

A rejected loop has a stable reason from a domain pass. An unrecognized loop was compiled
but no current mathematical-domain pass claimed it; dashboard reason codes for those loops
are explicitly heuristic triage signals, not correctness proofs.

## Static and verified cost evidence

- Potential object-result sites: 69350
- Collection-allocation sites: 8272
- Known coercion sites: 15045
- Potential boundary-call sites: 72
- Unresolved call sites: 34816
- Selected-target allocations: 0 known; 43 runtime-dependent
- Selected-target representation conversions: 0 known; 43 runtime-dependent
- Selected-target boundary crossings: 0 known; 0 runtime-dependent

Static sites are not runtime event counts. Use profiling before prioritizing work.

## Highest-signal one-reason near-misses

These are ordered by static potential object-result sites only; that ordering is a triage
convenience, not a performance ranking.

| Source | Function | Pass | Stable reason | Suggested next proof |
| --- | --- | --- | --- | --- |
| [src/lib/sagejs/number_fields/bl_composite_kernel.py:2285](../src/lib/sagejs/number_fields/bl_composite_kernel.py#L2285) | `_packed_row_hnf_in_place` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/number_fields/om_maxmin.py:152](../src/lib/sagejs/number_fields/om_maxmin.py#L152) | `packed_incremental_row_hnf_in_place` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/linear_algebra/combinatorial.py:160](../src/lib/sagejs/linear_algebra/combinatorial.py#L160) | `_index_combinations` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/number_fields/buchmann_lenstra.py:1642](../src/lib/sagejs/number_fields/buchmann_lenstra.py#L1642) | `_inverse_fraction_matrix` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/buchmann_lenstra.py:2434](../src/lib/sagejs/number_fields/buchmann_lenstra.py#L2434) | `_minor_indices.visit` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/class_unit_analytic.py:1024](../src/lib/sagejs/number_fields/class_unit_analytic.py#L1024) | `_column_subsets.visit` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/class_unit_analytic.py:3457](../src/lib/sagejs/number_fields/class_unit_analytic.py#L3457) | `_build_bf_plan_readable` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/class_unit_analytic.py:3468](../src/lib/sagejs/number_fields/class_unit_analytic.py#L3468) | `_build_bf_plan_readable` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/local_polygons.py:604](../src/lib/sagejs/number_fields/local_polygons.py#L604) | `_extension_poly_divmod` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/round4.py:1116](../src/lib/sagejs/number_fields/round4.py#L1116) | `_integer_polynomial_power` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/bad_reduction.py:225](../src/lib/sagejs/hyperelliptic_curves/bad_reduction.py#L225) | `_divmod_mod` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/deficiency.py:1062](../src/lib/sagejs/hyperelliptic_curves/deficiency.py#L1062) | `_divmod_mod` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/lseries.py:633](../src/lib/sagejs/hyperelliptic_curves/lseries.py#L633) | `_completed_derivatives_from_grid` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/tamagawa.py:753](../src/lib/sagejs/hyperelliptic_curves/tamagawa.py#L753) | `_split_root_evidence` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/field_analysis_resource.py:642](../src/lib/sagejs/number_fields/field_analysis_resource.py#L642) | `packed_field_analysis_fixed_points_are_valid` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/number_fields/local_polygons.py:167](../src/lib/sagejs/number_fields/local_polygons.py#L167) | `_divmod_mod` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/bad_reduction.py:646](../src/lib/sagejs/hyperelliptic_curves/bad_reduction.py#L646) | `_pair_poly_translate_scale_integer` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/bad_reduction.py:1388](../src/lib/sagejs/hyperelliptic_curves/bad_reduction.py#L1388) | `_mobius_move_infinity` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/deficiency.py:1231](../src/lib/sagejs/hyperelliptic_curves/deficiency.py#L1231) | `_poonen_stoll_odd_prime` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/deficiency.py:1233](../src/lib/sagejs/hyperelliptic_curves/deficiency.py#L1233) | `_poonen_stoll_odd_prime` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/deficiency.py:1234](../src/lib/sagejs/hyperelliptic_curves/deficiency.py#L1234) | `_poonen_stoll_odd_prime` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/genus3_heights.py:1231](../src/lib/sagejs/hyperelliptic_curves/genus3_heights.py#L1231) | `_search_rational_fibre` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/lseries.py:569](../src/lib/sagejs/hyperelliptic_curves/lseries.py#L569) | `_theta_grid_machine` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/buchmann_lenstra.py:2275](../src/lib/sagejs/number_fields/buchmann_lenstra.py#L2275) | `_p_radical` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/maximal_order_certification.py:122](../src/lib/sagejs/number_fields/maximal_order_certification.py#L122) | `_sparse_power_basis_product` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/om_maxmin.py:92](../src/lib/sagejs/number_fields/om_maxmin.py#L92) | `packed_incremental_row_hnf_in_place` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/number_fields/round4_state_kernel.py:175](../src/lib/sagejs/number_fields/round4_state_kernel.py#L175) | `_packed_round4_berkowitz_characteristic` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/number_fields/units.py:1453](../src/lib/sagejs/number_fields/units.py#L1453) | `_coefficient_vectors` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/elliptic_curves/analytic_rank.py:88](../src/lib/sagejs/elliptic_curves/analytic_rank.py#L88) | `_coefficient_tail_log` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/elliptic_curves/analytic_rank.py:188](../src/lib/sagejs/elliptic_curves/analytic_rank.py#L188) | `_legendre_moments` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/elliptic_curves/analytic_rank.py:237](../src/lib/sagejs/elliptic_curves/analytic_rank.py#L237) | `_completed_to_l_derivatives` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/elliptic_curves/analytic_rank.py:244](../src/lib/sagejs/elliptic_curves/analytic_rank.py#L244) | `_completed_to_l_derivatives` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/bad_reduction.py:373](../src/lib/sagejs/hyperelliptic_curves/bad_reduction.py#L373) | `_normalize_almost_good` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/bad_reduction.py:925](../src/lib/sagejs/hyperelliptic_curves/bad_reduction.py#L925) | `_completed_integral_branch` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/certified_genus3.py:367](../src/lib/sagejs/hyperelliptic_curves/certified_genus3.py#L367) | `_legacy_native_order_certificates` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/certified_genus3.py:368](../src/lib/sagejs/hyperelliptic_curves/certified_genus3.py#L368) | `_legacy_native_order_certificates` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/certified_genus3.py:1234](../src/lib/sagejs/hyperelliptic_curves/certified_genus3.py#L1234) | `_packed_completed_square_model` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/jacobian_native.py:558](../src/lib/sagejs/hyperelliptic_curves/jacobian_native.py#L558) | `_pack_divisor` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/jacobian_native.py:559](../src/lib/sagejs/hyperelliptic_curves/jacobian_native.py#L559) | `_pack_divisor` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/lseries.py:500](../src/lib/sagejs/hyperelliptic_curves/lseries.py#L500) | `_dirichlet_vertical_values` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/lseries.py:523](../src/lib/sagejs/hyperelliptic_curves/lseries.py#L523) | `_theta_grid` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/lseries.py:839](../src/lib/sagejs/hyperelliptic_curves/lseries.py#L839) | `_central_weight_contour` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/lseries.py:847](../src/lib/sagejs/hyperelliptic_curves/lseries.py#L847) | `_central_weight_contour` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/hyperelliptic_curves/periods.py:1557](../src/lib/sagejs/hyperelliptic_curves/periods.py#L1557) | `_periods_from_edges` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/hyperelliptic_curves/periods.py:2181](../src/lib/sagejs/hyperelliptic_curves/periods.py#L2181) | `_serialize_model_result` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/analytic_zeta.py:159](../src/lib/sagejs/number_fields/analytic_zeta.py#L159) | `_series_multiply` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/analytic_zeta.py:213](../src/lib/sagejs/number_fields/analytic_zeta.py#L213) | `_inverse_mellin_jet` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/bl_composite_kernel.py:2280](../src/lib/sagejs/number_fields/bl_composite_kernel.py#L2280) | `_packed_row_hnf_in_place` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/number_fields/bl_composite_kernel.py:2642](../src/lib/sagejs/number_fields/bl_composite_kernel.py#L2642) | `packed_prime_ideal_candidate_hnf_in_place` | `math.bounded-integer-region.v1` | `bounded-integer.mutable-buffer-access` | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| [src/lib/sagejs/number_fields/buchmann_lenstra.py:837](../src/lib/sagejs/number_fields/buchmann_lenstra.py#L837) | `_dedekind_generator_lattice_is_order` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |

## Most frequent reason codes

| Stable reason | Loops | Remediation |
| --- | ---: | --- |
| `dashboard.no-current-pass-claimed` | 7498 | No existing mathematical-domain pass proves this loop; profile it before adding a new domain. |
| `dashboard.dynamic-call-sites` | 6730 | Profile the calls, then inline, hoist, batch, or give the dominant call an authenticated coarse boundary. |
| `dashboard.no-mathematical-domain-evidence` | 6333 | Add precise annotations or an explicit domain contract only after profiling proves this loop matters. |
| `dashboard.comprehension-loop` | 3486 | Lower the comprehension through a dedicated packed/container representation before scalar optimization. |
| `dashboard.indexed-access-sites` | 2657 | Prove shape, element representation, aliasing, and ownership before selecting a packed lowering. |
| `bounded-integer.dynamic-call` | 2192 | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| `dashboard.control-flow-sites` | 1776 | Canonicalize the branches into a verified operation graph or add a domain-specific control-flow proof. |
| `bounded-integer.unsupported-iterator` | 1763 | Use a proved built-in `range` iteration shape or add a verifier for the required iterator semantics. |
| `bounded-integer.mutable-buffer-access` | 1605 | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| `dashboard.nested-loop-sites` | 1450 | Consider a fused multidimensional region with explicit shape and work bounds. |
| `bounded-integer.unsupported-operation:=` | 1375 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-control-flow` | 757 | Restructure the loop into supported transactional branches or add a verified control-flow lowering. |
| `bounded-integer.unsupported-operation:+=` | 735 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:%` | 723 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `dashboard.unsupported-while-loop` | 719 | Prove a finite progress measure and transactional exits before lowering a `while` loop. |
| `bounded-integer.unsupported-operation:<` | 396 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation://` | 289 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:>` | 220 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:&&` | 217 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:||` | 192 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:unary!` | 160 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:*=` | 158 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:>=` | 158 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation://=` | 154 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:-=` | 112 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:<=` | 99 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-power` | 96 | Expand a small fixed power into ordered multiplications or add an exact bounded-power proof. |
| `bounded-integer.unsupported-operation:===` | 90 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:/` | 54 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:nin` | 50 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:!==` | 48 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:&` | 44 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:in` | 42 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:<<` | 39 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:instanceof` | 30 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:|` | 20 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:>>` | 15 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:%=` | 8 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unproved-live-in` | 4 | Add exact `int` annotations for every scalar live-in; runtime guards still authenticate values. |
| `bounded-integer.unsupported-operation:/=` | 4 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |

## Interpretation limits

- The dashboard proves compiler selection/rejection, not that a loop is dynamically hot.
- Calls without authenticated provenance remain unresolved rather than being mislabeled as
  native or Wasm crossings.
- IEEE-754 and exact arithmetic retain different domains and proof obligations.
- A suggested `@optimize` contract pins a proof; it does not create one. Rejected regions
  must first resolve every listed reason.
- Runtime guard fallbacks are visible through evaluation receipts and are not predicted by
  this source-only dashboard.
