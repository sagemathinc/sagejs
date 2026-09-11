# Detached class/unit component replay

`export_terminal_components(result)` and `replay_terminal_components(text)` in
`sagejs.number_fields.class_unit_replay` implement a bounded component checker,
not terminal completeness or a detached unit-coordinate map.

The exporter accepts recognized generic live results and emits versioned,
canonical JSON. The SHA-256 protects content integrity, not mathematical truth
or producer authenticity. Relation logs/provenance are deliberately omitted;
their exact row, principal witness and norm evidence are retained. Prime-ideal
process identity tokens are omitted, while exact field/order, lattice and
residue data remain bound.

Replay constructs a fresh number field and **recomputes** its certified maximal
order using the existing exact service, then compares the complete order
fingerprint. This is recomputation cost, not cheap certificate replay. Existing
prime decomposition, exact relation, HNF/SNF presentation, factored principal
ideal and roots-of-unity verifiers independently check the decoded components.
The presentation must describe the same ordered relation rows and factor-base
width. Factored unit membership uses cold ideal arithmetic, not expansion of
field-element powers or live admission receipts.

The returned report always has `component_only=true`, `complete=false`, and
pending `class_generation`, `analytic_index`, and `unit_lattice_completeness`.
Its source proof-status field is explicitly an **unverified provenance claim**.
Unit membership does not establish independence or a fundamental system;
relation quotient invariants are not certified class-group invariants. Empty
units or a rank-deficient presentation cannot imply completeness. No live
context, token, callback, computation, or map authority is returned. The live
analytic generation verifier is neither retained nor invoked.

## Fixed first-slice arithmetic policy

Before any field construction or component decoder, replay checks 4 MiB of
JSON, depth 32, 100,000 nodes, container/string bounds, canonical exact integer
and rational data, and rejects duplicate keys, booleans, nulls and floating
point numbers. Supported fields have degree 2–4 and monic defining coefficients
of at most 32 bits. Other rational coordinates have at most 512 bits.
The byte, depth and conservative structural-node checks run before JSON
allocation; decoded container and exact-node checks run before mathematical
construction. The structural count can reject a payload below the decoded
node limit, intentionally bounding parser work conservatively.

The adapter admits at most 32 factor-base primes (each at most 1,000), 128
relations, three unit membership witnesses, and 32 factors per witness. Ideal
exponents have absolute value at most 256 and an aggregate policy limit of
4,096, including relation rows. Presentation dimensions and 256-bit entries
are checked before decoding. Torsion replay currently supports only the
real-place and imaginary-quadratic classification certificates, with order
at most 12, universal exponent at most 120 and no search candidates.

These are fixed arithmetic preflight limits, not proved wall-clock, RSS, or
arithmetic-work guarantees. In particular maximal-order recomputation can be
costly. Process supervisors remain responsible for hard resource enforcement.
Unsupported authority and exceeded limits fail explicitly; payloads cannot
raise the verifier's policy. Invalid relation ideal equalities are rejected
before invoking the existing norm-factorization replay.

The dedicated tests use already exposed cubic/quartic examples, reject rehashed
mathematical mutations, and run the same JSON preflight under CPython. They do
not qualify detached completeness, M1 exit, or campaign performance.
