# Ready-only merge wave, 2026-09-12

The integration candidate is `agent/live-ready-only-20260912`, based on
`44ed9b14d`. This is merge management, not a product release.

## Reviewed scope

Already pushed: #250 (semantic build inputs), #253 and #261 (honest performance
checkpoints), #257 (independent frozen corpus tooling), #258 (scoped dictionary
assertion), and #247 (ordered shared bootstrap metadata copying).

The next candidate merges #256, #255, #264, #248, #263, #238, #241, #252, and
#259, in that order. Review preserves dictionary storage and namespace authority,
Python call evaluation order and type-slot dispatch, failed native attribute-write
errors, live module bindings, and observable host-tag reads. Compiler import
specialization remains private; numerical-only packs omit the exact allocator
only for nonempty all-binary64 closures without foreign libraries. Unknown,
empty, mixed, and foreign-library closures keep their conservative behavior.

The #263 task-contract conflict retains the later #248 evidence-directory claim.
Reference source locations and optimizer provenance are regenerated from the
combined compiler, not copied from either parent. No size or timing limit changes.

## Local evidence

- Fresh eight-stage build: passed in 7m29s, Node 26.8.1, Linux x64.
- Focused combined Python/runtime/compiler regressions: 33/33, no skips.
- Portable suite: 222/222 files, also passed inside the routine test plan.
- Strict Python: 403 modules, zero errors; formatting current.
- Full architecture check: passed, including 1,343 native boundaries,
  1,106 Wasm capabilities, and current optimizer provenance.
- Core-runtime source: 900,269 / 903,000 bytes.
- Generated documentation and public API smoke checks: passed.
- #259 prefix-free/mixed native pack tests: 3/3, no skips, with the existing
  validated FLINT prefix for the mixed exact control; 200 numerical oracles,
  signed zero, relocation, cache reuse, and a 201-bit exact control.
- Five optional native addons were absent in the fresh worktree. The build
  skipped the production FLINT pack. This is not full native product or release
  qualification.

The routine plan failed its startup gate: 402.7 ms against 400 ms. A predefined
larger 51-process sample confirmed 402.6 ms (empty startup 181.8 ms). The existing
main checkout at `02a683d21`, with a verified current build receipt, also failed
with 404.7 ms over 51 processes (empty 181.4 ms). That checkout has native addons,
so this comparison does not isolate a causal PR effect. Do not label the local
routine plan green or relax the threshold. Confirm the combined candidate on
the standard CI runtime before promoting it.

## Held dependency

#244 at `9c46612c` contains the exact head of draft #260, `ce2aedd1`.
It must not enter main under the non-draft rule. Both the hold and the diagnostic
results are posted on #244. A separate exploratory worktree retains combined
exception tests and an experimental own-property source-size reduction; neither
is in this candidate. The author must resolve the draft dependency before that
work can be considered for promotion.

Optimizer snapshot: `sha256:e425c0bc181e2c751b9de7accafb08d7ba55bee41ae1d7561e925a94dd6c04aa`.
Its content-addressed evidence assets are infrastructure, not a Sage.js release.
