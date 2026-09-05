# Value-driven Python compatibility corpus

This is the first assertion-program slice of the compiler/runtime quality plan,
not a claim of broad CPython equivalence. It supplements the existing exact
MicroPython runner; that runner has not yet been migrated into this manifest.

## Run

```sh
node scripts/run-python-compat.cjs --list
node scripts/run-python-compat.cjs --artifact-report --json /tmp/rustpython.json
node scripts/run-python-compat.cjs --artifact-report --only rustpython/builtin_callable
pnpm build
node scripts/run-python-compat.cjs --json /tmp/rustpython-qualified.json
```

Use `--python /path/to/python3.14` to select the oracle. The initial exact pin is
CPython **3.14.4**. A different patch release is rejected, not silently adopted.
The default command requires a current build receipt before executing anything
and returns failure if any selected required case fails. Filtering qualifies
only the selected scope, never the full manifest. `--artifact-report` permits
read-only diagnosis of an older artifact and explicitly **cannot qualify it**.
There is no baseline-update or accepted-failure option in this first slice.

The report preserves raw bytes, separate streams, exit/signal/error/timeout and
output-limit outcomes, exact source/fixture/license provenance, executable
hashes, Node/V8 identity, and build product inventories. Inputs are checked
again after execution. Process durations are diagnostic observations, **not**
warm-throughput or compile-time benchmarks; performance remains `unmeasured`.

## Selection and contracts

`suites/rustpython/SOURCE.json` pins repository revision, upstream paths, license,
and every byte in twelve unchanged whole programs plus their one helper. Four
programs need `testutils.py`; it is a fixture, not an additional passing test.
No upstream checkout, RustPython installation, pytest, or package download is
needed. `manifest.json` records value tags, priority, capability/target scope,
resource bounds, source digests, fixture destinations, and required disposition.
The loader validates the currently supported contract before execution and
rejects unknown runners, missing provenance, source drift, and unsafe paths.

Both runtimes must complete successfully with **empty stdout and stderr**.
This intentionally rejects the helper's `Skipping test ...` path as well as
warnings or unexpected output. A bad oracle prevents subject execution. Tests
with legitimate output need a different explicit comparison contract, not a
broad normalizer or an exception to the assertion gate.

All twelve selected programs pass under CPython 3.14.4. The first existing-build
Sage.js diagnostic passed three and failed nine. Those nine are required work,
not intentional incompatibilities or an accepted baseline:

| Program | First observed blocker |
| --- | --- |
| `builtin_callable` | A class-defined non-function `__call__` still makes instances callable in Python |
| `builtin_object` | Missing `object.__subclasshook__` |
| `syntax_metaclass` | Metaclass `__new__` argument handling |
| `builtin_issubclass` | Custom `__subclasscheck__` precedence |
| `builtin_isinstance` | Custom `__instancecheck__` for inherited instances |
| `syntax_function_args` | Positional default metadata |
| `builtin_mappingproxy` | Class-dictionary function identity |
| `builtin_dict_union` | Dictionary union operators |
| `builtin_property` | Class-level property access invokes the getter |

These are first-blocker observations, not exhaustive diagnoses of each file.
The passing files were `syntax_call_nested`, `protocol_callable`, and
`builtin_type_mro`. Do not treat this initial diagnostic as source-current,
four-platform, or browser qualification. Later results belong in new receipts.

## Isolation and limits

These are manually reviewed programs with no subprocesses, networking, arbitrary
file writes, or external native imports. Each runtime receives a separate
temporary directory and home, only the declared fixture closure, and a scrubbed
environment without real credentials, user Python paths, or preload options.
Timeout and combined output limits are enforced; the Node subject also has a
512 MiB V8 heap ceiling. Original code is copied without editing assertions.

This is **not a security sandbox** or an OS-wide memory/CPU quota. POSIX process
groups are cleaned up on termination and parent exit. Windows uses the system
`taskkill.exe` tree operation on timeout/output overflow; normal-exit orphan
cleanup is not guaranteed, which is one reason subprocess-using programs are
not admitted here. Broad/generated execution still requires the container-inside-
VM tier in the plan. Home snapshots are recovery, not containment.

Qualification currently targets Node and is pending on all four platform hosts.
SEA/browser adapters, sharding, other comparison/runner types, full upstream
inventories, unified MicroPython orchestration, and general diagnostics remain
subsequent slices. None of this corpus belongs in a shipped runtime payload.

## Additional reviewed upstream Python cases

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
