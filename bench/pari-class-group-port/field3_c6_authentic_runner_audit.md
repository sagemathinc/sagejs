# Field-3 authentic C6 native runner

## Boundary closed

This lane closes the previously missing transport boundary between the
qualified source-transparent Python kernels and the immutable C6 protocol. It
does **not** run the expensive 153,088-bit attempt.

`field3_c6_authentic_runner.cjs` executes exactly two native calls, without a
retry loop:

1. `pari_field3_high_precision_embeddings.gmp` rebuilds the authentic roots
   and embedding from the exact polynomial, integral basis, denominator, and
   multiplication tensor.
2. `pari_field3_high_precision_getfu.gmp` consumes the accepted C5 generation
   and the newly published embedding owner and returns success, `LARGE`, or
   `PRECI`.

The JavaScript runner contains no mathematical replacement. It allocates the
typed ABI buffers, copies native results, records artifact hashes, and invokes
the existing independently replaying C6 coordinator. The algorithms remain
ordinary CPython-parseable Python with their JavaScript fallback.

## Embedding ownership

The new embedding coordinator authenticates mode-0444 inputs by explicit
SHA-256, rejects duplicate JSON keys, checks the exact hard-field identity and
native terminal state, and publishes a content-addressed mode-0444 owner by
write, `fsync`, rename, chmod, and directory `fsync`. It ignores any roots or
embedding carried by the exact prepared capsule: only polynomial, signature,
integral basis, denominator, and multiplication tensor enter the native call.
The published numerical arrays therefore come from the native Python graph,
not an answer fixture.

The runner records the prepared-owner, native-module, attempt, precision, and
run identities in the candidate. The final embedding owner binds the candidate
hash. Repeating publication is byte-idempotent; detached ancestry and mutated
identity fail before publication.

## Storage and terminal semantics

The authentic storage dimensions are derived from the same qualified
capacity policy:

- four 16,385-cell binary-splitting coefficient arrays with 128-bit cells;
- one 105-cell large-product stack;
- packed real, exponential, solve, unit, and log owners with explicit finite
  cell counts and bit capacities;
- the 301-by-2 raw transform and exact 64-cell multiplication tensor.

There is one C6 call. Success publishes all exact arrays only after the native
status and the existing coordinator's algebraic replay. `LARGE` and `PRECI`
publish empty unit/log/factor/Wraw arrays and are terminal; the runner neither
retries nor exposes scratch arrays.

## Factorback continuation

On success only, the runner also emits the immutable
`field3-c6-factorback-source-v1` owner required by
`field3_c6_factorback_verifier.py`. It binds the final C5 and C6 hashes, the
new embedding owner, and the terminal serialized relation owner. The runner
accepts only `field3-full-owner-authority-v1`: it checks the field/run identity,
288-by-301 shape, replay qualification, source-owner ancestry, canonical
`exactOwners` arrays, exact relation metadata ordering, and the three packed
serialization latches. The old resident `authority.owners` shape is rejected.
This entire preflight occurs before either native module is opened, so a raw,
detached, or malformed relation input cannot start the authentic attempt.

The serialized relation file SHA-256 is recorded in the C6 candidate; the C6
publication binds that candidate by `candidateSha256`. Factorback publication
then requires the same candidate and relation digests and records both in its
source ancestry. This gives the later unit owner a cryptographic path through
C6/factorback to the identical relation owner consumed by the live C7 branch,
without making either branch own the other or introducing an ancestry cycle.
Its payload contains all
301 principal generators, the 288-by-301 relation matrix, tensor, raw Wraw,
C5 prepared logs, real/imaginary embeddings, the retained packed `2*pi`, place
period multipliers, and the source rounding tolerance. No source owner is
published for a terminal non-success.

The present cold verifier deliberately limits its logarithm replay to 384
bits. The authentic source owner is therefore ready for the separately
reviewed precision extension; this lane does not quietly weaken that verifier.

## Focused evidence

```bash
node bench/pari-class-group-port/check_field3_c6_authentic_runner.cjs
```

The focused test uses fake native ABIs solely to exercise transport without an
authentic run. It proves one-call behavior, 16,385/105 storage, immutable and
idempotent embedding publication, prepared-answer non-use, ancestry mutation
rejection, strict terminal relation schema and serialized-integer ingestion,
replay-latch checking, native-module preflight ordering, relation/C6 candidate
joining, success-source construction, exact source dimensions, short-source,
and pi-authority rejection. It also runs the existing pristine-PARI
low-precision getfu differential, which covers CPython arithmetic, both
inverse choices, capacity failure, terminal atomicity, and coordinator replay.

The authentic command, after integration has produced both compiled modules
and an accepted C5 owner, is:

```bash
node bench/pari-class-group-port/field3_c6_authentic_runner.cjs \
  --attempt-id field3-c6-153088-generation-G \
  --prepared-owner /ABS/PREPARED.json \
  --prepared-sha256 PREPARED_SHA256 \
  --c5-owner /ABS/C5.json \
  --c5-sha256 C5_SHA256 \
  --relation-owner /ABS/FIELD3-FULL-OWNER-AUTHORITY.json \
  --relation-sha256 RELATION_SHA256 \
  --embedding-module /ABS/field3-high-precision-embeddings.node \
  --c6-module /ABS/field3-high-precision-getfu.node \
  --output-dir /scratch/sagejs-runtime/pari-class-group-e2e-20260917/field3-authority
```

The caller must run that command under the campaign's external 600-second,
4-GiB aggregate process-tree guard. A timeout or resource breach is failure,
not permission to publish partial state. The exact paths and hashes are
intentionally explicit; the runner performs no cache discovery and no build.

## Platform policy

The arithmetic remains portable same-source Python. This campaign runner is a
Linux qualification tool because the current durable evidence and process
guard are Linux-specific. Windows retains the ordinary dynamic fallback and
is not made dependent on this experimental publisher.
