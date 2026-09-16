# Prepared-attempt tagged call graph audit

Read-only audit of the already-built prepared-attempt artifact; no compilation
or timing was performed for this audit.

## Artifact identity

- Cache: `.sagejs-native-kernels/e3e52f8292ef3a1b49215ddbe5b3f7ff01aeabcc69aa55a65f68a37bb7a4b612/`
  relative to this directory.
- `kernel_core.c`: 58,205,896 bytes; SHA-256
  `052512849c16228619410f6c1626b1ed5f32273250e7ddf27b759d56e1c27f10`.
- The manifest source hash matches the current
  `prepared_class_group_attempt.py` source.

## Result: no whole-helper GMP bridges

Starting at `pari_prepared_class_group_attempt` and recursively following each
IR function's `dependencies` reaches all **242 functions** in the manifest:

- **238 integer kernels**, including 59 with `analysis.mixedFloat64`;
- **4 pure Float64 kernels**;
- **zero** functions with `analysis.backend.requiresExactWorkspace`.

Consequently the list of `requiresExactWorkspace` callees is empty. Generated
code independently corroborates this: there is no `sagejs_workspace_ok = native_`
whole-helper bridge marker, and the tagged definition section has no calls to
`native_pari_*` exact helper bodies.

The exported wrapper calls `tagged_pari_prepared_class_group_attempt` directly
(`kernel.c`, line 1313). Its three immediate dependencies are dispatched to
their tagged bodies in `kernel_core.c`:

| Callee | Call line |
| --- | ---: |
| `pari_connected_relation_hnf` | 135957 |
| `pari_post_hnf_acceptance` | 136094 |
| `pari_class_invariant_output` | 136188 |

The pure Float64 calls use the direct `sagejs_kernel_*` bodies for
`pari_exp_schedule_sqrt`, `pari_leading_word_log2`,
`pari_atan_schedule_alpha`, and `pari_reduction_quotient`.

The root IR still reports backend kind `gmp`, with reason
`mixed exact and Float64 scheduling requires the exact core`. That records the
conservative **automatic backend selection**. It does not convert this explicit
tagged wrapper or its transitive exact calls into whole-helper GMP execution.

## Interpretation limits

This establishes that the explicit tagged entry exercises the tagged function
graph, not that its arithmetic stays machine-sized. Tagged integers can promote
to GMP; arbitrary-precision real mantissas and other large exact values require
that behavior. Explicit exact/Float64 conversions also use scalar GMP staging.
Buffer access, temporary initialization, guards, and source-level algorithms
are not eliminated merely by choosing tagged dispatch.

Therefore similar GMP and tagged elapsed times cannot be attributed to a hidden
`requiresExactWorkspace` bridge in this artifact. The next attribution step is
phase-level profiling and counts of scalar promotion/conversion/buffer work,
with matched source work counters retained. This static audit neither measures
those costs nor proves the entire remaining PARI gap is compiler overhead.
