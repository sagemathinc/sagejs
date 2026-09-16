# Analytic preparation inside the initial class attempt

`pari_analytic_class_group_attempt` connects the existing translated analytic
inverse-hR helper to the existing prepared initial class-group attempt. It
computes PARI's `dbllog2(abs(D)) * M_LN2` from the exact discriminant, chooses
the residue bound, accumulates the inverse residue, normalizes inverse hR,
and forwards that computed triple to collection/HNF/acceptance/Smith output.
All calls are ordinary typed Python source. No class-number or regulator
answer, computed LOGD, or inverse-hR value is consumed as an input.

The two output-only owners `analytic_log_discriminant` and `accept_inverse_hr`
are deliberately poisoned in the checker. Raw discriminant, signature, roots
of unity and prime-degree patterns remain prepared data. The nf, factor-base,
ideal packets and other collection preparation are still upstream inputs.
Their field identity must agree with the analytic inputs; matching signatures
alone does not establish this. This is one initial candidate attempt, not
honesty verification, retry orchestration, a class-group certificate, or full
unit maps.

## State and failure semantics

The wrapper mirrors the existing short-state, terminal, partial-state,
public-result and fresh-relation-stage guards before any analytic mutation.
After its own output-owner and signature guards it marks the attempt partial
with `[1, -1, 0, 0]`. Analytic exceptions therefore leave publication disabled
and reject reentry. Once analytics succeeds, phase zero is restored immediately
before invoking the existing attempt, which owns the remaining lifecycle.
Terminal repeats do no work, even when analytic buffers have been replaced by
malformed empty buffers. Component scratch may be partially mutated on failure;
all owners must satisfy the documented disjointness/capacity preconditions.

An initial version left phase zero unchanged on analytic failure; root review
identified and corrected this before native qualification. The final checker
tests six atomic initial-guard failures and a zero-discriminant analytic failure
with unchanged public class buffers, publication zero, and rejected reentry.

## Frozen differential inputs and initial results

Prepared attempt inputs:
`/tmp/sagejs-prepared-class-inputs-JXLwHg/inputs.json` (SHA-256
`37abbff3ea5a0fbbd81d4261a737f19808a2b85220c725417d0f315d15c0e10c`).
Raw analytic fixtures:
`/tmp/sagejs-analytic-invhr-d88QqB/fixtures.json` (SHA-256
`c9ee35c9a64e22c7a0485af5a2015e8e15532352356a6c17c4f0fd7c4584ff07`).
The independent expected outputs remain assertions only.

Field 1 produces selected residue bound 2987, 429 processed primes, inverse hR
`[10040138793730983849, 64, -19]`, class number 3, invariant `[3]`, and regulator
`[3895441961913051012156655978319959870688113589397982850906, 192, 17]`.
Final CPython/generated-JS replay and all lifecycle controls passed in
`/tmp/sagejs-analytic-class-attempt-cbNYe4/fixtures.json`. Wrapper SHA-256:
`c66cb15d3d639dbae0d4c3a68b51b84882bbc9e48346b1a495ef248a04262351`.

CP/JS development qualification consumed 140.757714 CPU seconds including
earlier successful revisions and one failed harness setup. The initial failure
(0.482988 CPU seconds) was stdlib `decimal` shadowing after adding mathematical
source paths; importing stdlib decimal first corrected it. It was not a kernel
failure. The final CP/JS run consumed 47.539975 CPU seconds, peak RSS 1068912
KiB. These costs include lowering/test overhead and are not kernel benchmarks.
Runs used a 4 GiB address-space cap and 60-second wall limit. Native qualification
was separately authorized under the same memory cap and a 600-second wall limit.

## Native qualification

GMP replay passed the same exact outputs and lifecycle controls, first at
`/tmp/sagejs-analytic-class-attempt-s4jyDk/fixtures.json` (278.760885 CPU
seconds including full compilation, 261.982354 wall seconds, peak RSS
1782128 KiB). A cached rerun of the final artifact-reporting checker passed at
`/tmp/sagejs-analytic-class-attempt-bToxm2/fixtures.json` (56.782645 CPU
seconds, 43.251034 wall seconds, peak RSS 988292 KiB). There were no native
build/runtime failures or memory-limit increases. BLAS/OpenMP thread counts
were fixed to one. No kernel performance claim is made from these diagnostics.

Final native identity:

- Checker SHA-256:
  `359dc80cdcd9bcc705af697447f36f7c566a2b65287d9e0b931a8f7e325a544f`.
- Core C SHA-256 (59267780 bytes):
  `c0ea098e3ee74948873a5f66895781cfc3c7df5bd27ab506065e4a949339c45f`.
- Loaded `.node` addon SHA-256:
  `fe2b27378ea8ef7543ec87a80547ffd14855dccd98078c9fc78de079b8958311`.
- Serialized IR SHA-256:
  `464f6f212f6aa9b049534b0cdf873f327b96cd0bff3c85a2c17cd50a5629b933`.

The final fixture records full paths and the separate JS module hash. Generated
artifacts are not committed. Python formatting, `parallel:check`, and
`git diff --check` pass. `architecture:check` passed FFI, package graph,
numerics, native, and WASM checks but stopped at the shared optimizer-opportunity
artifact manifest: expected input `2abcd76253ba21e539148ec7330d1647ab2712e9710970c27243835e5ef01825`,
found `ba010bb412b1a3024c4c62aa0b1086bea2507388dd103943be53b07cb267cc55`.
That check cost 13.408480 CPU seconds. Shared manifest regeneration belongs to
the integration lane; this helper did not alter it. Total additional native
qualification allowance used: 348.952010 CPU seconds.
