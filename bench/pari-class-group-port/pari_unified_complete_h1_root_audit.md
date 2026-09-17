# Unified prepared-`h = 1` internal completion

## Boundary

`pari_unified_complete_h1_root.py` is one source-transparent native entry that
composes five live computations without host serialization or expected-answer
inputs:

1. `pari_unified_live_h1_root` constructs and accepts the 73-relation resident
   class candidate;
2. `pari_live_h1_class_witness_suffix` proves the connected `8 x 8`
   presentation has trivial Smith quotient;
3. `pari_live_retrying_h1_suffix` derives unit relations from the live HNF
   transforms, retries exact embeddings/getfu to caller-bounded precision,
   replays its units against the exact relation products, and computes the
   regulator;
4. `pari_exact_real_cubic_torsion` proves that the roots of unity are
   `{+1, -1}`; and
5. the root copies a fixed 811-cell numeric bundle and commits its terminal
   publication state last.

The resource cap is policy, not mathematical answer data. Relation counts,
ranks, generators, HNF transforms, compact provenance, and factor transforms
all come directly from live owners below the one native call.

## Publication claim

For the prepared equal-bound sentinel, the root sets `published = 1` only
after all component producers succeed. It deliberately leaves both
`correspondence_complete = 0` and `public_complete = 0`. The 811-cell bundle is
a useful atomic projection, but it is not the complete replay authority: the
factor-base state, exact relation witnesses, logs, precision evidence, RNG,
and explicit assumptions remain in the borrowed live owners. A host-side cold
verifier must capture and authenticate those owners before a higher layer may
promote correspondence completion.

The native producer also rejects re-entry when the caller supplies an already
published `final_state`. Caller-mutable status cells are not accepted as proof
of a previous result; idempotent reuse requires a separately sealed replay
receipt.

## Answer-shaped inputs

The inherited resident prefix accepts analytic discriminant and roots-of-unity
scalars. Before calling it, this root recomputes the cubic discriminant from
`prep_polynomial`, requires positive discriminant, and requires the real-cubic
roots-of-unity value two. Precision authority, exact units, regulator, and
final result owners are output-only.

## Transactionality and mutations

The focused checker first sets the retry ceiling to 192 bits. The precision
suffix reports cap exhaustion and every final mathematical owner remains at
its sentinel value. It then mutates a live principal-relation generator after
the prefix/class boundary; exact quotient or unit replay rejects the mutation,
again without final publication. Restoring the generator and setting the cap
to 4096 permits the source-policy sequence to succeed at 2304 bits.

The checker additionally proves that a caller cannot obtain success by
re-entering with published terminal status but without cold replay. The exact
torsion leaf is separately differential-tested under ordinary
CPython and generated native code, including reducible and non-real mutation
cases. The generated core contains no Node-API, V8, JavaScript, or Python
callback.

## Focused receipt

On Linux x86-64 at integration base `82470f3ea`, the command

```text
node bench/pari-class-group-port/check_pari_unified_complete_h1_root.cjs \
  /tmp/sagejs-prepared-class-inputs-MRFSOe/inputs.json \
  /tmp/sagejs-analytic-invhr-d88QqB/fixtures.json \
  /tmp/sagejs-initial-kummer-catalog-Kc48PL/fixtures.json
```

passed after the honesty correction with native cache key
`2c2dd0b41c2364973be8460d0d1fcc331f7040843ae9f4f3ea39abffa2495ebe`.
The terminal transcript records five precision attempts and success at 2304
bits; the published unit norms are both `-1` and torsion order is two.
