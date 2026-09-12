# Annotation dictionary oracle checkpoint

This is a tests-and-proposal checkpoint, not an implementation or compatibility
qualification. It does not modify the frozen prepared-call compiler or introduce
a runtime dependency. Source base: `02a683d213072c3129da1f71e2aa47de447cfc4a`.

## Executed evidence

`node --test test/python-annotation-dictionary-oracle.cjs` passes the two
CPython 3.14.4 fixture oracles and explicitly skips candidate checks unless
`SAGEJS_ANNOTATION_ARTIFACT` names a private artifact copy. Skips are not passes.
An artifact argument must never name a concurrently building or immutable
evidence worktree: module loading may create caches.

The tested private copy came from clean frozen
`419a10fb1f34c6ade3fa41061fd6143bfe51f875`, not this branch's source.
With that copy supplied, the raw baselib emission preservation check passes,
and all four public runtime fixture cases fail at the missing `__proto__` key
(Python/Sage, future/explicit evaluated). These are retained failures, not
accepted incompatibilities. Root's independent minimized method probe also
finds the annotated first parameter missing. The combined fixture retains that
assertion, but the earlier key failure prevents reaching it on this baseline.
No full build was authorized or completed.

After the oracle runs, an accidental `pnpm docs:check` wrapper invoked the
new main `build:check` prerequisite: it reported changed inputs, completed
TypeScript and vendor stages, then began self-hosted compiler convergence.
A queued receipt invocation repeated the same wrapper. Both exact owned
process trees were terminated; no unrelated processes were stopped. The local
copied `dist` is contaminated and must not be reused as evidence. The original
frozen419a worktree is untouched. A subsequent direct documentation script
failed with `generated baselib facade inventory is unavailable`; documentation
generation validation therefore remains incomplete. No wrapper/build retry.
Scope, merge inventory, Python formatting, JavaScript syntax and CPython-only
checks are independent of this failed copied-artifact validation.

Initial harness development briefly put a version assertion before a future
import (a harness SyntaxError, corrected by separately executing the fixture).
The first raw emission expectation incorrectly assumed resolved type names
were bare identifiers; constant annotations now isolate the metadata boundary.
Neither harness failure is evidence about product semantics.

## Contracts kept separate

- Future annotations store source strings without calling annotation
  expressions. Preserve argument order, `__proto__`, `constructor`,
  positional-only, starargs, keyword-only, kwargs and return entries.
- CPython 3.14 default annotations are deferred: no definition-time side effects;
  first annotation access evaluates once in order.
- Sage's explicit `from __python__ import annotations` is a separate legacy
  eager-evaluation mode. The same value/order oracle deliberately changes the
  definition-time expectation for this mode. It does not establish Python 3.14
  default compatibility.
- Every public function has its own mutable dictionary, even without entries.
  Repeated access is stable; bound and unbound methods share one dictionary;
  annotated `self` remains metadata despite receiver stripping for calls.
- Baselib compilation retains raw host metadata, not Python dictionaries. The
  executable emission oracle selects all four existing baselib boundary flags
  and checks exact annotated and empty initializer text in future and evaluated
  modes. This raw metadata representation must not silently migrate.

## Minimum proposed change for the compiler owner

Keep the existing baselib branch. For public annotation dictionaries, replace
the intermediate host object and generic `ρσ_dict({...})` call with the existing
`ρσ_dict_literal([key, value, ...])` primitive used by Python dictionary literals.
Emit key/value pairs directly in source order, once each. Do not route this
through a general dictionary constructor or build pair tuples. Empty public
metadata should use a fresh exact dictionary initializer; never share an empty
singleton. Do not change argument-binding receiver stripping: remove stripping
only from annotation enumeration where Python requires the first parameter.

Factor annotation enumeration only if doing so preserves the baselib raw
metadata and `__annotations_text__` consumers. The raw object's own
`__proto__` hazard also needs a deliberate computed-key representation review;
do not claim that fixing public dictionaries automatically fixes raw metadata.
The current preservation oracle intentionally uses non-special raw keys.

Before implementation qualification, add exact emitted public initializer
checks for both annotation modes and empty metadata: exactly one direct
`ρσ_dict_literal([...])` initializer, ordered flat pairs, no generic constructor,
no wrapper/IIFE, no shared cache. Include negative emitted-code mutants.
Run the method assertion independently so an earlier special-key failure
cannot mask it. Expand eager side-effect checks to raising expressions and
fresh annotated function factories. Keep CPython 3.14 deferred mode separate
from this eager-mode optimization; implementing deferred evaluation is not
authorized by this proposal.

## Cost motivation and limits

PR265's controlled evidence in PR266 records about 3.29–3.37x first-exposure
time versus an explicitly guard-disabled diagnostic baseline. A separate worker
CPU profile attributes 794 of 1279 inclusive samples under guard installation
to generic dictionary construction; native adapters account for 150. Six typed
nested functions per exposed namespace each construct annotation metadata.
These are CPU samples, not allocation-byte measurements or proven GC causes.
Flat-pair lowering is a bounded candidate explanation, not a measured speedup.
After a separately reviewed compiler change, repeat exact-artifact semantic
checks and controlled first-exposure/allocation/write comparisons. Preserve the
original guard costs and all 84 raw controlled timing samples.
