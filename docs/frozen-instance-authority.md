# Frozen instance namespace authority: scoped repair

The owned dictionary implementation introduced in PR #216 publishes its
WeakMap entry and clears tracked fields before installing the prototype bridge.
When host freezing or nonextensibility rejects that installation, subsequent
operations can therefore use a dictionary despite the failed transition.
Deleting tracked fields before checking their configurability can similarly
discard a prefix of the instance state. After successful exposure, changing
`__class__` edits the bridge instead of the frozen instance shell.

## First slice: atomic rejected transitions

Preflight first exposure against nonextensibility and every tracked own field
against nonconfigurability. Install the bridge only after this preflight and
before publishing namespace authority or clearing tracked fields. Reject
namespace replacement/deletion and bridge class changes on frozen instances.
Check native deletion success before discarding its tracking entry.

The focused oracle covers repeated failed first exposures, preserved attribute
reads and `dir`, late nonconfigurable fields, frozen exposed class changes,
namespace replacement/deletion, and ordinary successful identity/alias behavior
in both Python and Sage modes. These host freezing checks describe an internal
runtime contract, not CPython language semantics.

## Explicitly pending: full shallow storage freezing

This slice does not close retained dictionary alias mutation after host freeze.
Raw `runtime.object` remains JavaScript `Object`; do not globally patch it or
replace it with a facade. A follow-up needs storage-aware mutation checks across
assignment, deletion, update, clear, setdefault, pop, popitem, and in-place union,
including dictionaries shared by multiple instances and detached old aliases.
Freezing must remain shallow: referenced lists and engine graphs stay mutable.
First exposure of an already host-frozen object currently rejects; making it
readable requires a consistent storage/view design, not publishing a detached
mutable snapshot or pretending an absent bridge exists.

The preflight applies to ordinary registered instances. It is not a general
transaction mechanism for hostile host proxies whose traps mutate descriptors
between operations. Bridge creation for an ordinary instance creates host
objects and registers callbacks without invoking those callbacks.

Pre-build diagnostic evaluation used a private copy of the frozen PR #242
compiler/runtime artifacts. Injecting the baseline namespace functions from
`c4c126d09` rejected the fixture in both modes; injecting the candidate functions
passed it in both modes. The focused namespace suites also passed (four tests).
These mixed-artifact observations are not qualification of a candidate build.
The initial nonconfigurable-field test incorrectly passed a Python dictionary
as a host descriptor; replacing it with a host object corrected that oracle.
An initial whole-module injection also failed on a lexical runtime binding;
the differential diagnostic injects only the changed functions and their two
storage helpers. Final qualification must use a complete local build with
unchanged source, followed by the focused and normal compiler/runtime suites.

The first own build passed in 14m31s. A separate strict check found the missing
`Object.isExtensible` type declaration, now added to the runtime boundary stub.
Main was reconciled at `6c42dd093` before final qualification; the namespace
implementation was unchanged upstream. The initial parallel build receipt is
historical, not evidence for this reconciled candidate. The task metadata stays
active and frozen during the final direct build and read-only test campaign;
the PR records final results without invalidating the build by rewriting it.
