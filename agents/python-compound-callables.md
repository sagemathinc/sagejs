# Compound callable values

Branch/worktree: `python-compound-callables`, based on main `c4c126d09`.
This is a bounded compiler subtask, separate from the assigned-initializer and
resolved-attribute keyword-call branches. Their shared emitter edits require
explicit integration review, not silent stacking.

## Scope

Ordinary positional calls through a name resolve an inherited `__call__`, but
compound expression values previously bypassed that resolver. Thus `b(3)` and
`saved = b + b; saved(3)` worked while `(b + b)(3)` failed with a JavaScript
"is not a function" error. Conditional, unary, and star-only forms had the
same omission.

The Python emitter now passes no-keyword binary, conditional, unary, and
sequence callable values to the existing `ρσ_invoke_prepared_method` boundary.
The one-slot target record is evaluated before the argument array, and the
helper resolves the callable only after arguments have finished. This avoids
duplicating operands and preserves argument side effects, argument exceptions,
and live `__call__` mutation even when the selected value is not callable.
Sequence values are parenthesized to remain one record slot.

Names, attributes, direct/native calls, legacy output, and JavaScript `new`
remain on their existing paths. No runtime helper or signature protocol is
added. This is a correctness change, not a performance claim.

Keyword calls are deliberately unchanged. Their ordinary compound form already
works, and is covered as a control. Existing nonrepeatable keyword callable
expressions can still resolve an invalid target before evaluating arguments;
this patch does not claim to fix that separate ordering gap.

## Tests and qualification

The ordinary CPython fixture covers own and inherited callable instances,
fresh compound results, conditional/logical/unary/walrus targets, positional,
empty, and starred arguments, operand/condition/argument ordering, live slot
mutation during argument evaluation, noncallables, and argument-exception
precedence. An emitted-AST oracle checks the direct/new/legacy exemptions and
the one-slot sequence representation.

The diagnostic compiler was generated and published only to this worktree's
ignored compiler artifact, so kernel workers actually loaded the candidate.
All 73 focused tests passed: compound callables, CST lowering, callable-slot
mutation, and metaclass dispatch. The first in-process-only diagnostic override
did not reach workers and is not candidate execution evidence. No diagnostic
run creates or qualifies a full-build receipt.

Dependencies and initial artifacts were copied as seeds without hardlinks.
`parallel:check` reports the existing ambiguity among 406 inherited contracts;
no shared contract was created for this bounded task. A frozen full build,
strict Python, portable tests, and package-connected results follow below.

The first full-build attempt stopped at missing pinned grammar submodules in
the new worktree. Initializing only the required Magma, Matlab, and Wolfram
gitlinks resolved that environmental issue. The unchanged candidate then
passed `pnpm build:check` in 12m 22s, receipt
`2026-09-12T07:01:20.469Z`. This was an actual full build, not seed reuse.
Five optional native adapters were absent; production native kernels were
explicitly skipped.

The frozen artifacts passed 119 focused/package-infrastructure tests, all 206
portable test files, strict Python checking (387 modules, zero errors),
formatting (848 files), merge checking, documentation checking, and standalone
compound-call smoke tests in Python and Sage modes. Documentation checking
reused the full-build receipt without regenerating files. `test:changed --list`
selected merge/build/full integration; the bounded qualification used the
receipt-aware full build and stated focused/portable/package slices, not the
entire integration suite.

The pinned pyparsing 3.3.2 public workflow is **not qualified**. Its first
source-qualified run timed out at 30,137.68 ms under the unchanged 30-second
bound, with empty stdout/stderr; CPython passed. This ran concurrently with
portable and strict checks. Exactly one subsequent baseline/candidate
diagnostic pair ran after those local jobs ended, with the same 30-second
limit. Both failed with identical `TypeError: too many positional arguments`:
baseline 23,945.89 ms, candidate 24,012.40 ms. The stable baseline's source
trees match main `c4c126d09`, but its build receipt no longer matches current
inputs, so both comparative runs used explicit artifact-report mode and are
not source qualification. No timeout or budget was increased. Reports are
`/home/user/python-compound-callables-pyparsing.json` and
`/home/user/python-compound-callables-{baseline,candidate}-pyparsing-artifact.json`.
These findings retain the package failure rather than converting a matching
baseline defect into a passing gate.

## Independent callable-slot gap

The shared `ρσ_resolve_callable` currently uses ordinary attribute lookup for
nonfunction instances. On the unchanged baseline:

```python
class A:
    def __call__(self, x):
        return x + 1

class B(A):
    pass

b = B()
b.__call__ = lambda x: -1
print(b(3))

class Plain:
    pass

p = Plain()
p.__call__ = lambda x: 99
try:
    print(p(3))
except TypeError:
    print("TypeError")
```

CPython prints `4` and `TypeError`; Sage.js prints `-1` and `99`. Reusing that
resolver exposes the same limitation for compound targets. Function-shaped
callable-class adapters already use the type-slot helper, so their existing
mutation tests do not cover this raw inherited-instance distinction. A
separate shared-resolver correction should reuse the existing type-slot
lookup, preserve native/class/adapted boundaries, and verify argument order.
This emitter change does not claim full compound-callable compatibility or
performance closure. Package qualification remains pending; keep its PR draft.
