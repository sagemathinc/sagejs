# MicroPython language compatibility corpus

This directory vendors `tests/basics` from MicroPython at the exact revision
recorded in `SOURCE.json`. The files are distributed under MicroPython's MIT
license, reproduced in `LICENSE`.

MicroPython uses three kinds of tests:

- tests using `unittest`, for MicroPython-specific behavior;
- tests with an adjacent `.exp` file, also for MicroPython-specific behavior;
- ordinary `.py` tests whose combined output must exactly match CPython.

Sage.js runs the third category as a Python-language compatibility corpus. The
runner executes each program independently under a reference CPython and under
Sage.js in Python mode, then classifies the result. It does not modify the
vendored sources.

Run a read-only report:

```sh
pnpm python:conformance
```

Check that every classification and raw execution fingerprint matches the
reviewed baseline:

```sh
pnpm test:python:conformance
```

After intentionally fixing compatibility gaps, inspect a report and update the
baseline:

```sh
pnpm python:conformance:update
```

Set `SAGEJS_REFERENCE_PYTHON` or pass `--python PATH` directly to choose the
reference interpreter. The runner selects a baseline file by CPython
major/minor, but format 2 also requires the exact reviewed patch version.
Changing the oracle requires fresh evidence and explicit review, not relabeling
old results. Use `--only REGEXP` and `--verbose` in report mode for diagnosis.

To inspect already-built artifacts without rebuilding for unrelated workspace
changes, run:

```sh
node scripts/run-python-conformance.cjs --artifact-report --only dict --verbose --json /tmp/python-report.json
```

Choose a writable report path for your host (`/tmp` above is a Unix example).
This is explicitly **not** a current-source qualification. It cannot be
combined with `--check` or `--update-baseline`. Ordinary checks and updates
still require a current successful build receipt before and after execution.
Do not run this diagnostic while a build is replacing runtime artifacts.

`--json PATH` retains raw stdout/stderr (also as lossless base64 bytes), termination details, source/fixture/
license hashes, reviewed differences, runtime artifact hashes, and reference
identity. Only a completed, successful baseline check against a current build
sets `artifact.qualifiedGate`; a report, failed check, or baseline update does
not. Reports are local diagnostic artifacts, not shipped runtime data.

For a cold-process performance comparison against a locally installed
MicroPython, run:

```sh
MICROPYTHON=/path/to/micropython pnpm bench:micropython
```

This intentionally starts a fresh interpreter for every sample and therefore
measures startup, parsing/compilation, and execution together. It reports
per-test ratio distributions because summing this correctness corpus gives
arbitrary weight to its chosen iteration counts. Before timing, an unrecorded
behavior probe compares each runtime's exit status and output. Tests unsupported
by an older packaged MicroPython, or otherwise doing different work, are listed
and excluded instead of aborting or distorting the benchmark. Use `--json PATH`
to retain a machine-readable report, `--sagejs-mode precompiled` to remove
Sage.js compiler time while retaining cold Node startup, and `--help` for
sampling controls.

Reviewed differences which should not be emulated are recorded separately in
`INTENTIONAL-INCOMPATIBILITIES.json`. A format-2 record binds the exact test
source, oracle version, raw status, and both runtime execution fingerprints.
Even a different wrong answer with the same `output-mismatch` status remains
visible; a new compiler error, runtime error, or exact pass also changes the
baseline. In particular, Sage.js exposes
native JavaScript weak references and deterministic explicit `finalize`
operations, but does not pretend that `gc.collect()` can synchronously control
V8 collection or `FinalizationRegistry` scheduling.

The original MicroPython test-suite documentation is preserved as
`UPSTREAM-TESTS-README.md`.

## Compatibility baseline

At adoption, 508 of the 576 programs are CPython-differential candidates.
The initial run produced exact output for 70 tests. Sage.js now matches CPython
exactly on 506 of them. The remaining two are the reviewed weak-reference
collection-timing differences described above, so every differential candidate
is either an exact pass or has an explicit semantic decision. The format-2
baseline is bound to CPython 3.14.4. Fingerprints include combined output,
separate stdout/stderr, exit status, signal, timeout, and launch-error details.
Only CRLF-to-LF normalization is permitted; no broad address, path, exception,
or whitespace stripping is used to manufacture agreement.

The baseline also binds all vendored fixtures and source files, source metadata,
license, upstream README, and the intentional-difference records. Changed
sources, licenses, exclusions, or newly passing outcomes require review.
Fingerprinting does not make these tests a security sandbox: this command
executes the reviewed pinned corpus, not arbitrary upstream or generated code.
The general isolated runner and VM/container fuzzing are separate workstreams.

The historical **format-1** 3.15 baseline also records one `oracle-error`:
`string_format_modulo.py` expects an exception class that changed in CPython
3.15, so the unmodified upstream test itself exits nonzero. Keeping that result
visible is preferable to silently patching or excluding vendored source. It is
retained as historical evidence, not a fingerprint-qualified gate. `--check`
rejects format 1; use report mode with an installed 3.15 oracle and explicitly
review a migration before claiming 3.15 qualification. The GC review records
are likewise specific to their recorded oracle, not automatic cross-version
exceptions.

For the finalizer test, two exact observed fingerprints are reviewed: the final
callback may run at process exit or remain deferred. `alternateEvidence`
records that finite set without stripping callback lines or accepting arbitrary
GC output. Each alternative binds the same source and oracle. A new variation
still requires review; infrastructure failures cannot be intentional differences.
