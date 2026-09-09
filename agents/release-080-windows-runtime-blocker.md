# 0.8.0 Windows qualification blocker

Status as of 2026-09-08: **not cleared; do not publish or blindly retry**.

## September 9 follow-up: cooperative shutdown fix

Implementation commits: `bc5f4efa8` (close) and `9f54cbd54` (idle reset), on
`fix/release-evidence-hardening`. The cleanup bug is fixed and the observed
teardown path has a tested mitigation. **The release blocker is not waived:**
the patched product still needs qualification; these are focused diagnostics.

`SageSession.close()` previously always called `Worker.terminate()`, bypassing
the worker's existing close-message handler and `evaluator.close()`. Repeated
close calls could also resolve before the first shutdown finished. The fix:

- Sends the close message and awaits natural worker exit.
- Runs evaluator cleanup and closes the message port even if cleanup throws.
- Shares the shutdown promise between repeated callers.
- Uses the same cleanup for idle resets.
- Retains a one-second termination watchdog for unresponsive close requests.
  Interrupts/timeouts with pending work retain immediate forced replacement.

There is no arbitrary pre-termination sleep, forced GC, disabled GC flag,
Node upgrade, new native dependency, or weakened mathematical assertion.
The helper is Node-only; no mathematical algorithm or Wasm reactor changed.
Startup and artifact-size acceptance have not been rerun, so no fresh budget
claim is made. A contended timing probe is deliberately not release evidence.

The new natural-exit regression fails on D3: its worker exits with code `1`
instead of `0`. It passes on the fix, as do concurrent close, stuck evaluation,
idle reset/state clearing, already-exited worker, and failed message delivery
regressions. This establishes the cleanup defect independently of the rare
V8 assertion.

Validation and limits:

- `9f54cbd54`: TypeScript compilation passes; ten focused Linux tests pass.
- `9f54cbd54`: sixteen Windows tests pass across `kernel.cjs`, `kernel-close.cjs`,
  `kernel-worker-lifecycle.cjs`, `kernel-diagnostics.cjs`, and the complete
  `hyperelliptic-rforest.cjs`. Includes interrupts, resets, and polyglot state.
- `bc5f4efa8`: six consecutive diagnostic harness batches pass on Windows
  Node 26.5.1: **120 rforest files / 600 mathematical sessions, plus 600 simple
  create/evaluate/close sessions; 1,200 shutdowns, no crash**. Every retained
  rforest log reports all five assertions passing. The later idle-reset-only
  follow-up is covered separately by the sixteen-test run, not relabeled as
  the source of these stress results.
- The unchanged D3 harness failed again at `rforest-9-1` in
  `sagejs-windows-diagnostic-20260909-baseline-2`. This failure retained only a
  whole-file failure, **not** a native backtrace; it is not a second symbolized
  `SweepingDone` observation. The earlier symbolized observation below remains
  the direct evidence for that assertion.
- Forty additional direct-file baseline runs and forty cooperative diagnostic
  runs all passed. Twenty TAP baseline runs also passed. Passing stretches on
  the old code are why the new stress results are not a proof of elimination.
- Native-addon-disabled compiler-only worker cycles (100), synthetic compiled
  JavaScript worker cycles (100), and a synthetic incremental-marking stress
  probe (40) passed. These did **not** produce an upstream-only reproducer.

Windows diagnostics used a separate worktree,
`C:/Users/user/sagejs-worker-close-bc5f4efa8`, now at `9f54cbd54`. Unchanged D3
generated math products were copied and the changed TypeScript runtime rebuilt;
this is explicitly not a new full-build receipt. The original D3 checkout and
release artifacts were not edited. Linux focused tests likewise reused unchanged
generated products. A Linux rforest attempt could not load the absent local
`sagejs_flint.node`; its five environment failures are not reported as passes.

The six retained stress directories are
`build/windows-diagnostic-evidence/sagejs-windows-diagnostic-20260909-cooperative`
and its `-extended-0` through `-extended-4` siblings in the local hardening
worktree. Each includes environment, per-file logs, results, and a successful
21-trial summary. No raw process reports or secrets were published.

Remaining risk: forced termination is still necessary for uncooperative code,
and the underlying V8/native interaction has not been proven. The patch removes
unnecessary forced teardown from normal close and idle reset; it does not
justify claiming that all forced-termination crashes are impossible. Next
qualify the patched candidate on the persistent hosts, including full Windows
integration, before any release retry. No CI run or release tag was created
during this follow-up. The separate CIM sampling race remains distinct.

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
| CPU/RAM | Intel Xeon Platinum 8573C, 4 logical CPUs, 16 GiB | AMD EPYC 7B13, 4 logical CPUs, 32 GiB |

The focused GitHub run confirms **byte-identical Node executables and V8
versions** on both hosts. It reports Visual Studio installation version
`18.9.12112.369`; the VM's `vswhere` probe returned no version, so compiler
equivalence has not been established. The memory values are provisioned host
capacity, not measured test peaks. These differences do not establish causation.

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

After reproducing and symbolizing the failure locally, the diagnostic CI build
was deliberately cancelled to avoid unnecessary further rebuilding. Its
always-run retention step succeeded: artifact `10085005698` contains the
pre-build environment snapshot. No GitHub reproduction-test pass is claimed.
The local copy is
`build/windows-diagnostic-evidence/github-34300362135/diagnostic-environment/environment.json`.
All diagnostic processes and this CI run are terminal. No release run was
restarted or cancelled during this investigation.

Next: isolate the allocation/worker-teardown sequence and distinguish an
upstream runtime defect from a native-boundary interaction. A passing simpler
worker probe or a timing delay before termination is not a fix. The local
reproducer and exact symbols eliminate the need to use full release CI as that
debugging loop.

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
