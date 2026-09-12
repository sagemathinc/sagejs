# Sage.js 0.8.0 resumable qualification

Status on 2026-09-07: release.12 failed native clean CI and is not publishable.
Its completed pre-tag evidence is retained below as historical evidence, not
qualification of the replacement candidate. Publication remains pending.

## Current replacement candidate

Frozen source: `19789307151662045ca942ad8ea30dcea4b6f6fa`.
No new tag. This corrects a release-verification defect exposed by transferring
the complete `ef09` evidence from the measurement host to the aggregation host.
Browser-memory verification previously required the consumer to have the exact
producer CPU, kernel, RAM and collector Node version. That is incompatible with
independent CI aggregation/publication machines.

Transferred verification now preserves producer facts and verifies current
corpus, source closure, adapter, artifact, capability, exact commit/tree and
clean-checkout bindings. Direct measurement verification retains strict host
identity checks. The supplemental wrapper must match its nested receipt's full
repository/platform identities. Trusted producer transport remains mandatory.
The replacement also includes the serial dense-prime timing classification.

Focused runner/evidence tests: 65 passed, zero skipped. Broader evidence suite:
116 passed, seven optional campaigns skipped, zero failed. Release metadata
checks passed. Full source-current qualification is pending; `ef09` receipts
must not be relabeled for this source.

## Previous untagged candidate: ef09

Frozen replacement source: `ef09d3c7cea6032619f641452dc5b00a32e8505d`.
No replacement tag has been created at the time of this update.

Clean release.12 Wasm CI passed. Native CI exposed two harness problems:

- Windows pnpm installation received URL-encoded filesystem paths, turning
  the runner's `RUNNER~1` directory into nonexistent `RUNNER%7E1`. Commit
  `3610b75a6` preserves literal filesystem paths and tests actual offline pnpm
  installation with spaces, tildes, percent signs and hash characters.
- The Linux class-group terminal-reuse test killed a healthy cold proof after
  300 seconds. Commit `ef09d3c7c` uses the existing 600-second allowance on all
  platforms, retaining the mathematical and reuse assertions.

All four replacement native profiles and the complete browser profile passed.
The full coordinator is being refreshed after an ARM oracle-directory retry.
A macOS native refresh accidentally overlapped independent Wasm cache
preparation; both were stopped, and the interrupted generated cache was rebuilt
before sequential revalidation/reproduction. The repair, SEA/fresh-npm/startup,
strict Python and 117-file portable suite passed; full integration revalidation
completed successfully on its one full retry. This is an operational
failure, not evidence that can be relabeled as a pass. Reproduction helpers must
acquire the same checkout lock rather than merely observe it absent.

That macOS integration revalidation stopped after 149 passing files on the
fresh GF(2) pivot timing comparison in `dense-prime-host-boundary.cjs`: 135 ms
versus 57 ms for RREF, against its unchanged `2 * rref + 5 ms` ceiling. Exact
mathematical checks passed. The unchanged file passed in isolation in 8.5 s;
the complete retry passed all 366 files, including this unchanged file. The failed observation
is retained, not overwritten as evidence of a successful run.

The mixed host-boundary file was missing from the serial performance inventory.
`main` now classifies the entire file into the required performance gate, keeping
all correctness and timing assertions and adding a routing regression test.
This follow-up is deliberately outside frozen `ef09`: that candidate must still
pass its existing complete commands. A repeated failure requires investigation
and a new candidate, not indefinite retries or a threshold waiver.

Browser numerical collection runs independently on the idle Linux benchmark
host with its authenticated SciPy oracle. All four numerical browser rows,
sanitizer/destructive checks, memory records and structural budgets passed.
Final aggregation passed on the original measurement host, `bench-1`, with gate
`65c71d9cf730a2888e36102900bfec768ce25a8172cb44b30114f2b6fd2cca61`,
but failed on the independent aggregation host due to the identity defect above.
macOS reproduction was still running when the defect was fixed. The public npm root
is `35289e6bdc338d32ad6ee5deafedf41da7d7b9036dc71aaca158649df2ca89b2`;
the production Wasm artifact remains byte-identical to the historical one below.

## Historical release.12 pre-tag qualification

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
