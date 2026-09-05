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
