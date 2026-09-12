# Type-level callable resolution

Branch/worktree: `python-callable-type-slots`, independently based on main
`c4c126d09`. No compound-emitter or resolved-attribute changes are stacked.

`ρσ_resolve_callable` retains its immediate host-function return, preserving
ordinary functions, classes, native callables, and function-shaped callable
adapters. For other values it now calls the existing canonical
`ρσ_get_type_slot(value, "__call__")` instead of ordinary attribute lookup.
Implicit calls therefore ignore instance shadows and `__getattr__`, honor live
type-level descriptors, and bind classmethods to the canonical actual type.
Missing-slot errors remain unchanged; descriptor exceptions propagate, and
present noncallable slots fail at invocation. No new helper is introduced.

The existing name-call emitter resolves before evaluating arguments. That
ordering gap remains unchanged and is not claimed fixed here. The separate
compound-emitter PR #238 defers resolution until after positional arguments;
combining its committed compiler with this diagnostic runtime passed a
standalone probe in both Python/Sage modes, including instance-shadow rejection
and argument-before-descriptor ordering. This combination was diagnostic only
and did not modify the committed compound worktree.

The focused ordinary CPython fixture covers inherited raw instances, explicit
instance attribute access versus implicit call, name/star/keyword/property
targets, saved methods, live base mutation, staticmethod/classmethod/custom
descriptors, canonical ownership despite misleading instance fields, descriptor
exceptions, `None` slots, instance-only call attributes, `__getattr__`, and
existing function-shaped adapters. Diagnostic runtime artifacts were rebuilt
and runtime caches refreshed so workers executed the candidate; no diagnostic
build receipt was claimed. All 25 focused tests passed, including canonical
instance ownership, metaclass dispatch, callable-slot mutation, live defaults,
and full standalone canonical-type execution. Merge/source-budget preflight
passed on main without requiring another branch.

Dependencies/artifacts were copied as seeds without hardlinks. Only the three
required grammar submodules were initialized at their pinned gitlinks.
`parallel:check` retains the existing 406-contract ambiguity.

## Final local qualification

The frozen `build:check` passed in 10m 24s. A subsequently launched
`test:changed` unexpectedly selected a forced build; its artifact deletion
invalidated a concurrent portable run with an `ENOENT` for
`dist/compiler/compiler.js`. This was an orchestration error, not a candidate
test failure. The original log is preserved at
`/home/user/python-callable-type-slots-portable.log`. The orchestration was
suspended to prevent further tests while its child rebuild finished, then
terminated. No source was changed during either build.

The final rebuild passed in 10m 47s, with receipt
`2026-09-12T07:48:45.700Z` and artifact-input SHA-256
`b5411972a97d6206a780feb490fe6e01ca05da07db4a119000489187ef3b3757`.
Against those stable artifacts, direct focused tests passed 33/33, portable
tests passed all 206 files in 2m 16s, strict checks passed 387 modules with zero
errors, formatting/docstrings passed 848 files, generated docs passed, and
merge/source-budget checks passed (core runtime 902964/903000 bytes).

The committed PR #238 compiler (`7f6fe11f69695b0ccc79da25e6270d8b8179e2e5`)
and final runtime also passed the full new
fixture plus compound inherited-instance-shadow and argument-before-descriptor
probes in separate Python/Sage Node processes, with empty stderr. This is
read-only standalone integration evidence, not a merged-build receipt. Early
exploratory harness runs omitted the runtime-require prelude or reused one
global process across modes; those invalid harness results are excluded.
The compound PR must remain draft until this prerequisite is integrated and
qualified together. No full third-party-package or browser qualification, broader
callability closure, or performance closure is claimed.

The final baselib artifact SHA-256 is
`6a42c2eda35ae49b5647136bff316faefaff1158aa698e925768dae00ab1b8ac`.
The read-only receipt inspector reported current artifact inputs and required
outputs after this documentation update; no additional build was invoked.
