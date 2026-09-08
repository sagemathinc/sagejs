# Prepared-field regression: reproducible, not yet localized

This follows the [irreducibility optimization](rational-irreducibility-metadata.md).
It changes no production mathematics, compiler, bounds, resource limits or
receipt checks. All controlled comparisons use the same opt runtime at
`8fa8314380bfd36d14498264160d7733f8cbe7b0` and its unchanged native pack.
The sole field is the already-exposed $x^3-x^2-11x-63$, with class group $C_3$.

## Repeat the uninstrumented observation

A fresh output directory and fresh process caches repeat the original warmed
A/B driver, byte-for-byte, with 128 additional class-number warmups in each
mode. Eleven pairs alternate reconstruction/metadata process order; each
process times 128 prepared fields and 128 fresh coefficient-vector fields.

| Boundary | Reconstruction median ms | Metadata median ms | Geometric mean paired ratio |
| --- | ---: | ---: | ---: |
| Prepared field | 2.998590 | 3.070990 | 1.024940 |
| Fresh coefficient vector + field + class number | 7.612216 | 4.546036 | 0.595096 |

Metadata is slower on prepared fields in **all eleven pairs**, and faster on
fresh inputs in all eleven. All 5,632 timed results authenticate and all 88
sampled exact replays pass. The original warmed run's prepared ratio was
1.027789. These two runs support retaining the small prepared regression as
an unresolved finding, not dismissing it as a single unlucky measurement.

## Native-call ledger

The diagnostic preload wraps only the existing packed N-API entry for the
closed cubic program. It calls the original entry with unchanged arguments,
records monotonic elapsed time, and propagates results and exceptions.
Native source and binary bytes are unchanged. This is instrumentation of the
native boundary, not an unmodified performance gate or an independent proof
of the native implementation.

The first probe used a separate `run_prepared` helper. Its medians were:

| Component | Reconstruction ms | Metadata ms |
| --- | ---: | ---: |
| Total prepared call | 3.050510 | 3.142782 |
| Native boundary | 2.259544 | 2.244405 |
| Host residual | 0.801457 | 0.893223 |

That suggests a host-side difference, but the helper also changes the loop
and replay history. It is not sufficient evidence for a causal attribution.

A second ledger preserves the original two-boundary A/B script, warmups and
replay order, inserting only untimed begin/end markers around the prepared
batch. Each sample records exactly 128 native calls. The eleven-pair result:

| Component | Reconstruction median ms | Metadata median ms | Geometric mean paired ratio |
| --- | ---: | ---: | ---: |
| Total prepared call | 3.023398 | 3.035702 | 1.002927 |
| Native boundary | 2.220714 | 2.243815 | 1.006094 |
| Host residual | 0.797026 | 0.792506 | 0.993403 |

The host residual is computed **within each sample** by subtracting its
native-call sum from its total; it includes marshalling, checking, allocation,
instrumentation overhead and any other host work. Independently taking column
medians need not preserve their sum. The faithful ledger does not reproduce
the uninstrumented regression, so its near-equality must not be used to erase
the repeat above. Instrumentation and runtime-state sensitivity prevent a
definitive phase attribution at this scale.

## Sampling, including rejected explanations

Local whole-process profiles restrict attribution to the `run_prepared`
frame, excluding construction and replay. At 512 prepared calls per mode,
about 79% of attributed samples lie in the compiled entry; receipt construction
and `_checked_native_values` each account for roughly 7–8%. The host ceiling
square-root loop is only about 0.5–0.6%. Rewriting that loop is not supported
as the explanation or remedy for the measured regression.

Four additional opt profiles run in reconstruction/metadata/metadata/
reconstruction order. A local inspector starts and stops sampling at the
prepared-batch markers; all arithmetic and verification remain enabled.
Restricting attribution to `class_number` excludes profiler-start/stop work.
Receipt construction plus validation occupies roughly 16–18% of those
attributed samples. The profiles do not consistently distinguish the modes.
Sampling at 100 microseconds on the CPU-pinned VM materially increases elapsed
time, so these profile times are **not** retained speed measurements.

The profile summarizer reports inclusive and exclusive function-name totals
and separately reports garbage-collection samples between the first and last
anchored samples. Inclusive fractions overlap; names can aggregate several
call sites. Unanchored samples are excluded from those fractions, and the
sample window is not an exact entry/exit timer. A synthetic regression checks
the accounting and rejection of an absent anchor.

## What this changes about the next action

1. Keep the construction optimization and its large fresh-input gain in the
   draft branch, but do not claim regression-free prepared performance.
2. Do not blame the mathematical kernel, the square-root helper, or a resource
   cache on this evidence alone. The 2.5–2.8% warmed loss is reproducible;
   its mechanism is still unresolved.
3. Treat host receipt work as a real, bounded optimization opportunity, not
   the whole competitiveness problem. With the current native core unchanged,
   eliminating host overhead still leaves about 2.24 ms at the native boundary,
   versus the earlier roughly 1.21 ms PARI fresh-`bnfinit` measurement for this
   target. Those are different program boundaries, but they establish why
   wrapper cleanup alone cannot produce parity here.
4. Return the main mathematical campaign to the current frozen corpus:
   identify the next structural slowdown or multi-stage decline, rather than
   infer a general PARI win from improvements on this familiar polynomial.
   The twenty preregistered unseen neighbors remain unexecuted.

## Reproduction and provenance

Use `diagnose-irreducibility-public-ab.cjs` with the retained original Python
driver and `EXTRA_WARMUPS=128` for the uninstrumented repeat. For the ledger,
copy that Python driver and `profile-cubic-native-ledger.cjs` into a fresh
directory, then run `diagnose-cubic-native-ledger.cjs BUILT_ROOT DIRECTORY`
with CPU-0 affinity. The runner generates the marker-only instrumented copy.
Set `SAGEJS_DIAGNOSTIC_PHASE_PROFILE` to an output filename to request the
separate inspector profile; do not enable it for retained timings.

The standalone local profile driver is `profile-cubic-prepared.py`. Pass
`$ρσ$py$run_prepared` as the optional anchor to
`summarize-construction-profile.cjs`; phase-only profiles use
`ρσ_method_class_number`. The initial whole-process profiles predate optional
iteration-count and ledger-marker additions; their `run_prepared` body is
unchanged. The original helper-ledger scripts and both versions of the preload
are preserved with the raw data rather than relabeled as the final driver.

No new current-source 1,000-field or cross-platform qualification is claimed.
PR190 stays draft. The goal of general competitiveness remains open.

The [auxiliary evidence release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-prepared-regression-8fa831438-20260908)
contains the raw scripts and per-process results, aggregate timings, local
and opt profiles, and verification logs. The profiler-accounting test,
formatting and architecture checks pass. `pnpm parallel:check` still fails on
the inherited 395-live-task worktree registry; no task records were changed
to hide that pre-existing infrastructure failure.
