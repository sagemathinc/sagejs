# Pinned pure-Python package probes

The manifest retains eleven pinned package smoke workflows. These checks do not
claim complete package support, upstream-suite coverage, a compatibility
percentage, or four-platform qualification. The explicit CPython implementation
and version in the manifest must match the chosen oracle executable.

Output comparison uses the shared byte-level transport contract: CRLF becomes
LF and nothing else is normalized. Original stdout/stderr bytes remain base64
evidence. UTF-8 decoding must be lossless, and bare carriage returns or altered
non-ASCII text cannot pass. This accepts native Windows text stdout without
changing a package's Python source or reconfiguring its stream semantics.

Oracle identification records both implementation names, the exact pinned
version (currently CPython 3.14.4), full build-version text, cache tag,
free-threaded build configuration, and actual GIL-enabled state. Its absolute
`sys.executable` must resolve to a regular file; the runner records the resolved
path and hashes those local bytes. The reported executable path is preserved
for execution, including virtual-environment startup semantics. A final probe
of that path must match the entire initial identity before qualification.

Run the selected smoke workflows, using a current build:

```sh
pnpm build
node scripts/run-pure-python-packages.cjs --only six --python /path/to/python --json /path/to/packages.json
```

The default oracle uses the repository's `pythonExecutable()` selection:
`SAGEJS_REFERENCE_PYTHON`, then `PYTHON`, then native Windows `python` or otherwise
`python3`. An explicit `--python` overrides that choice. `--only` is repeatable;
without it all eleven smoke workflows remain selected. The runner installs the
full pinned tree even for a subset so explicit dependencies such as six remain
available. Install/download time is diagnostic evidence, never a package timing.
An installation/receipt error prevents qualification and does not establish a
package behavioral failure.

## Optional selected upstream suite

`--upstream-suites` additionally runs every reviewed upstream selection associated
with the selected packages. Currently this is all seven unchanged methods in
Tomli 2.3.0's `tests.test_error.TestError` class:

```sh
node scripts/run-pure-python-packages.cjs --only tomli --upstream-suites --json /path/to/tomli-suite.json
```

The ordinary public workflow still runs, and `--timings` retains its existing
workflow phase meaning. Suite results are separate under `upstreamSuites`; their
process durations are diagnostic, not comparative timing qualification. A run
with `--upstream-suites` and no reviewed selections is an error. `--list` includes
the seven fully qualified test IDs when the flag is present.

The suite pin is commit `3fccd16450d0f1d87c042473d95a07f60955206e`; its MIT license,
original headers, file sizes and SHA-256 inventory accompany the unchanged test
module and `tests/__init__.py` support fixture. The installed pure wheel and
dependency tree are the same receipt-verified inputs used by the public workflow.
No external pytest dependency, source rewriting, no-op warning assertion,
capability skip, expected failure, or omitted method is accepted. The narrow
driver uses genuine unittest discovery/suite/result APIs and requires exactly
seven discovered and executed methods with no nonpass result buckets. The
selection supplies the exact test IDs; the driver checks discovery and records
each started test, and the outer runner checks those observed IDs and count as
well as exact fixture/package origins. Transport normalization happens once;
remaining carriage returns are rejected rather than normalized again.

Fixture-origin comparison resolves absolute native paths, permitting native
separators and temporary-directory aliases; all original output bytes remain in
the report. Driver/selection/provenance/fixture hashes are verified before and
after both runtimes and at the final gate. Source mutation, missing/added files,
timeout, unexpected output, failure, or incomplete selection prevents qualification.
Upstream test sources and caches remain outside shipped runtime payloads.

This is a selected error-handling suite, not Tomli's whole test suite. Its
`test_misc` and `test_data` modules are not adopted or counted as skips. This
specific pinned class has no module/class/test setup or teardown overrides,
custom construction, cleanup hooks, parametrization, subTests, or external data
fixtures. The adapter makes no broader fixture-support claim; new source pins or
selections need their own fixture review. Passing needs current-source receipts
on the actual host and does not establish four-platform/SEA/browser support.

## Optional phase observations

Only packaging, six, and tomli have reviewed import/setup/workload/verification
fixtures. Enable them with:

```sh
node scripts/run-pure-python-packages.cjs --timings --only packaging --only six --only tomli --samples 7 --warmups 3 --iterations 1000 --json /path/to/package-phases.json
```

The defaults are seven samples per scope, three warmup calls per phase process,
and 1000 calls per warm batch. Bounds are 1–30 samples, 0–100 warmups, and
1–10000 iterations. Sample controls require `--timings`; other selected packages
remain smoke-only and explicitly `unmeasured`.

The smoke check and a separate paired phase-fixture correctness preflight must
pass before measurements are accepted. Every measured call's returned value is
checked in the same process after its timer stops. A failed oracle is an
oracle/fixture problem, not a Sage.js timing cliff. A timeout, failed semantic
check, unexpected output, invalid or missing timing, or changed source prevents
classification; raw failure records remain available.

| Scope | Measured work |
| --- | --- |
| `cold-cli` | Externally measured process start through exit for import, setup, one workload invocation, verification and protocol output. |
| `cold-import` | In-process execution of the first package import statements, after timer-module setup; not compiler/link/launcher prework. |
| `first-call` | The genuine first workload invocation after import/setup, before any warmups; verification follows its timer. |
| `warm-throughput` | One fixed-size batch of repeated workload calls after warmups; includes loop/result collection, excludes verification of all returned values afterward. |

The three in-process scopes share one fresh process per sample. `cold-cli` uses
a separate fresh process so its duration never contains warm batches. Each
scope reports exactly the requested number of samples per runtime and its
median. Warm timing units are milliseconds per batch, not per call. Comparisons
between reports require the same batch/warmup settings and fixture identities.

Cold means fresh process/module state and a fresh writable HOME/XDG cache for
each launch, not flushed OS caches. The installed wheel tree and existing built
standard-library artifacts are shared and their identities are reported. Sage.js
may perform compilation or linking before the timed import statement; that
prework is included in `cold-cli`, not relabeled as pure import time.

The JSON report preserves subprocess output, diagnostic elapsed durations,
source hashes before/after execution, raw accepted samples, policy and fixture
identities, package/wheel receipts and tree hashes, and outer runtime/build
identities including Node/V8/platform/architecture. A timeout's diagnostic
elapsed duration is never accepted as a completed timing sample. Source or
artifact changes invalidate measurement classification.

Each scope uses the existing
[performance policy](../../bench/python-compat/performance-policy.json)
independently. A single report is always `provisional-single-run`, even at seven
samples. Reaching the sample floor is not independent confirmation; repeat on a
quiet qualification host before confirming a cliff. Passing the probe does not
mean every scope is within the performance envelope: policy classifications
remain visible, and there is no aggregate package performance percentage.

`--artifact-report` permits diagnosis of existing artifacts but never qualifies
current source or comparative performance. Its timing classifications are
`not-comparable`, its observations explicitly artifact-only. The default mode
requires a current build and unchanged identities before qualification.

Execution has time/output bounds and a subject V8 heap limit; these are not a
security sandbox or a total-RSS/download/decompression memory quota. Temporary
programs, installed targets and writable caches are removed in `finally`.

## Initial source-bound observations

The Linux x64 run at `dc958903cac1da45a101691aede0f07bbbc70b69`
(Node 26.8.1, CPython 3.14.4) completed with unchanged source, build outputs,
oracle executable and installed wheel tree. Seven of eleven workflows passed:
packaging, attrs, tomli, decorator, sortedcontainers, pytz and python-dateutil.
The complete package matrix **did not qualify**. Remaining observations were:

| Package | Required failure |
| --- | --- |
| six | Correct smoke output, but module `__file__` became `<string>` instead of the installed source path. |
| pyparsing | Nested-class base lookup raised `ReferenceError: Chinese is not defined`. |
| idna | Correct smoke output, but Node's deprecated built-in punycode warning leaked to stderr. |
| mpmath | Subject exceeded the 30-second execution deadline; no completed result. |

With one sample, three warmups and 1000 calls per batch, packaging and tomli
showed approximately 5.6/6.8 seconds of import time and 2.8/2.0 seconds per warm
batch. The paired CPython observations were about 24/15 ms and 12/9 ms. These
are provisional investigation leads, not independently confirmed cliffs, and
do not waive the remaining behavioral failures. Reproduce with `--timings
--samples 1 --warmups 3 --iterations 1000`; retain `--json` evidence locally.
No raw evidence or installed wheel caches are included in shipped artifacts.
