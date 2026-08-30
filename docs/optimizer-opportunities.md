---
title: "Optimization opportunity dashboard"
---

# Optimization opportunity dashboard

This generated dashboard compiles every ordinary Python module under `src/lib` and each
explicit control source under `bench/optimizer-workloads` at `O2` without executing it.
Imports are stubbed, optimizer IR is independently verified, and every loop-bearing
function, method, or lambda is retained with its exact source location and portable identity.

Input identity: `9866bca79b400b073f817f3e2c5615f24411f40409b7d5b2c379064bf837e660` (512 files, 10643331 bytes).
Analyzed source bundle: `sha256:f93ecff399accad27576eeba81ecdd34b44b61deffd3edb00a49b13a2c726ad7`; compiler identity: `sha256:46ce3bb144e4593ddeac23d8c47a634379f8ed5029047adbc44c99e9cf8aa5e7`.

The complete machine census is stored outside Git as immutable GitHub Release assets.
`architecture/optimizer-opportunities.manifest.json` binds its canonical NDJSON logical
identity, indexed SQLite query artifact, legacy JSON archive, and physical SHA-256 digests.
Queries download and verify the SQLite artifact once, then reuse the ignored local cache.

Regenerate or verify it with:

```bash
pnpm optimizer:opportunities
pnpm optimizer:opportunities:check
pnpm optimizer:opportunities:fetch
pnpm optimizer:opportunities:materialize -- build/optimizer-opportunities.json
pnpm optimizer:opportunities:query -- src/lib/sagejs/number_fields/class_unit_groups.py:1
pnpm optimizer:opportunities:query -- sha256:<digest>
```

## Summary

| Measure | Count |
| --- | ---: |
| Source modules compiled | 429 / 429 |
| Library modules compiled | 416 / 416 |
| Explicit control sources compiled | 13 / 13 |
| Functions and methods compiled | 11637 |
| Loop-bearing functions and methods | 3689 |
| Loops in functions | 10433 |
| Selected optimized loops | 49 |
| Compiler-rejected loops | 2795 |
| Unrecognized loops | 7589 |
| One-reason compiler near-misses | 233 |

A rejected loop has a stable reason from a domain pass. An unrecognized loop was compiled
but no current mathematical-domain pass claimed it; dashboard reason codes for those loops
are explicitly heuristic triage signals, not correctness proofs.

## Static and verified cost evidence

- Potential object-result sites: 70244
- Collection-allocation sites: 8390
- Known coercion sites: 15224
- Potential boundary-call sites: 72
- Unresolved call sites: 35275
- Selected-target allocations: 3 known; 45 runtime-dependent
- Selected-target representation conversions: 3 known; 47 runtime-dependent
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
| [src/lib/sagejs/number_fields/class_unit_analytic.py:1026](../src/lib/sagejs/number_fields/class_unit_analytic.py#L1026) | `_column_subsets.visit` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/class_unit_analytic.py:3598](../src/lib/sagejs/number_fields/class_unit_analytic.py#L3598) | `_build_bf_plan_readable` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| [src/lib/sagejs/number_fields/class_unit_analytic.py:3609](../src/lib/sagejs/number_fields/class_unit_analytic.py#L3609) | `_build_bf_plan_readable` | `math.bounded-integer-region.v1` | `bounded-integer.dynamic-call` | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
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
| `dashboard.no-current-pass-claimed` | 7589 | No existing mathematical-domain pass proves this loop; profile it before adding a new domain. |
| `dashboard.dynamic-call-sites` | 6810 | Profile the calls, then inline, hoist, batch, or give the dominant call an authenticated coarse boundary. |
| `dashboard.no-mathematical-domain-evidence` | 6403 | Add precise annotations or an explicit domain contract only after profiling proves this loop matters. |
| `dashboard.comprehension-loop` | 3559 | Lower the comprehension through a dedicated packed/container representation before scalar optimization. |
| `dashboard.indexed-access-sites` | 2671 | Prove shape, element representation, aliasing, and ownership before selecting a packed lowering. |
| `bounded-integer.dynamic-call` | 2232 | Inline, hoist, or batch the dynamic call so the loop is one closed exact-integer operation graph. |
| `dashboard.control-flow-sites` | 1788 | Canonicalize the branches into a verified operation graph or add a domain-specific control-flow proof. |
| `bounded-integer.unsupported-iterator` | 1772 | Use a proved built-in `range` iteration shape or add a verifier for the required iterator semantics. |
| `bounded-integer.mutable-buffer-access` | 1630 | Prove an owner-bound packed buffer, alias discipline, and transactional publication. |
| `dashboard.nested-loop-sites` | 1466 | Consider a fused multidimensional region with explicit shape and work bounds. |
| `bounded-integer.unsupported-operation:=` | 1407 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-control-flow` | 758 | Restructure the loop into supported transactional branches or add a verified control-flow lowering. |
| `bounded-integer.unsupported-operation:+=` | 740 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:%` | 727 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `dashboard.unsupported-while-loop` | 719 | Prove a finite progress measure and transactional exits before lowering a `while` loop. |
| `bounded-integer.unsupported-operation:<` | 396 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation://` | 292 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:>` | 234 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:&&` | 219 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:||` | 193 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:unary!` | 171 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:>=` | 167 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:*=` | 158 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation://=` | 155 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:-=` | 112 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:<=` | 99 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-power` | 95 | Expand a small fixed power into ordered multiplications or add an exact bounded-power proof. |
| `bounded-integer.unsupported-operation:===` | 90 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:/` | 58 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:nin` | 51 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:!==` | 50 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:in` | 47 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:&` | 44 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:<<` | 39 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:instanceof` | 30 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:|` | 20 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:>>` | 15 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `bounded-integer.unsupported-operation:%=` | 8 | Replace or prove the one unsupported exact-integer operation, then pin the bounded-integer pass. |
| `modular-sequence.element-representation-unproved` | 5 | Resolve the stable compiler rejection "modular-sequence.element-representation-unproved" and rerun the dashboard. |
| `modular-sequence.iterator-semantics-unproved` | 5 | Resolve the stable compiler rejection "modular-sequence.iterator-semantics-unproved" and rerun the dashboard. |

## Interpretation limits

- The dashboard proves compiler selection/rejection, not that a loop is dynamically hot.
- Calls without authenticated provenance remain unresolved rather than being mislabeled as
  native or Wasm crossings.
- IEEE-754 and exact arithmetic retain different domains and proof obligations.
- A suggested `@optimize` contract pins a proof; it does not create one. Rejected regions
  must first resolve every listed reason.
- Runtime guard fallbacks are visible through evaluation receipts and are not predicted by
  this source-only dashboard.
