# Owned descriptive-statistics slice on the isolated binary64 foundation

This follow-up to PR #232 brings only the owned statistics boundary, three
actual typed centered transformations and public `describe` integration from
the earlier experimental lane. It preserves current-main compiler/private
helper behavior and the binary64 foundation's `statistics._packed` location.
It does not import the old PR stack or change default numerical dispatch.

`StatisticsData` validates and copies inputs once, with a logical workspace
budget and explicit lifetime. Each query still performs arithmetic, sorting,
MAD and independent checks, and constructs a fresh structured result. Setup
does not precompute an answer. The opt-in native workspace requires all
matching kernels; dynamic, missing, stale and non-native artifacts retain the
ordinary path. No exact-library or plotting dependency is loaded. Subclass
iterators and generic input/callback order are not bypassed.

The compiled helpers contain only source-transparent binary64 arithmetic and
never call the interpreter. Original input is reread for independent centered
residual/MAD checks. Sorted owned storage is a host representation primitive,
not a replacement numerical algorithm; it preserves Python's stable ordering
of equal signed zeros and rejects user scalar coercion hooks. No public buffer
alias or raw pointer is exposed. Cancellation is cooperative between complete
regions, not a hard deadline inside sorting or native arithmetic.

## Validation before the first source freeze

- Fresh eight-stage build passes (10m32s); optional exact-native packs are
  explicitly absent, not purportedly qualified by these numerical tests.
- Strict CPython/Ruff/Pyright passes for 391 modules.
- Five focused tests pass with no skips: owned CPython/public Sage.js
  dynamic/native/fallback queries, 296 exact-rational centered cases in native
  and JavaScript IR, isolated Node-Wasm and Chromium/Firefox/WebKit workers.
- Six existing statistics-domain tests pass, including retained SciPy/R oracle
  fixtures, failure cases and RNG replay. The tests do not depend on a live
  SciPy service.
- Standalone ASAN/UBSAN with leak detection passes all 296 centered cases and
  surrounding allocation sentinels. The first fixture-driver compilation hit
  its 120-second timeout while optimizing a huge assertion function. Splitting
  cases and compiling only that literal test driver at `-O0` resolves it; the
  actual mathematical core remains `-O1` with all sanitizers and contraction
  disabled. No mathematical case or assertion was removed.
- FFI, package graph, numerical closure, native, Wasm capability/workload and
  lifetime audits pass. The aggregate architecture command still stops on
  inherited historical-word mentions in `agents/python-property-mutation-followup.md`
  and `docs/general-class-unit-frontier.md`; those unrelated documents are
  untouched. Algebraic-geometry and optimization-engine checks pass separately.
  The source-bound optimizer inventory is regenerated and verified for this
  slice (16,626 functions, 14,535 loops); publishing its immutable evidence
  assets remains part of the PR handoff, not a product release.
- The inherited lane-only check reports 406 live task manifests; this isolated
  integration branch is not a new lane contract and does not retire them.

These are local development validations. A fresh source-frozen build and
identity-bound current measurements follow. The development collector reports
setup, first call, generic and prepared queries separately, with no paired-run,
four-platform, public-browser, npm/SEA or memory qualification claim.

## Still open

The 10 ms public `describe(20000 observations)` target is not met or qualified.
Historical approximately 33 ms prepared timings are not current-branch evidence.
Sorting, public input conversion and result/validation costs remain important.
Public prepared Wasm storage and distribution are not integrated; browser users
keep the correct ordinary fallback. Linear regression, approximation batches,
full ownership/memory stress and four-platform public packaging remain N2 work.
This slice must not be offered for merging before its #232 foundation is
qualified, and does not imply completion of N0–N6.

User semantics and example: [owned data](../docs/numerical-computing/statistics/prepared-data.md).
