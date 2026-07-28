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

Check that every classification matches the reviewed baseline:

```sh
pnpm test:python:conformance
```

After intentionally fixing compatibility gaps, inspect a report and update the
baseline:

```sh
pnpm python:conformance:update
```

Set `SAGEJS_REFERENCE_PYTHON` or pass `--python PATH` directly to choose the
reference interpreter. The runner selects a baseline by CPython major/minor
version, allowing Sage.js to track multiple language versions concurrently.
Use `--only REGEXP` and `--verbose` in report mode for focused diagnosis.

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
`INTENTIONAL-INCOMPATIBILITIES.json`. A record applies only while the test has
the exact reviewed raw status; a new compiler error, runtime error, or exact
pass remains visible and changes the baseline. In particular, Sage.js exposes
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
is either an exact pass or has an explicit semantic decision.

The 3.15 baseline also records one `oracle-error`:
`string_format_modulo.py` expects an exception class that changed in CPython
3.15, so the unmodified upstream test itself exits nonzero. Keeping that result
visible is preferable to silently patching or excluding vendored source.
