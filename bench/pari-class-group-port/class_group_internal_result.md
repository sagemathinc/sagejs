# Phase-5 immutable internal result and cold replay

This experiment adds a publication boundary for the faithful PARI 2.17.4
class-group port. It is intentionally narrower than the final Phase-5 result:
the current prepared candidate can be published now, while Smith transforms,
generator evidence, and unit evidence can be attached as their implementation
lanes finish.

## Contract

`class_group_internal_result.py` defines schema
`sagejs.pari-class-group/internal-result-v1`. All exact integers are canonical
decimal strings, so JavaScript number precision is never part of the format.
The source record pins PARI 2.17.4, its archive, and `buch2.c` by SHA-256.

`snapshot_prepared_candidate` consumes the existing prepared-state mapping and a
`PreparedCandidateLayout`. It copies only the declared logical prefixes of the
relation, HNF, transformed-log, invariant, regulator, and state owners, while
retaining physical owner lengths as replay evidence. It accepts no live owner in
the published result. Column-major native matrices are normalized to explicit
row-major schema matrices at this one boundary.

Optional evidence currently has three exact replay levels:

- transforms prove both inclusions between the retained relation lattice and the
  accepted HNF, require that exact HNF as the Smith presentation, replay
  `U * W * V = D`, replay both inverse identities, and check PARI's decreasing
  Smith divisibility convention;
- generators replay exact order relations in the presented lattice, require one
  primitive canonical generator for every nontrivial Smith factor, and prove
  that the complete set spans the quotient; retained ideal HNFs and
  principal-generator coordinates remain authenticated data awaiting the
  independent ideal-arithmetic replay lane;
- units replay norms from factored exponents and the exact determinant of a
  scaled logarithm-lattice minor selected from the accepted transformed-log
  owner. Their rank and regulator source record must match the candidate, and a
  bounded torsion record is retained. The factors still await independent
  number-field multiplication, principality, torsion-order, and rigorous
  regulator-enclosure replay.

`schema_components_present` says only that all three optional v1 objects are
present. It is deliberately not named “complete.” Both `phase5_complete` and
`public_complete` are unconditionally `false`, and the terminal record lists the
still-unverified ideal arithmetic, exact unit, factor-base, `buchall_end`, and
regulator requirements. This object cannot be confused with a completed Phase-5
result or certified `ClassUnitComputation`.

## Transactional publication

`AtomicResultPublisher.publish` canonicalizes, deep-copies, and validates the
entire draft before acquiring its publication lock. Only the final immutable
byte object is assigned. A failed validation exposes nothing, equal terminal
repeats return the same object, and a different second result raises
`PublicationConflict` without changing the first result.

`cold_replay` starts from detached bytes. It rejects duplicate JSON keys,
noncanonical exact integers, wrong source/field/assumption authority, changed
payload hashes, malformed logical lengths, inconsistent terminal status, and
failed exact identities. A caller may additionally pin the complete publication
SHA-256 in `ReplayAuthority`; the same pin is enforced before publication as
well as during cold replay. Replay is capped at 64 MiB, 4096 decimal digits per
integer, 4096 in either rectangular dimension, one million matrix cells, and 32
million scalar multiply terms. Dense square Smith arithmetic has a separate 256
dimension cap; a regression confirms that the authentic 303-relation corridor
is not accidentally rejected by that square bound.

## Focused check

Run:

```bash
node bench/pari-class-group-port/check_class_group_internal_result.cjs
```

The check builds a prepared candidate through the same owner-shaped mapping used
by the resident driver, proves candidate-only publication remains explicitly
incomplete, publishes full synthetic transformation/generator/unit evidence,
tests concurrent idempotent publication, and verifies cold replay. It mutates 55
individual currently represented fields plus eight recomputed-transport attacks
and one pinned retained-ideal attack. It also freezes the independent review's
coordinated counterexample: unrelated relations, HNF, presentation, empty
generators, and rank-zero units cannot publish as a coherent v1 result.
Every mutation fails closed. Invalid prepublication input leaves the publisher
empty, and conflicting terminal input leaves the original result unchanged.

This check is a contract fixture, not evidence that real Phase-5 generators or
units have been implemented. Those lanes must feed their authentic exact state
into this boundary and extend independent ideal/unit replay before any stronger
completion label is considered.
