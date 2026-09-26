# Answer-free Rust public-result adapter

This qualification adapter consumes the existing canonical
`sagejs.rust-class-group.result-evidence/v1` envelope. It does not introduce a
second portable result format, and it returns the existing
`ClassUnitComputation` contract rather than a parallel public group type.

Portable JSON is never proof authority. The caller independently provides the
live field, readers for its current identity and polynomial, canonical prepared
input ID, digest of the artifact actually loaded, and requested proof mode.
The adapter itself imports and pins the canonical `ClassUnitComputation`,
`IdealClassGroup`, and `UnitGroupComputation` types; callers cannot substitute
lookalike result types.

Detached relation-lattice, compact-presentation, generator/map, and completion
payloads use existing result-evidence bindings. Their hashes are
domain-separated over schema, role, and payload. Every payload repeats the
common input, field, polynomial, artifact, presentation, and generator-map
identities. Completion binds the other three component hashes.

Producer data is deep-copied and recursively frozen. Each replay callback sees
a read-only snapshot and returns a role-specific sealed acceptance bound to the
same process-local identity. Producer evidence and live field identity are
revalidated after every callback and immediately around publication.

Public completion requires all four replays and a host builder. The exact live
`IdealClassGroup` must retain the replayed presentation, identical generator
ideal objects, identical arbitrary-ideal callback, and identical proof record.
Its proof context must retain the identical replayed relation lattice. The
exact `UnitGroupComputation` must retain completion evidence bound by identity
to the live field and replay its completion proof. Order, invariants, proof
status, and verification are checked again. Builders that ignore replayed
objects are rejected.

The entire canonical envelope is checked, including resource accounting,
implementation version, independent checks, exact map/unit records, and ideal
serialization. An upstream-assumed producer claim is accepted only with its
own detached, domain-separated correspondence component and replay; it remains
explicitly non-public.

Missing evidence returns an exact incomplete `ClassUnitComputation`. A producer
`publicly-complete` label is inert, and the adapter refuses to serialize it.
Candidate JSON may round-trip, but decode requires a fresh trusted boundary and
fresh replay.

Run the discovered suite with and without Python assertions:

```sh
python3 -m unittest discover \
  -s bench/pari-class-group-rust/qualification/public-result-contract \
  -p 'test_*.py'
python3 -O -m unittest discover \
  -s bench/pari-class-group-rust/qualification/public-result-contract \
  -p 'test_*.py'
```
