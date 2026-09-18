# Row-13 fresh prepared transaction audit

## Result

`row13_fresh_prepared_transaction.cjs` completes the row-13 transaction from
one normalized, authenticated prepared-number-field object. It invokes
`pari_row13_prepared_initial_root` through the reusable in-memory encoder in
`row13_prepared_initial_owner.cjs`, then passes that fresh owner directly to
`row13_terminal_transaction_host.cjs::runPreparedComplete`. Gate C, post-1006,
the class witness, rank-two unit result, C7 composition, and neutral
correspondence publication all execute in the same worker.

The focused capped run published the verified 5,700,777-byte neutral result
with SHA-256
`17ccbab46e27cae538d8958f4eb0a760fbbbfde112ea26b784dcc54057505b73`.
It reported relation state `[1006, 10110, 0, 0, 1006, 1006]`, ten collection
passes, class group `C2`, class number 2, and unit materialization
`not_given(LARGE)`.

## Input and publication boundary

The callable request has exactly two keys: `prepared` and `outputDirectory`.
The sole mathematical runtime input is the normalized 22-field prepared-NF
projection. The transaction authenticates it independently and pins the
reviewed row-13 authority digest. Extra prepared fields are rejected.

Callers cannot provide a prepared-initial owner, Gate-C owner, accepted owner,
post-1006 result, class owner, unit owner, C7 envelope, or any path to those
objects. Seven focused injection attempts were rejected before native work.
Eight prepared-data mutations were also rejected. Intermediate owners remain
in memory. Only the final neutral correspondence envelope and the branded
fresh-prepared receipt are written.

The receipt states:

```text
freshPreparedExecution = true
retainedRuntimeInputs   = false
frozenW0RuntimeInput    = false
```

The worker has no W0 path or W0 reader. The focused external checker opens W0
only after it has verified both immutable publications, then compares class
invariants, class number, and absent fundamental-unit materialization.

## Semantic root authority

The previous terminal host hashed the complete root, accidentally making
`execution.elapsedNs` and `execution.maxRssKiB` part of mathematical identity.
Those measurements necessarily change on a genuine fresh execution.

Versioned semantic authority
`sagejs.pari-class-group/row13-prepared-root-semantic-v1` removes exactly those
two telemetry fields before hashing. Their presence is all-or-none and their
types remain validated. Every mathematical field, source digest, generated
compiler-core digest, policy/capacity field, relation, RNG word, and handoff
value remains covered. The reviewed semantic digest is
`989aa45eb0792587c6fa8a92d6162c899878fbd61a7a6518b32efed2457ae46c`.

The fresh run proved that adding its actual elapsed/RSS telemetry leaves this
authority unchanged. Mutations to the polynomial, source provenance, and
initial dense relations were rejected by the terminal boundary. In
particular, the historical `Nrelid=4` remains semantic and unchanged; a stale
temporary owner with `Nrelid=6` is not admitted.

This is an intentional compatibility correction: root identity is now the
versioned semantic digest rather than the old whole-object digest. Consumers
that treated telemetry-bearing serialized roots as authority must use the
semantic authority. Final neutral correspondence bytes remain unchanged.

## Qualification limits

This run is correctness evidence, not a timing claim. Root and downstream
elapsed/RSS measurements are not published in the branded receipt. The worker
used a scratch-native cache, a 4 GiB address/RSS cap, a 600-second CPU/wall
cap, and a 3 GiB Node old-space limit. No reserve owner or answer-bearing
runtime input was accessed.
