# Field-neutral class-and-unit correspondence envelope

`class_unit_correspondence_result.cjs` is the first narrow result-composer cut.
It is a versioned, data-only boundary; it does not perform class-group or unit
computation and does not promote the result to Sage.js's public certified
class-and-unit API.

The payload authenticates:

- a field identity, degree, and defining polynomial without a cubic-specific
  shape;
- normalized class-group invariants and the named presentation owner;
- unit rank, torsion, regulator evidence, and either `exact_units` or the
  faithful PARI flag-zero outcomes `not_given(PRECI)` and
  `not_given(LARGE)`;
- every owner's logical length, physical capacity, role, encoding, and complete
  capacity contents;
- pinned PARI 2.17.4 source identity and explicitly *assumed* upstream claims;
- the honesty outcome; and
- the distinct terminal facts `correspondence_complete: true` and
  `public_complete: false`.

The canonical envelope hash is necessary but intentionally insufficient.
Verification also requires a branded authority supplied out of band. Its
mathematical digest and synchronous replay callback are not read from the
envelope. The replay must authenticate the exact payload hash, field identity,
and terminal tier. Thus changing a value and recomputing both JSON hashes does
not repair the mathematical replay. `ClassUnitCorrespondencePublisher` verifies
a detached candidate completely before its first atomic publication and rejects
a later distinct candidate without changing the current result.

## H1 adapter status

There is deliberately no JavaScript adapter for the existing H1 terminal
snapshot yet. The mathematical replay that can authorize that snapshot is
`cold_replay_h1_terminal_snapshot` in `h1_terminal_owner_snapshot.py`. It is a
Python in-process function over `ImmutableH1TerminalSnapshot` and
`H1TerminalSnapshotAuthority`; the repository does not yet expose a stable,
data-only replay receipt or a trusted cross-runtime callback identity.

Spawning Python from this envelope, reading the old resident fixture, or
accepting an arbitrary JavaScript callback and calling it “the H1 replay” would
all self-grant authority. The correct adapter cut is therefore blocked on one
of these explicit bridges:

1. a Python composer that invokes the existing cold replay and emits this
   envelope plus a separately transported replay receipt; or
2. a source-transparent JavaScript/native port of that same mathematical replay
   with a pinned provenance identity.

Until then, this module supplies the field-neutral contract into which a
genuinely replayed H1 result can later be mapped, but makes no field-3 same-run
completion claim.
