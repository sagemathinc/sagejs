# Sage.js 0.8.0 resumable qualification

Status on 2026-09-06: persistent-host pre-tag qualification complete. Clean
GitHub confirmation, signing and publication are separate steps and are not
claimed complete by this record.

Frozen source: `d09b1babf3a7de37b414dffb200f2db57c27c96a`.
Immutable tag: `v0.8.0+release.12`. Newer `main` work is excluded.

- [Native/numerical/publication CI](https://github.com/sagemathinc/sagejs/actions/runs/34029129096)
- [Reproducible Wasm CI](https://github.com/sagemathinc/sagejs/actions/runs/34029129089)
- [Public coordination](https://github.com/sagemathinc/sagejs/discussions/104)

## Evidence

All four persistent hosts passed their complete native release profiles,
including applicable unit/portable/integration checks, strict Python, native
correctness, isolated performance, SEA packaging/startup, fresh npm installation,
three numerical product rows and a bounded numerical soak. Linux x64 additionally
passed reference/upstream, eclib and SEA Jupyter checks.

All 16 numerical product rows passed 69 cases each: Node/npm/SEA on Linux x64,
Linux ARM64, macOS ARM64 and Windows x64; Chromium, Firefox, WebKit and a Chromium
worker. Eleven supplemental records cover the six required categories, including
all four platform soaks. The final gate was reconstructed twice from the raw
evidence and authenticated against the exact public npm root.

| Identity | SHA-256 |
| --- | --- |
| Numerical release gate | `598f4613e32eae1390de2e81f84622a69f766847a7b3b6db4727e935b9929480` |
| Public npm root tarball | `3c5c0812d62f5030787e02073275f758b34250ddab31e502ab23a47719e886e0` |
| Production Wasm artifact | `7d726ed06c858b73c1a7a9994255bc5bf4c9334270defafb221808f4ef9c6eb2` |

Independent Linux x64, Linux ARM64 and macOS ARM64 production builds agree on
the payload. Their prepared toolchain semantics and independently rebuilt
cminpack/NLopt reactors agree. Each reproduction verified 15 ABI modules and
12 boundary tests. Windows authenticated and executed the canonical artifact,
including the multivariate-polynomial route. Browser parity, security, recovery
and the workload aggregate also passed. Timing trends retain their explicit
report-only regressions; they are not represented as universal speed claims.

Raw evidence is retained in the release worktree's ignored
`build/numerical-qualification`, `build/release-host-evidence` and
`build/repro-*` directories. Host stage receipts are under
`build/release-runner/<full-candidate-sha>`. These local receipts are not a
substitute for the independent tagged CI evidence required by publication.

## Failures and operational lessons

- macOS initially had a stale browser manifest beside refreshed numerical
  loaders. Restoring the complete canonical artifact fixed the failed integrity
  test; both its focused test and the full rerun passed. Validate this handoff
  before long integration runs, not after them.
- A Windows even-degree Jacobian test exited abruptly in the first integration
  attempt. Its standalone rerun and full integration rerun passed. No matching
  OS crash/memory event was found; the initial cause remains unconfirmed and its
  original log is retained.
- Shared-host SEA startup measured 351.9 ms against a 350 ms normalized budget.
  The identical SEA/browser bytes passed the unchanged structural gate on the
  idle Linux benchmark host. Do not silently relax the threshold or discard the
  failed observation.
- Bounded four-file macOS integration completed 366 files in 43m14s; the earlier
  two-worker attempt reached roughly 81 minutes before its stale-artifact
  failure. Performance experiments remained exclusive and separately gated.
- Repeated user-agent memory measurements made Chromium timing take about
  61 minutes. Maximum-quality payload compression was also repeated across
  reports. Separate/cache that work using explicit identities rather than
  weakening correctness, memory or payload requirements.

Windows Authenticode setup remains optional for this early alpha. macOS
Developer ID signing/notarization and protected publication still require the
configured GitHub environment approvals. Keep the public installer pinned to
0.7.0 until the complete 0.8.0 publication succeeds.
