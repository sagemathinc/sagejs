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

## Browser-size follow-up (locally qualified, browser gate pending)

PR #226 head `b358df7d8` passed its current-head Linux startup gate, but the
Chromium artifact topology gate reported eager-core Brotli delta 9,704,679
against the unchanged 9,700,000 limit. That failure is retained.

The follow-up compacts the eight signature-field copies into ordered emitted
loops in the Python-only declared, synthetic-forwarding, and final-winning
paths. It does not change the legacy emitter, signature selection, null guards,
or predicate placement. Each source read still immediately precedes its target
write; annotation copies retain their separate names and positions. The loop
variable uses the compiler-reserved prefix and does not enter the Python class
namespace. A proxy test executes the actual emitted loops to verify field
order, getter/write interleaving, and null signatures; the CPython fixture also
checks preservation of a same-spelled user local.

The direct-emitter, CST-lowerer, and emitted-loop proxy checks used an in-memory
diagnostic compiler. The pre-build kernel checks in that 76-test run instead
loaded the existing compiler in separate workers; those passes are not
candidate execution qualification. The subsequent frozen-build checks below
did use the actual candidate artifacts. Paired direct emission used identical
options and Brotli quality 11:

| Program | Previous source | Loop source | Previous Brotli | Loop Brotli |
| --- | ---: | ---: | ---: | ---: |
| `pass` harness | 2,810 | 2,810 | 734 | 734 |
| Explicit `__init__(self, x=1)` | 9,978 | 9,616 | 2,156 | 2,157 |
| Empty class | 10,909 | 9,367 | 1,952 | 1,895 |
| Explicit base plus empty subclass | 18,111 | 16,207 | 2,704 | 2,602 |

The empty-class body excluding the fixed harness falls from 8,099 to 6,557
bytes. These per-program measurements do not qualify aggregate browser size.

The previously reported kernel class-creation timing comparisons are
**withdrawn**. Replacing the compiler export in the diagnostic parent process
did not replace the compiler loaded by kernel workers: both timing groups used
the existing baseline worker compiler. Their different timings therefore
provide no candidate comparison, loop-allocation regression check, speedup
evidence, or startup qualification. Future measurements must verify compiler
identity inside the process or worker that actually executes the workload.
The direct-emission/Brotli measurements and emitted-loop proxy checks above
are unaffected by this diagnostic harness error.

The frozen follow-up passed `pnpm build:check` in 11m 26s, with receipt completed
at `2026-09-12T06:05:39.607Z`. Its actual artifacts passed all 107 tests in the
same ten focused suites listed above, strict Python checking (387 modules,
zero errors), `merge:check`, and `docs:check`. Formatting is current for all
848 files. The documentation check reused the new build receipt and required
no generated documentation changes. Five optional native adapters remain
absent and production native-kernel publication was skipped.

`test:changed --list --base b358df7d8` selected merge checking, a build, and the
full integration suite. The scoped qualification used the receipt-aware full
build and focused tests instead of expanding into the full integration suite.
`parallel:check` still reports the existing 406-contract ambiguity.

The local aggregate browser gate was not run: this worktree lacks a verified
canonical numerical product. No unrelated numerical rebuild or stale artifact
borrowing was attempted. PR #226 remains draft pending its current-head
Chromium topology gate, whose CI supplies the authenticated prerequisites.
No aggregate compressed margin or performance qualification is claimed.
