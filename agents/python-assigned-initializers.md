# Assigned class-body initializers

Branch: `python-assigned-initializers`.
Base: main `c4c126d09ba4f5c2fb30001fd8b561b24105d80f`.

## Scope and design

The class emitter previously executed leading assignments and then synthesized
`__init__` whenever the AST lacked a directly declared initializer method. Thus
an ordinary class-body `__init__ = initialize` binding was overwritten. Later
assignments could survive but leave metadata copied from an earlier method.

Python class emission now completes the body before deciding whether an own
initializer is present. Presence, not truthiness, controls synthesis: explicit
`None` remains a binding. Signature metadata is finalized from the winning
initializer after MRO resolution, including removal of an explicit receiver
parameter from an assigned ordinary function's class-call signature.

A conservative proof avoids unnecessary fallback and metadata code when a
direct initializer remains bound and later statements consist only of
side-effect-free method creation. Assignments, deletions, decorators, defaults,
annotations, and descriptor definitions invalidate that proof. The AST's
`init` field alone is not sufficient. Obsolete ordinary-Python metadata copies
are removed; the legacy bootstrap/baselib emission path is retained.

Invocation and later mutation continue using the existing descriptor-aware
initializer and live MRO helpers. Ordinary unbound Python functions require an
explicit receiver; legacy receiver-style baselib methods do not. This change
does not replace codec wrappers with free-function aliases, add runtime helpers,
or redesign live `inspect.signature` behavior after class mutation.

## Emitted size

These are measured costs, not a zero-growth or performance-closure claim.
The comparison baseline is `97d6956e6`, whose `src`, `tools`, and `scripts` trees
match the main base above. Direct frontend emission uses the same options in
both worktrees and subtracts a 2,810-byte `pass` program harness.

| Output | Baseline bytes | Reduced candidate bytes |
| --- | ---: | ---: |
| Explicit-initializer class, excluding harness | 6,470 | 6,470 |
| Empty class, excluding harness | 6,880 | 8,099 |
| Explicit-initializer standalone closure | 634,223 | 654,576 |
| Empty standalone closure | 634,678 | 656,314 |

Standalone closure growth is still **3.2–3.4%**. The initial implementation
added 8.5–9%; eliminating redundant metadata and provably unnecessary fallback
code reduced that cost. Remaining growth comes from final signature handling
for assigned/inherited initializer paths. Core-runtime source remains
902,982 / 903,000 bytes; no budget was increased. These source/output sizes do
not establish startup, import, or execution-time performance.

## Regression coverage

`test/fixtures/dynamic-init-class-body.py` is ordinary CPython source. It covers
leading and later assignments, variadic arguments, source-order replacement, saved aliases,
conditional/else/inherited bindings, deleted assignments and declared methods,
explicit noncallables, callable objects used as initializers, callable
instances, inheritance and later mutation, C3 resolution, custom allocation,
initializer return checks, keyword binding, and initial class/inherited-method
signature metadata. `test/python-dynamic-init.cjs` executes the fixture with
the configured CPython oracle and in Python and Sage modes.

## Known independent gaps

The constructor protocols below are not claimed fixed.

An empty class still accepts positional arguments in Sage.js:

```python
class Empty:
    pass

Empty(1)
print("accepted")
```

CPython 3.14.4 raises `TypeError` before printing; Sage.js prints `accepted`.
Deletion regressions therefore test inheritance of a real initializer rather
than accidentally including this separate object-initializer arity defect.

Assigned `staticmethod` and `classmethod` initializer wrappers expose a
downstream constructor descriptor-dispatch gap:

```python
events = []

def initialize(value=3):
    events.append(value)

class C:
    __init__ = staticmethod(initialize)

C(5)
print(events)
```

CPython prints `[5]`. The baseline silently overwrites the initializer and
prints `[]`. This candidate preserves the wrapper but class invocation raises
`TypeError: object is not callable`. Replacing the function parameters with
`cls, value=3` and using `classmethod(initialize)` produces the same distinction.
Preserving the binding is correct; descriptor dispatch needs separate work.

## Validation and handoff

Host: Linux x64, Node.js 26.8.1. CPython oracle:
`/opt/cocalc-webdev-python/bin/python`, version 3.14.4.

The final reduced source passed a full `pnpm build:check` rebuild in 12m 05s.
Its receipt completed at `2026-09-12T05:10:36.054Z`; subsequent documentation
checking reused it. The build precompiled 94 standard-library modules and 66
baselib dependencies. Five optional native adapters were absent; production
native-kernel publication was skipped, not qualified.

Final focused checks passed:

- 106 Node tests across `python-dynamic-init`, `python-cst-lowerer`,
  `python-class-check-hooks`, `python-class-annotations-lazy`,
  `python-metaclass-dispatch`, `property-protocol`, `python-property-clone`,
  `callable-slot-mutation`, `canonical-instance-type`, and
  `class-reserved-method-names`. These include the CPython oracle, both language
  modes, and standalone output. They ran after the frozen full build.
- `pnpm test:baselib:strict`: all 387 modules, zero errors.
- `pnpm merge:check`, including source budgets and owned architecture inventories.
- `pnpm format:python:check`.
- `pnpm docs:check`: current generated documentation; no refresh needed.
- Selected compiler checks: `bytes.py` passed; `classes.py`, `functions.py`, and
  `decorators.py` are explicitly skipped historical stage-zero fixtures, not
  passing Python regressions.

The startup gate is **not qualified**. The initial candidate check and exactly
one baseline/candidate diagnostic pair used the unchanged 400 ms normalized
budget, with 11 fresh-process samples per check:

| Check | Bare Node ms | Empty raw ms | Empty normalized ms | Sage raw ms | Sage normalized ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Candidate initial | 30.1 | 187.5 | 187.1 | 414.2 | 413.4 |
| Unchanged baseline | 30.4 | 183.9 | 181.5 | 412.4 | 407.2 |
| Candidate diagnostic repeat | 29.5 | 195.1 | 195.1 | 420.5 | 420.5 |

All three exceeded the 400 ms Sage threshold; none exceeded the 1,500 ms raw
catastrophic ceiling. A concurrent local source-map build and other local
checks mean this is not isolated performance evidence. The baseline failure
does not clear the candidate's failed gate. No retries-to-pass or budget changes
were made. An unchanged-budget current-head qualifying gate, or an actual
size/startup correction, is required before treating the candidate as ready.

The functionally validated change remains draft pending startup qualification.
`parallel:check` reports
the pre-existing ambiguity among 406 inherited contracts; this bounded
delegated subtask has not created a shared contract or a second worktree.

No four-platform, full integration-suite, release, or performance qualification
is claimed. Next steps are review of the failed startup gate and an independent
main-based PR with unchanged-budget qualification. Descriptor dispatch,
empty-class arity, and further emitted-size reduction remain separate work.
