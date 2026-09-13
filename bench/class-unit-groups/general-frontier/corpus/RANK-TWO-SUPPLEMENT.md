# Predeclared rank-two polynomial supplement

This is a separate deterministic development-candidate source. It does not
change LMFDB candidate policy v2, acceptance targets, or any runtime algorithm.
Ordinary CPython performs coefficient generation and exact elementary checks;
no CAS, Sage.js, database, or timing is called by this tool.

```sh
python3 bench/class-unit-groups/general-frontier/corpus/rank_two_supplement.py plan
python3 bench/class-unit-groups/general-frontier/corpus/rank_two_supplement.py generate \
  --output /tmp/rank-two-supplement-v1.json
python3 bench/class-unit-groups/general-frontier/corpus/rank_two_supplement.py check \
  --fixture /tmp/rank-two-supplement-v1.json
python3 bench/class-unit-groups/general-frontier/corpus/test_rank_two_supplement.py
```

Generation refuses to overwrite an existing export. Output contains **112
polynomial candidates**, not 112 proven distinct fields. Parameters are all
tuples of two families, decimal scales `k = 4,6,8,10,12,16,20`, and `j = 0,...,7`.
There is no random seed, outcome filter or adaptive scale extension: every
listed tuple is generated. Samples per cell are capped at eight, and the total
candidate count is capped at 200. Changing this envelope requires a new policy.

## Why a separate source is warranted

Read-only LMFDB probes on 2026-09-11 found the largest mixed-quartic field
discriminant magnitude to be `34060633877926656000`; none were at least
`10^20`. The largest real-cubic discriminant was
`19627909893848232377256843521369709`, but exactly one real cubic had
discriminant at least `10^24`. The next-largest magnitude was
`3184931892762514194300`. Thus the existing database has a large upper-range
gap for the targeted signatures. These facts do not establish reference costs.
The probes used bounded ordered extrema, threshold counts capped at 257, and
15–20-second read-only statement timeouts against the public `nf_fields` table.

The LMFDB v2 lower-edge windows also do not cover every upper-tail row. A
separately declared bounded descending-discriminant source window is a useful
additional reference sample, but cannot supply mixed quartics beyond the
database's observed ceiling. Preserve such receipts separately from v2.

## Exact families and certificates

Set `s = 10^k`, `a = 2*(s+2*j+1)`, and `b = 2*(s+4*j+1)`.

- Real cubic: `f(x) = x^3-a*x+b`, coefficients `[b,-a,0,1]`.
- Mixed quartic: `g(x) = x^4-a*x-b`, coefficients `[-b,-a,0,0,1]`.

Both polynomials are monic, all nonleading coefficients are even, and their
constant coefficients are 2 modulo 4. Eisenstein at 2 proves irreducibility,
so their field degrees are exactly three and four. The checker verifies these
integer congruences for every emitted coefficient vector.

For the cubic, the exact equation discriminant is `4*a^3-27*b^2`. The checker
requires it to be strictly positive, proving three distinct real roots and
signature `(3,0)`. For the quartic, `g'(x)=4*x^3-a` has exactly one real zero,
is negative before it and positive afterward. Since `g(0)=-b<0` and the
polynomial tends to positive infinity at both ends, it has exactly two real
roots, hence signature `(2,1)`. The exact quartic equation discriminant
`-256*b^3-27*a^4` is also checked negative. Both signatures give unit rank two.
The quartic is not an even polynomial; this construction does not force a
quadratic subfield by using only powers of `x^2`.

All coefficients and equation discriminants are decimal strings; arithmetic
uses unbounded Python integers. The largest scales intentionally exceed
JavaScript's exact-number range. Every label is a domain-separated SHA-256
identity of the exact degree/coefficient vector, **not** an LMFDB field label.
Policy, records, and complete export have deterministic hashes. Offline
validation regenerates every tuple and certificate, rejecting changed metadata
even if someone recomputes the outer digest.

## Distinctness, exposure, and screening obligations

Irreducibility and signature do not establish distinctness between different
parameter tuples or against existing LMFDB and historical fields. Equation
discriminants are not field discriminants; equation-order indices can be large.
The export therefore leaves `distinct_field_count`, `field_identity`, field
discriminant, index, class number, class group, and regulator null.

Before counting fields, compute exact maximal-order/field-discriminant data
under a separately budgeted reference preparation stage. Unequal field
discriminants certify nonisomorphism. For equal degree/signature/discriminant
buckets, perform exact field-isomorphism tests against both supplementary and
existing fields, retaining maps for identified duplicates. Do not substitute
coefficient hashes or differing equation discriminants for this test. Keep
unresolved preparation/isomorphism cases in the receipt as unresolved rather
than counting or silently replacing them. PARI documents `nfisisom` and the
distinction between `nf` and class/unit `bnf` computations in its
[number-field reference](https://pari.math.u-bordeaux.fr/dochtml/html/General_number_fields.html#nfisisom).

Pin any optional reduced presentation and its exact isomorphism, and report
order/presentation work separately from prepared-order measurements. Polynomial
height alone is not a proxy for field difficulty or researcher time saved.
Do not require expensive canonical `polredabs` merely for label construction;
the coefficient hash is already an unambiguous presentation identifier.

Predeclare the reference-screening subset/order and CPU allowance before
running it. Keep missing answers and timeouts; only matched complete PARI/Hecke
requests establish the faster-reference timing bands. Large scales may be
stress-only or exceed the existing cap; the generator does not authorize
raising limits. All acceptance quotas remain unchanged. Reserve separately
declared unseen neighbors before optimization rather than selecting them after
inspecting performance.

Holdout eligibility remains null pending a complete exposure audit and exact
cross-corpus isomorphism reconciliation. Any field subsequently examined for
development must be marked exposed across all its presentations. Final holdout
consumers must require `holdout_eligible === true`, never `!== false`. This
generator itself does not assign holdouts or emit `true`.
