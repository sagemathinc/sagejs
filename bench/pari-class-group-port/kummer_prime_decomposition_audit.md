# Connected one-prime Kummer decomposition

`pari_kummer_prime_decomposition` translates the equation-index-coprime branch
of PARI 2.17.4 `base2.c:primedec_aux`, followed by the sorting in
`idealprimedec_limit_f`. Copyright belongs to the PARI group;
GPL-2.0-or-later, without warranty.

The entry consumes only prepared nf arithmetic (defining polynomial, integral
basis conversion data and multiplication table), the actual equation index,
one prime, a residue-degree limit, and resident RNG state. It does **not**
consume factors, selected generators, antiuniformizers, or prime descriptors.

One isolated call performs:

1. Reduction and source-selected binary or odd-prime polynomial factorization.
2. Kummer descriptor construction in the original factor order.
3. Source residue-degree filtering: full factorization still occurs; the
   descriptor loop breaks at the first factor whose degree exceeds a positive
   limit. Zero means unlimited. Negative limits are rejected.
4. Source descriptor sorting by residue degree, then signed generator vector.
5. Gathering detached records `[p,e,f,inert,u...,tau...]` with stride
   `4+n+n*n`. Inert tau is explicitly `[1,0,...]`; inactive output records
   remain untouched.

Buffer reuse is lexical: the binary factor branch temporarily uses the future
sorting permutation and residue-degree owners, then copies its factors into
the common factor workspace before descriptor processing. It uses the future
polynomial-division workspace for binary factor scratch. No owner is reused
before its final read. The RNG is never reset by the computation.

All owners are disjoint caller-owned buffers. The API documents exact minimum
sizes. Shape, monicity, index divisibility and degree-limit checks precede
mutation. Later mathematical/representation failures can modify scratch and
RNG, but final records are not written until all descriptors and sorting
succeed. Resource failure during final scalar copying follows ordinary
scalar partial-publication semantics; this is not an allocation transaction.

## Qualification and boundaries

The checker obtains prepared nf metadata from the existing PARI nf collector,
but strips all factor/descriptor answers from the candidate arguments. A new
oracle invokes actual `idealprimedec_limit_f`, with separately seeded PARI
state, and compares complete sorted descriptors and the final 66-word RNG.
The predeclared panel is the four selected cubic/quartic fields at primes
2,3,5,7,37, excluding the two index-dividing field/prime pairs: 18 groups,
two seeds each, and limits 0,1,2,n, totaling 144 cases.

The explicit remaining frontier is index-dividing primes: these require the
Dedekind/general quotient-algebra path, not Kummer-only dispatch. Existing
small-degree, prime-word and resultant-modulus representation guards remain.
This is not a complete prepared-nf-to-class-group result or a timing claim.

The first all-four run found an adapter identifier-hygiene compiler defect:
public arguments named `descriptor_state` and `state` collide with a generated
`sagejs_native_descriptor_state` local, producing a JavaScript temporal-dead-zone
error before the GMP core call. CPython and generated JavaScript already
matched all 144 reference outputs and RNG states; this first run is not native
qualification. The compiler issue was reported independently rather than
attributed to the mathematical algorithm.

## Final all-backend qualification

Compiler fix `0335233fb` repairs the generated adapter namespace. The original
`descriptor_state` and `state` arguments remain unchanged; no source naming
workaround was used.

- `/tmp/sagejs-kummer-decomposition-kcSoHe/fixtures.json` records all 144 cases
  passing CPython, generated JavaScript, GMP and tagged native execution.
- Complete sorted prime descriptors and final RNG state match PARI, including
  binary factorization, repeated factors, generator corrections, inert cases,
  empty filtered decompositions and positive degree limits.
- 41 invalid controls pass in all four modes: every owner's minimum length,
  lower/upper domain bounds, equation-index divisibility, degree-limit sign,
  monicity and basis-degree validity. They are checked mutation-free.
- All native scratch owners match CPython; input owners, inactive descriptor
  records and all sentinel tails remain unchanged. Final status, count and
  correction totals are checked independently of backend agreement.
- Candidate SHA256 `47d6305e0bdd1aab8ec183d4fd0e68db9c322cee2333a221410d7f458b14e4df`.
- Core SHA256 `f75c91b74a1c21a35c94b910b7fcbeffef6f97790e1897a8ac169985988e968e`.
- Final run: 84.105 CPU seconds including compilation and metadata collector,
  571720 KiB peak child RSS, one thread and 4 GiB address limit.

This is successful one-prime decomposition qualification, not a competitive
timing or complete class-group-engine claim.
