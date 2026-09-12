# Startup readiness: a prompt is not an initialized runtime

Diagnostic audit, 2026-09-07. **Not candidate qualification or a budget waiver.**

The release plan needs a stronger readiness definition before replacing its
normalized startup gate. A terminal can display a prompt well before it can
answer the first command. The retained Sage.js binaries demonstrate this gap.

## Measured result

The four retained executables report `sagejs 0.8.0`; their associated checkout
HEADs were independently observed as `19789307151662045ca942ad8ea30dcea4b6f6fa`.
Each observer verified the executable SHA-256 before and after sampling. That
binds these observations to bytes, not to a freshly authenticated source build
or signature. These measurements do not qualify current `main` or the release
tooling branch.

Every row below comprises 21 fresh processes. Times are raw milliseconds,
rounded to the nearest millisecond; p95 is the nearest-rank 20th observation
after sorting 21 samples. No samples were discarded or divided by Node timing.

| Target / host CPU | Pipe first answer median / p95 | Terminal initial prompt median / p95 | Terminal launch-to-first-answer median / p95 |
| --- | ---: | ---: | ---: |
| Linux x64 / AMD EPYC 7B13 | 312 / 317 | 132 / 136 | 314 / 324 |
| Linux ARM64 / Neoverse-N1 | 408 / 453 | 159 / 164 | 396 / 414 |
| macOS ARM64 / Apple M1 Max | 252 / 553 | 250 / 256 | 520 / 528 |
| Windows x64 / AMD EPYC 7B13 | 364 / 383 | Not measured | Not measured |

The terminal total is computed **per sample** by adding prompt time and
first-answer-after-prompt time, then taking the median/p95. Adding independently
computed medians or percentiles is not the calculation used here.

The macOS pipe samples ranged from 211 to 728 ms. The cause of that variation
was not diagnosed. Pipe and terminal campaigns ran at different times and have
different cache/history policies; their difference is not an estimate of PTY
overhead or proof of a scheduler, thermal or cache defect. ARM64 also crossed
400 ms in both protocols. Initial prompts alone were all below 400 ms in the
three observed terminal campaigns; first answers were not.

## Methods and evidence

[Raw observations](evidence/startup-19789307/observations.json) retain every
sample, executable digest, available host facts and summary. Archived observer
sources are [pipe](evidence/startup-19789307/pipe-observer.cjs.txt) and
[POSIX PTY](evidence/startup-19789307/pty-observer.py.txt). They are experiment
sources, not supported production gate entry points or authenticated receipts.

- The pipe observer starts the executable with three pipes and immediately
  sends `print(2 ** 100)`. After the exact answer it sends `print(6 * 7)`, checks
  `42`, closes stdin and requires a clean exit. It records first-answer time,
  second round trip and remaining exit time separately. It uses the existing
  user/runtime cache. The controller Node was v26.5.1 on all four hosts.
- The terminal observer uses Python's POSIX `pty` support and actual terminal
  input/output, not a simulated `isTTY` flag. It waits for the initial prompt,
  sends the same two commands, waits for a returned prompt after each, then
  sends Ctrl-D and requires a clean exit. It strips ANSI CSI sequences. Its
  first-answer timing ends at the correct output, not at the returned prompt;
  both returned prompts are required for a successful observation.
- The PTY experiment uses an invocation-owned, initially empty `XDG_CACHE_HOME`
  shared by its 21 samples, then removes that temporary directory. It therefore
  avoids changing the user's interactive history. It does not erase the
  executable's embedded/precompiled cache or flush the OS filesystem cache.
- Both observers hash the executable and probe `--version` before measurement.
  This warms filesystem state. Neither campaign is a first-install or
  cold-filesystem benchmark. Hashing is outside the timed region; SSH latency
  is outside the host-local timers. Each sample has a ten-second deadline.
- Host load was observed, not controlled. CPU governor/power mode and signing
  state were not recorded. Windows `os.loadavg()` zeros do not establish an
  idle host. Native Windows console/ConPTY, browser worker readiness, first
  completion, Python mode and npm kernel readiness remain unmeasured.

For diagnostic reproduction on the target host, using the archived sources:

```sh
node -e 'eval(require("node:fs").readFileSync("agents/evidence/startup-19789307/pipe-observer.cjs.txt", "utf8"))' /absolute/path/to/sagejs
python3 agents/evidence/startup-19789307/pty-observer.py.txt /absolute/path/to/sagejs
```

The second command is POSIX-only. Use the equivalent Node invocation on native
Windows for pipe observations, not WSL. Do not use these scripts' diagnostic
exit status as release acceptance: they enforce protocol completion, not a
startup budget, and need production failure-path tests before gate adoption.

## Consequence for the release contract

At the measured source, `tools/repl.ts` calls `prompt()` at initial setup but
deliberately defers `ensurePythonFrontend()` and `initContext()` until
`queueLine()`. The current branch retains that structure. This explains why
the events are distinct; the experiment does not attribute individual timings
to parser, bootstrap or operating-system work.

**Reject a prompt-only definition of usable startup.** The next gate must record
launch-to-prompt, launch-to-first-correct-answer, first returned prompt, a second
correct round trip and exit separately. Neither delaying initialization until
after printing a prompt nor hiding exit overhead in a normalization factor
should make a slow first interaction appear fast. Do not create a benchmark-only
ready signal or bypass normal parsing/evaluation.

Keep the existing gates until the replacement protocol has failure-path tests
and native Windows console coverage. Treat the plan's proposed 350 ms median /
under-400 ms p95 as a proposal for actual usable first interaction as well as
prompt responsiveness, not as a criterion these historical binaries passed.
Measure a current source-bound candidate on controlled reference hosts before
adopting thresholds; use startup profiling to fix actual excess cost rather
than raising allowances or normalizing slow results into passes.

This is a small required product check, independent of research timing reports.
No gate classification, threshold, runtime, signing protection or public release
was changed by this audit.
