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

## Completion claim

For the prepared equal-bound sentinel, the root sets internal
`correspondence_complete = published = 1` only after all component authorities
succeed. It deliberately keeps `public_complete = 0`: general saturation and
a stable public class/unit API are separate work.

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

The exact torsion leaf is separately differential-tested under ordinary
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

passed with native cache key
`c5d58f068391abe511c65da923daf9b71e72c540b30653a1064fbe70bdc43bf3`.
The terminal transcript records five precision attempts and success at 2304
bits; the published unit norms are both `-1` and torsion order is two.
