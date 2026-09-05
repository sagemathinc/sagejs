# Python in Sage.js

Sage.js is an independent implementation of Python for mathematical computing
on JavaScript and WebAssembly. It targets portable, user-visible Python 3.14
semantics. CPython is the primary compatibility reference, not the embedded
engine or an absolute implementation specification.

Ordinary Python syntax and protocols should work predictably. An unexpected
wrong answer, lost exception, or unusably slow common operation is a bug to
investigate—not automatically an acceptable implementation difference.
Compatibility remains incomplete; use the linked tests to judge a particular
workflow rather than assuming all pure-Python packages work.

## Query the implementation

```python
import sys
import platform

sys.implementation.name         # 'sagejs', never 'cpython'
sys.implementation.version      # Sage.js product version, five named fields
sys.implementation.cache_tag    # 'sagejs-314', not a CPython bytecode ABI
sys.version_info               # targeted Python language version
platform.python_implementation()  # 'SageJS'
platform.python_version()       # targeted Python version, e.g. '3.14.4'
```

The version tuple fields are `major`, `minor`, `micro`, `releaselevel`, and
`serial`. Product and language versions are independent. A product version's
`final` release level describes its version syntax; it does not mean Sage.js
has left alpha or achieved full Python compatibility. These identities do not
change when using Sage mathematical preparsing instead of Python mode.

Use language-version checks for language features, implementation checks only
for genuinely implementation-specific behavior, and concrete operation checks
for facilities whose support depends on the host. A general machine-readable
Python capability report is still being developed; the mathematical Wasm
capability table is not a substitute for one.

## Intentional boundaries

- There is no embedded CPython runtime, CPython bytecode, CPython C-extension
  ABI, or reference-counting contract. Native CPython wheels cannot be loaded.
  The package installer accepts supported platform-independent Python wheels;
  that alone does not qualify every operation in an installed package.
- Garbage collection follows the JavaScript engine. `gc.collect()` cannot
  promise synchronous weak-reference or finalizer behavior. Prefer explicit
  cleanup and context managers for resource lifetime.
- Browser embeddings do not provide arbitrary operating-system access.
  Filesystem, process, and network behavior depends on the embedding's host
  services; see [standard-library support](python-standard-library.md).
- Sage mode adds mathematical syntax and types. Use `sagepython` or
  `sagejs --python` when ordinary Python arithmetic is the required contract.

The upstream MicroPython identity test permits only its own name or CPython's.
Sage.js deliberately fails that particular name whitelist while retaining the
unchanged upstream test and a source/output-bound review. Spoofing CPython
would send packages down potentially invalid implementation-specific paths.

## Evidence, not a compatibility percentage

### Structured kernel diagnostics

Errors rejected by `createSage().evaluate(...)` now expose a JSON-safe
`error.pythonDiagnostic` envelope (`schemaVersion: 1`). The exported TypeScript
types are `PythonDiagnostic` and `SageDiagnosticError`. The envelope distinguishes
parse, compile, import, execution, and host phases, with an exception type,
message, category, and source span where the compiler actually provides one.
Filenames are preserved verbatim, including logical Windows paths. Lines and
columns are one-based; columns and zero-based offsets use UTF-16 code units,
matching the JavaScript source string. Parser spans can cover the offending
expression rather than a single token.
Timing-directive prefixes are accounted for: spans refer to the submitted cell,
not the shortened statement passed to the compiler.

Cause/context fields and suppression flags survive the worker boundary;
traversal is bounded against cycles and branching chains. This does **not** yet
implement Python `raise ... from ...` or automatic exception-context tracking.
Runtime Python frames are not yet available: `frames` is empty and unknown
runtime filenames/spans are `null`, not locations guessed from generated
JavaScript. The envelope omits host stacks by default; the original Error still
retains its existing stack for debugging. Parent-side worker shutdown/timeout
errors, CLI/browser error presentation, and full Python tracebacks remain
separate work. This is a structured kernel API, not complete traceback support.

### Qualification scope

The [MicroPython corpus](../upstream-tests/micropython/README.md) compares exact
observable output with a pinned CPython oracle. The
[multi-suite corpus](../upstream-tests/python-compat/README.md) adds unchanged
assertion programs and records current required failures explicitly. Neither
is the complete Python or standard-library suite. Historical receipts identify
their own source revisions, oracle versions, artifacts, and tested targets.

The [performance laboratory](../bench/python-compat/README.md) treats severe
slowdowns as a separate compatibility concern, with both time ratios and
absolute latency thresholds. Passing semantics does not imply acceptable
performance; a primitive speedup does not by itself qualify a real application.

Package workflow probes likewise do not mean that a package's entire upstream
test suite passes. Four-platform and real-browser qualification are explicit
additional gates, not consequences of a passing local Node test.
