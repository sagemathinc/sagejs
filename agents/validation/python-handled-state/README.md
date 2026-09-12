# Selective generator warm execution campaign

This is a standalone Python-mode execution microbenchmark of PR #244 versus
PR #249, not a compile/import/startup, full-package, browser, or release gate.
It does not establish recovery of performance from before handled-state
ownership: that earlier implementation is not a baseline here.

`fixture.py` is ordinary CPython source. `driver.cjs prepare` invokes each
frozen checkout's actual CLI compiler in Python/bare mode, embedding its own
matching baselib and standalone dependencies. It records the compiler, baselib,
lowerer, receipt, source, driver and output hashes. The host driver appends only
an export of the emitted `__main__` module registry, without rewriting any
compiled function or replacing its runtime. Compilation, module initialization,
exports and initial correctness checks are outside timing.

Each fresh process runs loop control, ordinary Python calls, plain creation,
plain resume, owned-handler creation, and owned-handler resume in that order.
Sizes are fixed before timing: 1,000,000 loop/call operations, 20,000 retained
generator creations, and 500,000 resumes. Each operation has three warmups and
seven retained samples. Every warmup is also recorded. No manual GC, sample
discarding, time subtraction, worker reuse, or adaptive size selection is used.
The four fresh processes run A/B/B/A (A is #244, B is #249).

Creation includes list appends and retains every generator until the timer
stops. Untimed validation then resumes each generator twice and closes it;
validation allocations/GC can affect subsequent samples. Resume measures a
whole Python loop, including initial generator creation and final close. Owned
resume raises once and suspends under its handler; plain resume owns no handler.
The separate correctness probe checks helper bare-raise identity, suspension,
caller-handler restoration, close and absence of outside leaked state. Each
timed result is verified after the timer stops. There is no control subtraction
or claim that timings isolate only one internal adapter instruction.

## Reproduce

With exact frozen checkouts and their original private artifacts available:

```sh
node agents/validation/python-handled-state/driver.cjs prepare /tmp/handled-cost ROOT244 ROOT249
/opt/cocalc-webdev-python/bin/python agents/validation/python-handled-state/fixture.py
```

Copy both `candidate-*.cjs`, `identity.json`, `driver.cjs`, and `fixture.py` into
one new directory on an explicitly reserved, idle benchmark host. Verify the
Node executable identity before running, then from that directory:

```sh
/home/user/bin/node driver.cjs check candidate-0.cjs
/home/user/bin/node driver.cjs check candidate-1.cjs
/home/user/bin/node driver.cjs run candidate-0.cjs > ab-a.json
/home/user/bin/node driver.cjs run candidate-1.cjs > ab-b.json
/home/user/bin/node driver.cjs run candidate-1.cjs > ba-b.json
/home/user/bin/node driver.cjs run candidate-0.cjs > ba-a.json
```

Do not mutate those staged artifacts between runs. Capture idle/process/CPU
censuses before and after, preserve every record, verify staged hashes again,
and release the host. The campaign uses Node 26.7.0, executable SHA256
`ad19784f7e90ba789a099eccba77ede8dc90a778c424f1c10a70fed3ff903fdc`.
CPython 3.14.4 is a correctness oracle here, not a timed comparison.

## Recorded result, 2026-09-12

`results.json` retains all 240 samples (including 72 warmups), exact identities,
raw-record hashes and before/after host censuses. Four successful fresh
processes ran from 09:02:20 to 09:05:58 UTC on the reserved 8-vCPU AMD EPYC
7B13 host. Pre-campaign load was 0.08; post-campaign load reflects the just-ended
run, and final process inspection found no benchmark still running. All output
and ownership checks passed. Staged source, driver and emitted-output hashes
were rechecked unchanged afterward.

Median milliseconds, seven retained samples per cell:

| Operation | Count | A/B: #244 | A/B: #249 | B/A: #244 | B/A: #249 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Loop control | 1,000,000 | 478.92 | 498.30 | 496.45 | 469.72 |
| Ordinary calls | 1,000,000 | 500.48 | 502.17 | 495.57 | 479.14 |
| Plain creation | 20,000 | 337.25 | 200.50 | 332.82 | 199.59 |
| Plain resume | 500,000 | 585.94 | 584.42 | 588.37 | 568.58 |
| Owned creation | 20,000 | 301.06 | 340.14 | 320.74 | 341.21 |
| Owned resume | 500,000 | 596.28 | 623.78 | 609.71 | 598.97 |

The bounded plain-creation improvement is repeatable in both orders: 40.5% and
40.0% lower median time for this fixture. This supports the intended allocation
removal versus #244, not recovery against a pre-ownership implementation.
Ordinary-call/control and resume differences vary with order; they do not
establish a general speedup or zero overhead.

Owned creation is **not a no-regression pass**: candidate medians are 13.0% and
6.4% higher, with maximum retained samples of 616.03 and 597.43 ms versus
348.70 and 338.06 ms on #244. Each process runs the plain-creation case first,
and validation creates/consumes many objects between samples; changed allocation
history and GC are possible contributors, not a proven explanation. A separate
isolated-case campaign is needed before attributing or dismissing that signal.
No samples were discarded. These microbenchmarks do not qualify full packages,
startup, suspended-handler throughput generally, or main integration readiness.

Read-only attribution check: `code-comparison.json` records byte hashes of the
complete emitted function declarations (from their `var $ρσ$py$NAME = function`
declaration through the closing declaration before `NAME.__name__` metadata),
and the full emitted `ρσ_handled_state` IIFE. `owned_values` (2,407 bytes),
`owned_create` (871), `owned_resume` (1,201), and the handled-state helper
(2,773) are byte-identical between the two artifacts. Control/calls and the
plain creation/resume loops also match. Only `plain_values` differs among these
selected declarations, by the 25-byte wrapper removal. This excludes a direct
text change in those owned operations, not allocation, JIT, or other generated
runtime effects.

## Separate isolated-case diagnostic

The reviewed followup retains the original mixed results above unchanged.
`isolated-driver.cjs` selects only `plain_create` or `owned_create` per fresh
process, without any earlier timed phase. It checks the same original staged
JS/fixture/driver identities. Sizes, three warmups and seven retained samples
are unchanged; heap-used readings before/after each call are outside timing.
There is no forced GC. The small initial correctness probe and between-sample
creation validation are still present, so this is not a GC-free measurement.

Eight fresh processes on the separately reserved host run A/B/B/A for plain
creation, then A/B/B/A for owned creation. `isolated-results.json` retains all
80 samples, heap readings, exact hashes and censuses. All correctness and final
hash checks pass. Median milliseconds:

| Case, 20,000 creations | A/B: #244 | A/B: #249 | B/A: #244 | B/A: #249 |
| --- | ---: | ---: | ---: | ---: |
| Plain creation | 328.10 | 196.06 | 335.53 | 198.88 |
| Owned creation | 342.07 | 337.54 | 336.05 | 348.35 |

Plain creation again improves 40.2%/40.7%. Owned medians change -1.3%/+3.7%,
and maximum retained samples are 533.14/466.10 ms on #244 versus
447.46/471.05 ms on #249. The earlier candidate-only tail excess does not
repeat under this protocol. This supports workload/phase-history sensitivity;
it neither identifies GC as the cause nor erases the original mixed-workload
regression signal or proves universal no-regression. No runtime patch followed
the timing observations.

To reproduce the isolated protocol, stage `isolated-driver.cjs` alongside the
unchanged original files and use these fresh commands, first for `plain_create`
and then for `owned_create`:

```sh
/home/user/bin/node isolated-driver.cjs candidate-0.cjs plain_create
/home/user/bin/node isolated-driver.cjs candidate-1.cjs plain_create
/home/user/bin/node isolated-driver.cjs candidate-1.cjs plain_create
/home/user/bin/node isolated-driver.cjs candidate-0.cjs plain_create
```

The benchmark source/driver were initially staged from
`bench/python-handled-state/` and then relocated here unchanged in content.
This is developer-only validation evidence under the existing validation-input
boundary, not a new build exclusion. Compiled outputs retain their original
source filename provenance; file-content hashes bind the exact fixture and
driver. No runtime artifact or frozen receipt was rewritten for the report.
