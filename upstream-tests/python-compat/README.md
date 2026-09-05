# Reviewed upstream Python cases

This initial tranche runs 28 required public-behavior assertion programs through
one bounded runner: 12 RustPython, 4 PyPy, 5 GraalPy, 4 IronPython, and 3 CPython
cases. It is a useful selection, not full coverage of any upstream suite.

Each suite's `SOURCE.json` pins its revision and records exact file hashes,
licenses and any selected spans or local invocation adapters. The newer tranches
retain upstream assertions unchanged. CPython and IronPython method selections
use real `unittest.TestCase`/`TestResult` adapters, not substitutes for assertion
semantics. No implementation-specific VM, CLR, Truffle or private test harness
is shipped with these cases. Do not format vendored source or license bytes.

```sh
node scripts/run-python-compat.cjs --python /path/to/python3.14 --json /tmp/python-compat.json
```

The oracle pin is CPython **3.14.4**. The selected CPython source revision is
from **3.14.7**; source-suite version and executable-oracle version are different
identities and must not be conflated. Every case is P1/required on Node, with
explicit bounds and temporary-filesystem capability. Missing features are work
to implement, not an invitation to convert failures into accepted differences.

The initial diagnostic run after adoption used the existing `dc958903c` runtime
build, Node 26.8.1 on Linux x64, and the pinned oracle: 13/28 passed, with 15
required assertion failures. All four PyPy and three CPython selections passed;
two IronPython selections and all five GraalPy selections exposed failures.
All twelve existing RustPython outcomes were unchanged (4 pass, 8 failures).
This was explicitly an **artifact-only, unqualified** diagnosis because the
workspace had advanced after the build. Current-source and cross-platform
qualification remain required after fixes. No pass percentage represents the
Python language or any upstream project's overall support.
