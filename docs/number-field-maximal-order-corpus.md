# Number-field maximal-order corpus

The checked manifest
[`test/fixtures/number-field-maximal-order-corpus.json`](../test/fixtures/number-field-maximal-order-corpus.json)
is the stable input and exact-result authority for maximal-order correctness,
profiling, algorithm selection, and cross-system reports. Benchmark tools must
consume it rather than maintaining another list of polynomials.

The corpus contains 494 fields: 489 standard cases and 5 opt-in stress cases,
with degrees from 2 through 96. Its sources are:

| Source | Cases | Content |
| --- | ---: | --- |
| PARI Round-4 | 477 | All 430 polynomials in the main `v` vector, the named regressions, local-hint cases, the 16-element `R` family, and fixed-seed Tschirnhaus representatives |
| Hecke | 6 | Direct absolute simple-field `maximal_order` tests: degrees 18 and 90, huge-coefficient degree 6, rational degrees 3 and 4 after integral normalization, and precision-sensitive degree 12 |
| Existing Sage.js/Sage cases | 4 | The motivating degree-7 field, Sage's essential-discriminant cubic, and two LMFDB index-2 fields |
| Generated hard families | 7 | Bad primitive generators of pure fields, including the catastrophic degree-8 case and scalable degree/height/depth representatives |

The manifest content digest is
`cf66e794684801d794410cd982dcac220f1fbb415ff04c9d6f65705153eadb2d`.
The JSON file's byte digest is
`482102ff9748e1762e958712e43bd1887311344c29cebdc4cd81e1811b8acd72`.

## Stable representation

Every defining polynomial is monic and integral. Coefficients are decimal
strings in ascending order, so `[c0, c1, ..., 1]` denotes
`c0 + c1*x + ... + x^n`. This avoids JavaScript's safe-integer limit and
removes any parser-specific polynomial syntax. PARI vector case 428 was the
one nonmonic upstream input; it is stored after the same integral-generator
normalization used by Sage.js, with scale 54,880, and records that
transformation in its provenance.

Each case records:

- degree, coefficient height, equation discriminant, field discriminant, and
  equation-order index;
- an exact multiplicative decomposition of the index into local components;
- the canonical maximal-order lattice as a lower-left row-HNF integer
  numerator over a positive common denominator;
- domain-separated SHA-256 polynomial and basis digests;
- source/version/locator, implementation family, tier, family tags, and the
  expected certification state.

The local decomposition is intentionally honest about proof state. Trial
factors below 80,000 are `proven-prime`; larger residual components remain
`probable-prime` or `composite-unresolved`. The components always multiply to
the exact index, but 426 cases do not claim a fully certified prime support.
This is useful input for lazy component splitting and must not be interpreted
as a prime factorization.

There are 493 canonical basis digests. The 488 ordinary-sized bases are inline.
Five large stress bases retain only their digest:

- `regression-degree-72`;
- `pure-bad-generator-n32-c2pow32`;
- `pure-bad-generator-n32-c2pow128`;
- `pure-bad-generator-n48-c1009`;
- `pure-bad-generator-n96-c1009`.

The degree-4 large-prime quadratic compositum is the one explicit basis debt.
GP 2.17.3 computes its field discriminant with supplied factors `[2,p,q]`, but
its `nfbasis` hint boundary overflows while converting a `t_INT` to an unsigned
machine word. The manifest retains its normalized polynomial, both
discriminants, exact index, partial local components, and an `unavailable`
basis record rather than inventing or dropping a result.

## Oracle evidence

The generation run used GP 2.17.3, Sage 10.9.post1, Hecke 0.39.21 at commit
`eab7e5566e56d8864fe9cd7b895811ab9df2fe32`, and opt-in Magma 2.18-5.
Sage/PARI and Hecke/Oscar are each counted as one implementation family;
Magma is a third black-box family.

- GP supplied 493 exact HNF bases and all 494 field discriminants.
- A single warmed Hecke process completed all six selected Hecke regressions
  and five PARI-vector representatives. Its bases were lattice-equivalent and
  its discriminants agreed. A later difficult vector case was bounded and
  interrupted rather than allowed to block generation.
- Sage completed 15 selected lattice comparisons, including the degree-8
  `c=2^32` bad generator. Both containment directions were integral and the
  transition determinant had absolute value one. The Hecke degree-90 case
  exceeded 90 seconds in Sage and is an expected timeout record.
- Magma completed eight selected cases with lattice-equivalent bases and equal
  discriminants. Its maximal-order call for the degree-8 bad generator
  exceeded the explicit 10-second local bound, consistent with the plan's
  earlier 180-second observation.

There were no mathematical disagreements among completed oracle calls. The
manifest has 17 cases with cross-family lattice agreement. Oracle agreement is
fixture evidence, not a substitute for Sage.js's independent closure, index,
and local-maximality checker.

## Deterministic checks and regeneration

Run the license-free structural gate with:

```sh
node --test test/number-field-maximal-order-corpus.cjs
```

It verifies the manifest and case IDs, domain-separated hashes, polynomial
normalization, coefficient heights, the identity
`disc(equation) = index^2 * disc(field)`, exact local-component products, HNF
shape, and basis covolume. It also prevents an unavailable or timeout result
from disappearing silently.

The developer tools under
`upstream-tests/sage/number-fields/maximal-order/` are not runtime
dependencies:

- `build_pari_round4.py` extracts the public PARI `v` vector and normalizes GP
  bases;
- `hecke_oracle.jl` runs a persistent public-API Hecke oracle;
- `sage_oracle.sage` runs the corresponding persistent Sage oracle.

Magma remains opt-in and black-box only. No proprietary source or test data is
stored. A regenerated fixture should update both content hashes above, retain
raw bounded-failure classifications, and pass the structural gate before its
results are used for timing.
