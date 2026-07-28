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

The original MicroPython test-suite documentation is preserved as
`UPSTREAM-TESTS-README.md`.

## Initial baseline

At adoption, 508 of the 576 programs are CPython-differential candidates.
Against both CPython 3.14.4 and 3.15.0b3, Sage.js already produces exact output
for 70 tests and runs another 103 to completion with differing output. The
remaining outcomes identify concrete compiler, runtime, builtin, and module
gaps.

The 3.15 baseline also records one `oracle-error`:
`string_format_modulo.py` expects an exception class that changed in CPython
3.15, so the unmodified upstream test itself exits nonzero. Keeping that result
visible is preferable to silently patching or excluding vendored source.
