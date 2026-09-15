# Public annotation dictionaries

This candidate is based on prepared-call snapshot
`3b4e8f24ba61d7822f421af52ad42a42b81f5ef2`. Its owner explicitly released
`src/output/functions.py` after detaching the clean snapshot. The prior
oracle/proposal checkpoint is `8ed359f29`; its contaminated local diagnostic
artifacts are not inputs here.

Public function `__annotations__` uses the existing exact dictionary
flat-pair constructor, including empty metadata. It avoids staging keys in a
host object, preserving `__proto__` and declaration order. Each function
still receives a fresh mutable dictionary; repeated reads and bound method
access retain the existing shared identity.

Public annotation enumeration retains annotated receivers. Removing a
receiver from the callable ABI must not remove it from Python metadata.
Baselib raw metadata and the separate `__annotations_text__` representation
retain their existing object representation and receiver handling.

The modes remain distinct: future annotations preserve source strings;
Sage's explicit `from __python__ import annotations` eagerly evaluates values,
including receiver annotations and their errors. CPython 3.14 default deferred
annotations are not implemented by this change and are not claimed compatible.
In eager mode an unquoted reference to the class currently being defined can
raise `NameError`; preserving that receiver annotation must not suppress it.

## Qualification boundary

Focused tests cover exact public and raw initializer output, negative emitted
code mutants, independent receiver checks, classmethods, fresh dictionaries,
special keys, eager order and raising annotations. The fixture is also ordinary
CPython-parseable future-annotation source. Compiler-only regeneration starts
from a private copy of the clean prepared artifact and is diagnostic, not an
own-source full build. Root coordinates the next combined full build with
the independent divmod change. No performance improvement or full-build
qualification is claimed before that evidence exists.

No native/runtime source, dependency or source allowance changes are involved.
The cost motivation remains the historical PR266 CPU profile, not a new
allocation measurement or controlled speedup result.

## Focused diagnostic result and retained blocker

Compiler-only convergence completed in two passes (126.529s and 125.673s).
Strict checks passed for 403 modules with zero errors. The unchanged runtime
source budget is 899355/903000 bytes. The CPython 3.14.4 future fixture passes.
The focused suite currently reports eight passes and two failures, with no
skips or TODO classification: both modes fail the separately named eager
class-publication oracle. The other public, raw emission, receiver/classmethod,
freshness, order and raising-expression cases pass.

The failing example is:

```python
from __python__ import annotations

class UndefinedReceiver:
    def method(self: UndefinedReceiver):
        pass
```

The explicit eager contract requires a name lookup before the enclosing class
has been assigned. Sage instead exposes its partially constructed class, yielding
`{'self': <function UndefinedReceiver>}`. An ordinary nonreceiver parameter
`def method(self, value: EarlyPublication)` exhibits the same premature
visibility. CPython 3.14 can demonstrate the timing boundary by using a function
decorator that accesses `fn.__annotations__` while the class body is executing:
it raises `NameError`. This does not equate CPython's deferred default with the
explicit eager directive.

This class construction defect is not an accepted incompatibility or a passing
annotation oracle. Its assertion stays strict and independent so it cannot mask
the other eager evaluation checks. No class-emitter fix is included in the
current source claim. Root approved this coherent checkpoint for combined
qualification while explicitly retaining both failing cases, not waiving them.

Reproduce the timing oracle with CPython 3.14:

```python
def eager(fn):
    fn.__annotations__
    return fn

try:
    class EarlyPublication:
        @eager
        def method(self, value: EarlyPublication):
            pass
except NameError:
    print("name-error")
```

Observed CPython 3.14.4 output: `name-error`. The independent Sage eager
nonreceiver probe prints `{'value': <function EarlyPublication>}`. The committed
test's receiver variant fails with `AssertionError` at the `else: assert False`
in both modes. Run `node --test test/python-annotation-flat-pairs.cjs` for the
complete strict matrix; its nonzero exit is intentional evidence of an
unrepaired defect, not a successful compatibility qualification.
