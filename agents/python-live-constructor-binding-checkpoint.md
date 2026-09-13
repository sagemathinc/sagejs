# Live constructor binding checkpoint

This slice follows the selected Tomli milestone in PR #182. It fixes ordinary
compiled Python classes whose initializer is assigned or replaced at runtime,
including existing single-inheritance subclasses and callable classes. The
pinned attrs 25.4.0 workflow exposed the missing explicit receiver.

## Binding contract

Definition-time class signature copies must not bind a construction call before
allocation. A private prototype registry identifies participating compiled
classes; their original keyword packet reaches the constructor unchanged.
Allocation and initialization bind separate copies of that packet against the
actual functions. Caller dictionaries remain unchanged, and a foreign allocation
result returns before initializer validation. Synthetic inherited initializers
resolve against the current MRO after allocation, including base replacement.

Ordinary positional initializers retain direct receiver-style invocation.
Assigned unbound functions receive explicit `self`; non-None initializer returns
remain errors. The callable-instance allocation lifecycle is unchanged.

## Initial checks and cost

The first complete build passed in 10m 15s. All 24 focused constructor,
exception-initializer and runtime hot-path tests passed; constructor fixtures
run in Python and Sage modes and also pass CPython 3.14.4. The isolated pinned
attrs workflow passed with source/artifact checks. Strict Python passed for
381 modules. These are initial checks, not final architecture, browser or
four-platform qualification.

Core source grew from 889883 to 894470 bytes (+4587, about 0.5%). The explicit
core ceiling adjustment is 890000 to 895000 bytes, leaving 530 bytes of room;
it funds generic binding semantics, not test payloads or a package-specific
workaround. Compiler output grew from 4103736 to 4120698 bytes (+16962), within
its unchanged ceiling. Final startup and architecture checks remain required.

Final local qualification subsequently passed a second complete build (10m 18s),
all 77 focused regressions, architecture checks, and routine validation including
startup (1m 32s). The first routine run correctly rejected the modular source
freeze's old package-graph hash; regeneration changed only that budget-file hash
and the bundle digest, not mathematical sources or required checks.

The fresh broader inventory remains explicitly nonqualified: 8/11 pinned package
workflows pass (attrs restored), with all seven selected Tomli upstream error
tests passing. Pyparsing still lacks class annotations, idna emits the host
punycode deprecation warning, and mpmath times out. All 28 upstream-program
statuses match the previous inventory: 13 pass and 15 required failures remain.
No browser or four-platform qualification is claimed here.

A local diagnostic ran 10000 constructions per sample, three warmups and seven
samples, checking the resulting sum each time. Median times before/after were
about 55/54 ms with an explicit initializer and 90/54 ms without one. This is
provisional development-host evidence, not a confirmed cross-runtime speedup or
cliff closure. Removing synthetic keyword forwarding can offset live MRO lookup;
retain the direct ordinary initializer path when extending this work.

## Remaining boundaries

This does not qualify arbitrary initializer descriptors, custom metaclass call
protocols, dynamic `type()` classes, native-storage constructors, mutation of
statically selected allocators, or every multiple-inheritance mutation. In
particular, a compiler-copied non-synthetic initializer can still conceal later
base mutation. Class signature introspection can also expose old metadata;
invocation no longer trusting those copies is not an introspection fix.

Keep these open issues visible. No required upstream failure or performance
cliff is waived by this milestone, and the overall compiler/runtime plan remains
unfinished.
