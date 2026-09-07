# Canonical live Python function defaults

This slice follows the compiler/runtime work through PR #186. Ordinary
Python/Sage functions use an
authoritative tuple-or-None `__defaults__` and dict-or-None `__kwdefaults__`.
Definition evaluates defaults once before publication; omitted arguments
consult the live slots. Fully supplied positional arguments retain direct
binding. Generator/coroutine binding happens at invocation rather than resume.

Bound/unbound adapters, introspection, dataclasses, nested function transport,
and the native fallback boundary must agree on these owners. A private named
function expression anchors defaults without changing Python name rebinding.
The internal bootstrap-only map representation remains explicitly marked;
it is not a second public function-default API.

The native wrapper forwards metadata to the dynamic source owner and dispatches
omitted/keyword calls through that source binder. Fully supplied calls retain
the compiled target. Deletion must forward too, including Python's existing
property-deleter protocol; immutable owner metadata cannot be deleted. The
fresh bound host target avoids inheriting immutable cached artifact slots.
This does not virtualize arbitrary host reflection or fix every pre-existing
function-metadata deletion rule.

## Cost review and required checks

Core-owned source grows 6,609 bytes, from 900,551 to 907,160. The explicit
source ceiling changes from 901,000 to 907,500 (340 bytes headroom). This pays
for tuple storage reads, live keyword dictionary reads, slot validation and
shared bound-method accessors across both bootstrap adapters. The larger
native adapter stays in the existing lazy native-integration package, below
its unchanged ceiling. No native dependency or startup ceiling is added.

The private live-namespace dictionary registry avoids a general type check on
each omitted keyword default. It does not cache default values or retain the
namespace after its dictionary becomes unreachable.

## Qualification checkpoint

On Linux x64 with Node 26.8.1 and pinned CPython 3.14.4:

- Full build passed in 9m 17s, with self-hosting convergence in two passes.
- 102 focused tests passed, including both Python/Sage modes, constructors,
  lazy annotations, introspection, and actual native addon/cache/fallback modes.
- Architecture passed. Routine passed in 1m 32s, including the unchanged
  seven-second startup gate and strict checks across 382 Python modules.
- A separate complete portable sweep passed 918 tests with three existing
  unavailable-Wasm-toolchain skips. The broader compiler suite passed all 21
  enabled fixtures, retaining its 28 historical exclusions.
- The adopted upstream suite improves from 13/28 to 17/28. Four required
  defaults cases now pass; no case newly fails. The mangled-keyword test now
  reaches missing `co_varnames` metadata. Eleven required failures remain.
- Package workflows remain 8/11, with seven selected Tomli upstream tests
  passing. Pyparsing, IDNA stderr, and mpmath cold-import timeout remain open.

Two emitted-code test helpers needed updating for delayed function publication.
The truthiness checks and exact optimized-operation counts remain enforced.
No four-platform, packaged-product, or real-browser qualification is claimed.

### Main integration

Merged `origin/main` at `ea2027439` after the initial defaults checkpoint.
Implementation files merged without conflicts; the three conflicting generated
evidence files were regenerated from the combined source, not selected from
either parent. The combined full build passed in 14m 41s; 123 focused tests,
architecture, routine validation (1m 35s), and all 21 enabled broader compiler
fixtures passed. The 28 historical compiler exclusions remain unchanged.
Fresh source-bound upstream results remain 17/28 with no status changes, and
package workflows remain 8/11 plus seven passing Tomli upstream tests. These
required upstream/package failures still prevent full-plan qualification.

### Declared undefined defaults

An expanded runtime-hotpath run then exposed a missing edge: `OrderedDict`
uses the explicit host-boundary value `runtime.undefined` as a default. The
binder assigned that legitimate default and mistakenly rejected its value as
missing. Positional defaults now test tuple presence; keyword defaults use a
fresh missing-key sentinel. A stored value is no longer confused with absence.

The corrected full build passed in 9m 23s. All 107 expanded focused tests pass,
including the complete runtime-hotpath file, native default adapters, and
tuple/dict-subclass storage witnesses. Architecture, routine and all 21 enabled
compiler fixtures pass. Fresh upstream/package outcomes remain 17/28 and 8/11
plus seven Tomli suite passes. The new regression belongs to the routine
portable/platform tier, rather than only the broader integration tier.

Separate reproducible follow-ups found by the expanded probes remain open:
replacing a callable instance's class `__call__` can expose a stale eager
method cache, and `Counter() == {}` returns false although CPython returns
true. Neither is hidden by a reviewed difference or claimed fixed here.

## Local performance evidence and open cliff

The `python-defaults-diagnostic-v1` suite uses equivalent ordinary Python work,
100,000 calls per case, three warmup passes, seven measured passes, and checked
results. Definitions and initial bound-method lookup are outside the timer.

The first rebuilt candidate spent about 208 ms on omitted keyword-only calls.
Replacing the live-namespace type check with the private registry reduced that
to 57.4 ms (8.61x CPython's 6.67 ms). Positional supplied/omitted and cached
bound-method cases remain roughly 51–54 ms. Supplied keyword-only calls still
take 478.6 ms versus CPython's 6.63 ms: a **72.19x sample-qualified critical
cliff**, not a waived failure or a completed performance objective. These are
local measurements, not independent confirmation on a quiet benchmark VM.

A separate small warmed mock diagnostic measured approximately 1.5 microseconds
of additional native-proxy routing cost per fully supplied call. It is not a
seven-sample native performance gate. `execution_mode` now reports dynamic
execution for supplied argument sets that require the source-default binder.

Remaining separate boundaries include complete bound `__func__` identity,
arbitrary initializer-replacement signature introspection, code-object creation,
and Pool target/initializer metadata transport. Do not claim those completed
from this migration alone.
