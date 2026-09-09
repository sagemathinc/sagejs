# 0.8.0 Windows qualification blocker

Status as of 2026-09-08: **not cleared; do not publish or blindly retry**.

## September 9 update: locally reproduced and symbolized

The focused harness at `scripts/release/windows-diagnostic.cjs` reproduced the
same assertion on persistent Windows Server 2022, trial `rforest-9-0` (the
nineteenth submitted trial of twenty, two concurrent processes). The other
nineteen trials passed. Thus the crash is **not exclusive to GitHub's runner**.
Fatal-report flags were enabled; no JSON report was emitted for this V8 check.
Raw fixture logs and summary are retained locally under
`build/windows-diagnostic-evidence/sagejs-windows-diagnostic-20260909/` in the
`release-evidence-hardening` worktree. This supersedes the earlier unsuccessful
reproduction attempts below, not their historical results.

Environment comparison so far:

| Fact | Failing CI | Persistent VM |
| --- | --- | --- |
| OS | Server 2025, 10.0.26100 | Server 2022, 10.0.20348 |
| Image | windows-2025-vs2026, 20260824.214.3 | Persistent project VM |
| Node | 26.5.1 | 26.5.1, V8 14.6.202.34-node.24 |
| CPU/RAM | Focused diagnostic collecting | AMD EPYC 7B13, 4 logical CPUs, 32 GiB |

The Node executable SHA-256 is
`b48b0224081224cda1f49374e2fc63d143041ade51754f0cc6608fe8510ba29e`.
The official `v26.5.1/win-x64/node_pdb.zip` SHA-256 is
`fb3b232e033a25d0aae20c0413589569688807471e98a1620ef7f7ec959fbf83`.
The archive was checked before extraction. Built-in Windows DbgHelp resolves
the stack with `scripts/release/windows-symbolize.ps1`; supply PE image size
explicitly. No additional debugging library is required. Addresses below are
RVAs, removing the VM's observed image base `7FF662B70000`:

| RVA | Symbol |
| --- | --- |
| 4A180D | Node stack-trace printer lambda + 0x2D |
| 1BB2598 | V8_Fatal + 0x158 |
| 10A35A8 | PagedSpaceBase::RefillFreeList + 0x2A8 |
| 112BD68 | Heap::EnsureSweepingCompleted + 0x108 |
| 113680D | Heap::StartTearDown + 0xED |
| 11DF61C | Isolate::Deinit + 0xAC |
| 11DF4AD | Isolate::Deinitialize + 0x14D |
| 390F89 | node::worker::Worker::StartThread lambda + 0x1989 |

The original nearest-export `DisposeIsolate`/OpenSSL labels were misleading.
This localizes the failed assertion to worker heap teardown, but still does not
exclude earlier native memory corruption. A separate pure-Node test of 200
worker allocation/termination cycles passed (two concurrent lanes, 120,000
objects per worker batch); it is not an upstream-only reproducer.

The same harness's CIM queries took 302–374 ms, missed both 100 ms children,
and observed the 2 s child. The sampling race likewise exists on the VM.

Focused GitHub diagnostic run `34300362135` uses control `8a51dece1` and the
unchanged D3 subject, not a new release attempt. It has read-only permissions,
no signing/publication, fixed input artifact IDs, and bounded execution. Uploads
exclude raw process reports and retain only allowlisted report fields. Diagnostic
passes cannot satisfy the release product aggregate.

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
