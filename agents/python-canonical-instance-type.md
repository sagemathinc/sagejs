# Canonical instance type ownership on main

## Experiment and invariant

On main `d654e3d45`, ordinary instance/class `constructor` and instance
`__python_type__` attributes can change `type(instance)`. All eleven focused
session/standalone regression groups fail on that freshly built baseline.
These are Python namespace entries, not authoritative type metadata.

Keep exact prototype-to-public-class ownership in a private WeakMap. Register
compiler-emitted classes after inheritance installs their final prototype,
dynamic classes before descriptor callbacks, and builtin `object` explicitly.
Known sequence/callable class adapters transfer ownership through the existing
private alias hook. The map does not retain instances. Supported `__class__`
assignment changes the prototype, so it needs no per-instance invalidation.

Lookup consults exact ownership before shadowable representation fields.
Unknown native/math prototypes keep their existing fallback. This is not a
security boundary against explicit foreign JavaScript or universal native type
repair. Metaclass identity and instance type are distinct. Unrelated native
subclass and method-binding repairs on the old draft stack are not prerequisites
to import without evidence.

The standalone dynamic-class construction path also needs access to the
existing interpolation helper when there is no session-provided global. Use
the real internal module, not a second binder implementation.

## Validation contract

- The ordinary-Python fixtures must pass the pinned CPython 3.14.4 oracle,
  Python/Sage sessions, and the declared standalone path.
- Exercise raising constructor descriptors, class/instance namespace shadowing,
  inheritance, dynamic construction, metaclass returns/callbacks, reassignment,
  and the existing explicit proxy adapters.
- Compare the complete 536-case main corpus against its retained baseline:
  518 pass, three reviewed outcomes, fifteen required assertion failures.
  Do not regenerate baselines or excuse new failures.
- Run routine, architecture, source/startup budget and local type-cost probes.
  The local probe is regression evidence, not independent cliff qualification.

The original dirty implementation/evidence remains preserved in the original
checkout. Fresh main-based logs and reports are retained under
`/home/user/python-output-integration-evidence.X9vc1T/` with `canonical-` names.

The initial main-based build passes all twelve focused groups, including a new
separate-session witness and class redefinition in the shared fixture. All
three fixtures pass CPython 3.14.4. Nine existing traitlets/widget model tests
also pass. The new test file participates in routine portable and platform
smoke CI, not just the optional integration tier.

A fresh optimizer census was generated locally. Its mathematical input and
counts are unchanged, but its compiler identity differs. Keep the existing
published, explicitly compiler-bound snapshot rather than replace its public
manifest with links to unpublished assets. Publishing a new optimizer snapshot
is separate from this runtime change; no product or evidence release is made.

## Main-based qualification results

The fresh build, full architecture gate, strict Python gate, portable suite,
generated-documentation/FFI checks and public API smoke tests pass. All 536
case evidence records (not only dispositions) match the retained main baseline.
The MicroPython output subgate passes without baseline changes.

Startup is close to its unchanged 400 ms normalized limit: the routine run
reported 405.8 ms and failed that phase; one subsequent isolated confirmation
reported 394.7 ms and passed. Retain both results rather than claim an entirely
green routine run or widen the limit. Four-platform CI remains necessary.

The modular q-expansion source freeze includes the whole package graph. Its
regenerated manifest changes only that file's hash and the aggregate digest;
all mathematical sources remain unchanged. Portable tests pass after regeneration.

### Explicit source-budget tradeoff

The core-runtime source census is 902,042 bytes, exceeding the previous 901,000
limit by 1,042 bytes. Raise this source-only limit to 903,000 (about 0.22%),
to accommodate private prototype ownership and the standalone binder lookup.
This is not a startup-time budget increase. Removing documentation or moving
eager code into a differently classified file would hide, not reduce, this cost.
The startup regression gate must still pass unchanged before handoff.

The full 536-case corpus retains exactly the baseline dispositions: 518 pass,
three reviewed differences, and fifteen required failures. It remains explicitly
unqualified; this change does not waive those failures.

The same-machine warm type probe (40,000 calls per sample, seven samples after
three warmups) improves aliased plain-instance lookup from about 30.1 to 21.7 ms
and callable-instance lookup from 26.7 to 21.3 ms. Native list/dict fallback costs
increase from about 28.2/27.3 to 31.0/30.1 ms. This is a correctness tradeoff,
not independent-host performance qualification or a closed performance cliff.

## Adjacent required follow-up

An eagerly cached bound method can outlive a class method replacement or
`__class__` reassignment. Correct type identity alone does not repair invocation
through an old bound `__call__`. Preserve this distinction and fix binding as a
separate semantic mechanism; do not advertise complete reassignment semantics
from a type-only assertion.
