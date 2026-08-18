# Precision degree-12 public maximal-order receipt

The exact fresh-field public `NumberField.maximal_order()` boundary is below
the Milestone 4A five-second standard-policy gate. Three target-uncached
samples were 3704.029, 3572.818, and 3620.650 ms, for a median of **3620.650
ms**.

The measurement used commit `88a1bd2e20fed1200f766e08eb7173f91e3d30e6`
with a clean tracked worktree on Linux x64, Node v26.7.0, and an AMD EPYC 7B13.
The worker received one unrelated quadratic warmup; field construction was
outside every timed sample, and the precision target itself was never used as
a warmup or cache source.

## Exactness and native boundary

The ordinary public result and the independent `trace=True` control both pass
the external exact verifier. It checks nonsingularity, containment of `1` and
the equation order, multiplication closure, the square-index discriminant
identity, and the frozen canonical lattice digest
`3e1e7c30ff5f7989dfd6efd53f5c968222468ba46911e75db2e7b059802c4c45`.

All intended production functions reported compiled execution:

- `packed_row_hnf_in_place`;
- `packed_composite_dedekind_basis_in_place`;
- `packed_order_table_in_place`;
- `packed_field_analysis_fixed_points_are_valid`;
- `packed_field_analysis_decode_integers`.

Every ordinary sample made exactly one authenticated field-analysis call, one
native field-analysis call, and one global-certification call. Median-scale
inclusive work was about 208 ms for authenticated analysis (including about
207 ms in its native resource), 41 ms for order materialization, and 939--985
ms for global certification. These are inclusive counters and therefore must
not be summed as disjoint stages.

## Raw traced control

The fresh `maximal_order(trace=True)` diagnostic took 3331.347 ms. This mode
intentionally bypasses the fused default hook and exposes the generic stages:

| Stage | State | Time (ms) |
| --- | --- | ---: |
| discriminant decomposition | complete | 791.888 |
| first composite local order | complete | 12.845 |
| general BL composite local order | complete | 1052.113 |
| native local orders | complete | 436.694 |
| global certification | certified | 934.626 |
| unattributed public residual | -- | 103.180 |

The machine load average was 11.02/13.21/12.22 during this receipt, so the gate
was met despite substantial concurrent load. The complete nanosecond samples,
stage calls, identity, and exactness flags are retained in the adjacent JSON.
