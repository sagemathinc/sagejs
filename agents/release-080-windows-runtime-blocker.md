# 0.8.0 Windows qualification blocker

Status as of 2026-09-08: **not cleared; do not publish or blindly retry**.

Frozen product source: `d3a5973b417e7e6aab1223a25ecb585dcf524acb`.
Native qualification run: `34261507488`, attempt 2, Windows job `102241900698`.
The browser numerical/supplemental job in that attempt passed completely.
The independent clean Wasm run `34261510444` also passed. Other native jobs,
including macOS signing, were retained successfully from attempt 1.

## Observed failure

Windows bootstrap, startup and portable tests passed. Integration stopped after
145 of 390 files passed. `test/hyperelliptic-rforest.cjs` failed after about
1.1 seconds with no completed mathematical assertion:

```text
Fatal error in , line 0
Check failed: page->SweepingDone().
```

The native stack includes `node::MultiIsolatePlatform::DisposeIsolate`,
`V8_Fatal`, and V8/platform frames. This is evidence of a fatal runtime
assertion, not proof of an upstream V8 bug: native corruption or a lifecycle
interaction has not been excluded. No crash dump or fully symbolized stack
was obtained from this run.

The scheduler cancelled siblings and left 243 files unstarted. This is not an
integration pass, nor can attempt 1's earlier passing integration be substituted
for a successful current product aggregate.

## Bounded persistent-host diagnostics

On native Windows, the existing clean checkout at the exact frozen source and
Node `v26.5.1` produced:

- Three isolated runs of the exact rforest test file: all five tests passed
  each time.
- Twenty runs of that file, with two processes concurrently: all exited zero.
- One hundred sequential `createSage()` / `evaluate('1 + 1')` / `close()`
  cycles: all completed.

These observations do **not** clear the crash. No implementation or runtime
flag was changed during these diagnostics, and no third CI attempt was started.

## Separate unresolved collector defect

Attempt 1's Windows job `102194503462` passed build/tests/packaging and the
Node numerical row/soak, then rejected the npm row because process-tree memory
sampling never observed a descendant. The Windows CIM query takes hundreds
of milliseconds: local probes of the same query missed two 100 ms children
(query durations 337–559 ms) and observed a 2 s child. Eager sampling alone
does not guarantee observation of a short-lived subject.

A future fix must synchronize observation with the actual subject lifetime or
use a suitable bounded native measurement mechanism. Counting only the
collector or a dummy child, fabricating zero memory, or accepting missing
measurements would not fix the instrumentation contract.

## Next investigation

1. Obtain symbolized crash diagnostics or a bounded deterministic reproduction
   before attributing the fatal assertion to a particular component.
2. If enabling Node diagnostic reports in CI, explicitly exclude environment
   and network information and review retained output; never upload credentials
   or unreviewed process dumps.
3. Compare runtime versions or GC/lifecycle controls only as diagnostic
   experiments. A runtime change requires qualification of the actual resulting
   distributed artifacts; it is not an evidence-only substitution.
4. Separate Windows build/packaging artifacts from numerical collection so an
   instrumentation failure cannot discard completed build work. Preserve exact
   source, artifact, attempt and required-acceptance authentication.

Gallery scheduling hardening is independently committed at `1d708ff8e` on
`fix/release-evidence-hardening`. Its 26 supplemental and 18 real gallery tests
pass; it changes no mathematical assertion or resource threshold. It has not
been merged into the frozen release candidate.

Public installation remains on `v0.7.0+release.6`; its Linux x64 archive returned
HTTP 200 and npm `latest` remained `0.7.0` when checked during this investigation.
No new tag or publication was performed.
