# General reference laboratory

These are M0 screening tools under construction, not final qualification
receipts. No result here establishes independent replay or the frozen panel.

`pari-screen.gp` supplies `frontier_case(id, coefficients, bits, iterations,
seed)` for a persistent GP process. Each iteration performs fresh `bnfinit`
from ascending polynomial coefficients, obtains factored units, exercises
unit-generator coordinates and class-generator decompositions, and obtains
compact witnesses for the common polynomial-defined ideals $(2,\alpha)$,
$(3,\alpha+1)$, $(5,\alpha-1)$. These ideals may be the unit ideal. They do not
replace nontrivial predeclared cross-system ideal/unit probes in qualification.

Compact GP text (including the integral basis) is materialized inside the
timer. It is explicitly not an independent certificate format. The timer
excludes output transport; it uses millisecond resolution, so single tiny
calls are syntax/correctness diagnostics only. Qualification must use fresh
batches lasting at least one second and independent retained samples.

The request is conditional on PARI's GRH assumptions. `realbitprecision` is
working precision, **not a certified absolute-radius request**; the reported
regulator is an approximation, not an enclosure. In particular, changing
100 to 200 does not by itself make this equivalent to Hecke's
`regulator(factored_free_units, 200)`. Keep this distinction in all downstream
reports. No call to expanded `b.fu` or `nffactorback` is made.

`runner/screen-batch.py` is a Linux cost-screen supervisor. It refuses to run
outside a one-core `{2}`, 4 GiB, no-swap cgroup and acquires the exclusive
`opt` timing lock. It records a durable reservation before each attempt,
retains errors/timeouts, and refuses interrupted or exhausted ledgers. Its
120-CPU-hour M0 ledger charges single-core wall time conservatively, including
a 600-second initial diagnostic allowance. Run it in a systemd user service
with `MemoryMax=4G`, `MemorySwapMax=0`, `CPUAffinity=2`; systemd's default
control-group cleanup is an additional guard if the coordinator is killed.
GP receives `--default parisizemax=2147483648` at startup, not during a loaded
script (changing PARI's stack inside `read` can abort that load).
It also pins `nbthreads=1` and `threadsizemax=2147483648`. Early retained pilots
predate those two explicit settings; the larger supplement exposed a worker
stack overflow. Do not mix configurations in a final baseline. All runs retain
the 4 GiB cgroup cap regardless of PARI's stack-growth ceilings.
Only exact stack-growth warning lines are accepted alongside successful
terminal records; all other diagnostics remain failures. Raw stderr is kept.
`runner/summarize-screen.py` revalidates retained receipts into a separate
hash-linked report without overwriting their original classifications.

`runner/prepare-panel-screen.cjs` chooses up to four deterministic candidates
per populated signature/discriminant band, with a 200-field batch ceiling.
It is reference-cost discovery, not the final panel. `prepare-screen.cjs`
provides smaller rank-two/rank-three pilots. Both consume validated candidate
exports, record their seeds and pool digests, and never use Sage.js outcomes.

`runner/diagnose.cjs` is deliberately separate: local instrumented Sage.js
profiling, explicit source launcher, no enforced memory cap, no authenticated
source/runtime correspondence claim, and no competitive timing acceptance.
It reports context time separately from projections. Its POSIX supervisor's
RSS is reaped-child rusage, not aggregate simultaneous process-tree memory.
Set `SAGEJS_FRONTIER_PROFILE=1` for diagnostic wrappers around relation search,
partial handling and ideal arithmetic. Reported times are **inclusive and
nested**, not additive phase times. Wrappers retain exceptions and return
values; partial snapshots contain only completed calls. These runs change
instrumentation, never the search policy, and cannot support timing claims.
An optional fourth `diagnose.cjs` argument supplies a predeclared case JSON
file instead of the three smoke examples.

`screen-batch.py --engine hecke` uses the same controls and ledger, with explicit
`--julia`, `--project`, `--depot`, and `--worker` paths. It disables package/cache
generation and records the provisioned manifests and transport source hashes.
These are fresh-process cost probes: Julia JIT work is not a qualified warm
persistent-process baseline. A missing existing cache is an infrastructure
failure, never permission to install dependencies on the timing VM.

Before competitive qualification, finish common compact transport, additional
cross-system map probes, explicit precision/accuracy matching, version/source
authentication and complete paired budget receipts. Do not reuse
the old cubic summary-only evidence schema to claim those obligations passed.
