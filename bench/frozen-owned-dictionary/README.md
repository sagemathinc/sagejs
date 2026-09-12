# Frozen owned-dictionary protection cost

This evidence-only follow-up preserves controlled costs for PR265 commit
`5fc42b72295d1c8883f029fabb26d8f8cd2fb0fe`. It does not change or rebuild that
runtime, replace its immutable receipt, or qualify this later evidence commit
as the runtime build. The original worktree is clean and detached; its branch,
artifacts, and active historical task metadata remain preserved. Namespace
ownership was released for the separate allocator task.

## Experiment and limits

Bench-1 was reserved after a fresh Discussion/census check and released after
the bounded run. The matching Node26.8.1 binary and exact local artifact were
copied into separate scratch; no existing host tree was changed. Initial
staging omitted a required loader, so the first semantic run failed before any
timing. Copying the unchanged tools/scripts/architecture fixed staging, then
all four Python/Sage semantic and explicit-GC tests passed.

Before timing, the selected 20,217-file inventory matched local and remote.
Afterward, the expanded 20,389-file inventory, also including module caches,
numerical reactors, and vendor assets, matched. Exact hashes, census times,
and reservation/release links are in `identity.json`. The Node binary was
also hash-checked. No other Node/benchmark process was observed during the
pre/post census; residual load averages reflected the preceding staging and
own checks. This does not claim control over unseen physical-host activity.

Each workload ran in fresh A/B/B/A processes, three warmups and seven retained
samples per process: **84 controlled samples**, not 85. `samples.json` retains
every unrounded number. The preceding local sanity run has its own separate
84 samples; seven additional profiled samples are separately labeled and never
pooled with the timed run. There were no timed retries, sample removals, or
forced-GC calls in the benchmark. Explicit GC belongs only to the separate
semantic regression.
The ten warmup/measured loops execute in one session evaluation per process;
there is no attempt to normalize GC or weak-reference keep-alive effects
between samples. Those effects are not independently isolated by this run.

- A uses the same artifact with its private namespace-owner registration
  callback replaced by a no-op inside the isolated session. It is a causal
  guard-disabled diagnostic, **not an independently correct product baseline**.
- B uses the real guard. Map own-method checks and alias/value checks outside
  timing prove the intended storage state for both variants.
- Ordinary allocation creates 1,000 dictionaries. First exposure creates
  1,000 instances before timing, then exposes each instance's dictionary once.
  The runtime/module is already warmed: this is per-instance first exposure,
  not process startup or first module import.
- Writes perform 10,000 existing-string-key updates to one owned dictionary.
  Inputs are unchanged between variants; final values and ownership are checked.

## Controlled results

Displayed medians are rounded; `verify.cjs` computes ratios and deltas directly
from the unrounded raw samples.

| Workload | A medians, ms | B medians, ms | Protection cost |
| --- | ---: | ---: | --- |
| 1,000 ordinary allocations | 0.913 / 0.970 | 0.936 / 0.949 | Within observed local/host noise |
| 1,000 first owned exposures | 75.781 / 75.811 | 255.462 / 249.574 | 3.37x / 3.29x; about 174–180 us per exposure |
| 10,000 owned writes | 1.781 / 1.748 | 5.410 / 5.332 | 3.04x / 3.05x; about 0.36 us per write |

Both exposure and write costs are material. These results do not establish an
acceptable public latency budget, whole-product non-regression, startup cost,
four-platform qualification, or adoption readiness. The ordinary allocation
control does not erase the protected-path costs. The rejected initial roughly
60x scanner, its source identity, and all seven baseline samples remain in
[`docs/frozen-owned-dictionary.md`](../../docs/frozen-owned-dictionary.md).

## Separate first-exposure profile

`profile-summary.json` preserves a separate V8 CPU profile's counts and the
raw profile identities; raw files remain with the immutable local artifact.
This is sampled CPU evidence, not allocation-byte measurement or a GC-cause
claim. The guard installer accounts for 1,279 inclusive samples; registration
accounts for 1,523, in a 3,301-sample worker profile that also includes setup.

The installer's direct child subtrees contain 794 samples in generic
`rho_dict`, 150 in the native receiver adapter, and 149 in tuple construction.
Its own count is 98. Generated-code inspection shows three typed function
closures per Map, two Maps per namespace; each closure eagerly creates a fresh
`__annotations__` dictionary with `rho_dict({...})`, plus tuple/code metadata.
Thus annotation-dictionary construction is about 62% of sampled installer CPU;
the adapter alone, about 12%, is not the dominant cost.

A bounded **proposal**, not an implementation or predicted gain, is to use the
existing exact-dictionary literal construction path for compiler-generated
annotation dictionaries. It must preserve fresh per-function dictionary
identity, evaluation order, future/evaluated annotations, and introspection.
The prepared-keyword lane owns the relevant `src/output/functions.py` emitter.
No compiler or namespace edit is made here. Shared cold adapters with weak
storage metadata are another design possibility, but must first resolve the
changed semantics of borrowed host methods; they are not silently substituted.

## Reproduction and evidence checks

Run `node bench/frozen-owned-dictionary/verify.cjs` for sample counts, ordering,
driver identity, profile arithmetic, and unrounded paired ratios. An optional
artifact-root argument additionally verifies the frozen namespace source,
receipt file, and installed benchmark driver against `identity.json`.

`driver.cjs` is byte-identical to the measured driver. It expects to be copied
to `dist/guard-diagnostics/frozen-owned-cost-qualification.cjs` inside a separate
staged artifact root; this preserves its measured relative imports. Run it from
that root with the checked Node binary. It launches all twelve fresh processes.
Do not point it at an actively building artifact or an existing host tree.

For the separate profile, run the installed driver with Node's `--cpu-prof`
and `--cpu-prof-dir` options followed by `owned_expose B`. Keep those samples
separate. `artifact-inventory.cjs ROOT` computes the expanded snapshot digest
using sorted paths, file bytes, and symlink targets. The digest identifies this
exact staged dependency/cache snapshot, not a freshly reconstructed checkout.

Offline verification, documentation, and scope checks qualify this evidence
handoff. The task remains active because its compiler-runtime lane mandates
broader build/compiler/integration receipts; those are not fabricated or
relabeled from the frozen predecessor. This evidence head has no new runtime
build receipt and makes no new runtime-source qualification claim. PR265's
broader missing-FLINT failures and separate PR258 code-generation assertion
repair remain disclosed there. Generated-document checks use a private copy
of the immutable predecessor's runtime files because the checker imports the
kernel even in check-only mode; that reuse is not a build of this evidence head.
