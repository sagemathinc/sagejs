# Prepared number-field authentication boundary

Status: exact W0 authentication for every frozen development export; not a
class-group result and not qualification evidence.

The prepared H1 adapter originally authenticated only one totally real cubic.
That was adequate to reject an answer-bearing replacement of its `nfinit`
owners, but it could not admit the mixed quartics, complex cubics, or quintics
in the frozen panel. The v2 authenticator now takes either the existing resident
input or the typed `prepared` event emitted by
`export_pari_development_panel.cjs`. It never receives a class number, relation,
unit, regulator, expected authority digest, or reference timing.

## Exact generic checks

For degree `n` in the explicit W0 corridor `3 <= n <= 5`, authentication checks:

- monicity, the exact resultant discriminant, exact Sturm real-root count,
  signature parity and discriminant sign;
- irreducibility over `Q`, certified by an irreducible reduction modulo a
  field-independent prime at most 257;
- roots of unity `{+1,-1}` for the admitted fields with a real embedding;
- the `n` by `n` common-denominator integral basis, its two-sided inverse,
  degree metadata, field discriminant and polynomial-to-field index;
- every one of the `n^3` multiplication constants by exact multiplication in
  `Q[x]/(f)` and exact conversion through the supplied basis inverse;
- all `n^2` archimedean components, including real homomorphisms and the coupled
  real/imaginary multiplication identities for complex embeddings;
- PARI's distinct representations of a complex embedding: `nf_get_M` stores
  `(Re, Im)`, whereas `nf_get_G` stores `(Re+Im, Re-Im)`. The verifier checks
  this realification within the declared dyadic precision instead of falsely
  requiring the buffers to be equal;
- `nf_get_roundG` by exact dyadic nearest-integer conversion; and
- exhaustive runtime and analytic prime tables plus PARI 2.17.4's cumulative
  `prodprimes()` table, reconstructed from the declared fixed runtime limits.

Every loop bound comes from the authenticated degree or a fixed public runtime
policy. The authority digest is derived from the live preparation. No class or
unit output affects dimensions, precision, allocation, acceptance, or the
digest.

## Frozen development result

The exporter captured exactly the 16 tuning fields under
`/scratch/sagejs-pari-development-panel-a998`. The authentication command was:

```bash
node bench/pari-class-group-port/check_prepared_nf_authentication.cjs \
  /scratch/sagejs-pari-development-panel-a998
```

All 16 passed:

| Degree/signature | Count | Notable exact indices |
| --- | ---: | --- |
| cubic `(3,0)` | 5 | `1`, `3` |
| cubic `(1,1)` | 3 | `154`, `364`, `254541` |
| quartic `(2,1)` | 5 | `1`, `37` |
| quintic `(1,2)`, `(3,1)`, `(5,0)` | 3 | `8`, `846`, `131` |

One quartic arrived at driver precision 256; the other 15 arrived at 192. Both
are authenticated supported limb precisions, not inferred success values. The
checker also rejected 42 adversarial mutations across representative cubic,
quartic and quintic exports: field identity, signature, discriminant, index,
basis, inverse, degree metadata, tensor, both embedding representations,
rounded embedding, roots-of-unity generator, prime table and prime-product
table. The original resident cubic path retains its independent 17-mutation
check and typed-export round trip.

The 608 MB scratch payloads are untracked diagnostic exports. Their compact
manifest (SHA-256
`abe10f55aa44fbb47560cd23cf8b708268d838720d38b0fc98debbc1b763ef46`)
owns field identities and payload hashes. The verifier checks
`diagnosticOnly=true`, `qualificationExecutionEnabled=false`, and
`reserveOpened=false`; none of the eight frozen reserves were opened.

## Explicit unsupported cases

This W0 boundary deliberately rejects:

- degree below 3 or above 5;
- a field with no real embedding (its roots-of-unity proof needs a different
  exact certificate);
- a valid irreducible polynomial for which no irreducible reduction occurs by
  prime 257;
- precision outside 64--4096 bits or not divisible by 64; and
- runtime prime/factor limits other than the frozen PARI 2.17.4 policy.

Those are visible unsupported outcomes, not claims that such fields are
invalid. Extending them requires a new exact certificate or reviewed policy;
silently trusting an exporter is not permitted.
