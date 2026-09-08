# A larger public bottleneck: irreducibility reconstruction

The native bit-length improvement is small compared with public setup costs.
This diagnostic investigates the existing constructor for the same known
target $x^3-x^2-11x-63$; it does not change production code or skip any check.

## Controlled boundary measurements

The dedicated `opt` VM uses its previously built `ca2e588b5` checkout, Node
26.8.1, CPU-0 affinity, and one-thread limits for common numerical libraries.
`git diff ca2e588b5 5ef41b908 -- src/baselib/polynomial.py
src/baselib/number_fields.py` is empty: the constructor and polynomial methods
have not changed since that build. This is not a timing of the new native
class-group kernel.

The driver prepares one exact rational polynomial. It warms each operation
30 times and alternates forward/reverse operation order over eleven rounds,
128 calls per operation per round. Returned factor counts, irreducibility and
field degrees are checked outside each timed batch. No class number is
computed. The small driver loop and ordinary Python function call are inside
each timer; startup is outside.

| Public boundary | Median ms/call | Range of batch means |
| --- | ---: | ---: |
| `p.factor()` | 0.764686 | 0.706236–1.029504 |
| `p.is_irreducible()` | 2.995336 | 2.787038–3.217898 |
| `NumberField(p, "a")` | 3.710720 | 3.420886–4.290106 |
| `str(p)` | 0.105460 | 0.085154–0.148388 |

These are independently timed boundaries, not disjoint nested phases. Their
medians must not be subtracted to manufacture an exact exclusive-cost ledger.
They nevertheless identify a much larger public optimization target than the
roughly 0.052 ms native bit-count improvement.

## Sampling explains the expensive part

A separate local run on the current `5ef41b908` runtime uses Node's CPU
sampler. Restricting samples to descendants of the driver's `construct`
function gives these **overlapping inclusive** shares:

- `is_irreducible`: 84.1%.
- Polynomial multiplication dispatch: 59.2%.
- `_touch_polynomial_resource`: 54.7%.
- `factor`: 15.5%.
- `_decode_exact_polynomial_factorization`: 13.6%.

This local instrumented profile is attribution evidence, not an `opt`
performance comparison. Unattributed GC/native samples and profiler/inlining
effects prevent treating these percentages as exact wall-time fractions.
The profile summarizer deduplicates repeated function names on a stack but
does not make different rows disjoint.

Source inspection agrees with the profile. The rational irreducibility path
calls `factor()`, then checks one factor of exponent one, and finally computes
`factors[0][0] * factors.unit() == self`. Factorization decoding constructs
public polynomial objects; multiplication materializes their resource storage
and touches the shared resource cache. The cache uses list membership and
`remove`, both invoking generic equality scans, rather than identity-indexed
bookkeeping. The four storage-owner classes do not define value equality.

An initial monkeypatch-based nested timer failed with `missing required
argument: self`; none of its output is used. The retained timing driver makes
only ordinary public calls, and the profile does not patch runtime methods.

## Next implementation, with a mathematical contract

First implement a direct exact **rational polynomial irreducibility** path
using the existing resource-backed FLINT factorization and its count/exponent
accessors. There is no need to add a new foreign dependency or reconstruct
the factors as public objects just to return a Boolean.

For a nonconstant polynomial over $\mathbb Q$, a complete irreducible
factorization has an irreducible input exactly when it has one factor with
exponent one. Nonzero rational content is a unit and cannot change this
answer. The native library's complete-factorization contract is already
trusted by `factor()`; checking a reconstruction is not an independent proof
of irreducibility of the returned factors. Zero and constants need explicit
tests, as do nonmonic/scaled, repeated-factor and reducible polynomials. Do
not copy this criterion to integer-polynomial content without a separate
argument. Preserve ownership cleanup and the unavailable-resource fallback.

Second, consider identity-indexed LRU bookkeeping for the resource cache.
It must preserve eviction order, the 64-live-resource bound, spilling and
exception behavior, and resource reuse after serialization. Changing the
cache size or leaking resources would not be an acceptable speedup.

Measure each change separately before combining them. Require unchanged
public mathematics and receipts, then rerun the fixed public benchmark. A
faster constructor alone is neither a native class-group algorithm win nor
evidence that Sage.js now beats PARI end to end.

## Reproduction

`bench/class-unit-groups/diagnose-number-field-construction.py` is the retained
timing driver. Run it through `node bin/sagejs`, with the runtime revision
pinned and recorded. For a separate local sampling run:

```sh
node --cpu-prof --cpu-prof-dir=/path/to/diagnostics --cpu-prof-name=construction.cpuprofile bin/sagejs bench/class-unit-groups/diagnose-number-field-construction.py
node bench/class-unit-groups/summarize-construction-profile.cjs /path/to/diagnostics/construction.cpuprofile
```

Raw timing is retained in
`build/cubic-next-evidence/construction-opt-timing.log`; sampled attribution
is retained in `construction-profile-summary.json` in that directory.
Their SHA-256 digests are respectively
`d235844d0aed6958b5c83e1e02929ada0ecd030b4014e7881e2963cd629869ac`
and `debfca43f5bd7cec498956f42b1fe9fdd903f2b49f427504f21dcd2998cb1a19`.
