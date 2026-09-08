# Cubic generator content and search-order ablations

These experiments follow the [missing-unit forensics](cubic-missing-unit-search-forensics.md).
They change source copies, not production mathematics, certification rules, or
resource limits. All corpus runs are fixed-effort-five development diagnostics;
the twenty reserved unseen neighbors remain unexecuted.

## Content normalization

PARI's small-norm collector divides a generator by its rational content before
admitting its relation. The native raw capture instead contains, for example,
both $a+4$ and $2a+8$. Exact generator-coordinate duplicate detection does not
recognize these as rational multiples. They can consume relation-budget space
without adding useful unit information.

The isolated `content` variant divides a **nonscalar** integral-basis coordinate
triple by its positive gcd before computing its norm and principal-ideal
factorization. Rational scalar candidates are unchanged. No relation vector is
reused after changing the generator: every exponent is computed for the new
element and subjected to the existing exact checks. It does not identify
different generators just because their exponent rows agree.

If $\alpha=\sum a_i\omega_i$, $g=\gcd(a_0,a_1,a_2)>0$, and the $\omega_i$
form an integral basis, then $\beta=\alpha/g$ is integral and

$$
(\alpha)=(g)(\beta),\qquad N(\alpha)=g^3N(\beta).
$$

Changing the search proposals this way cannot give an invalid principal
relation when its factorization is recomputed exactly. It can change which
prefix is retained, so no unconditional claim of identical coverage or
performance follows. Exact class-group completeness and unit certification
remain necessary and unchanged. The experiment does not prove its own
performance benefit from this algebraic identity.

The ordinary-Python source-fragment test covers 1,333 signed, zero, scalar,
primitive, nonprimitive, and large-integer cases. Native development calls
provide additional end-to-end observations, not a formal proof of the checker.

## Origin-centered coefficient order

A separate experiment keeps the same finite coefficient box and visits each
axis in the order $0,1,-1,2,-2,\ldots$. The existing resumable cursor still
counts proposals in its original lexicographic index space; a bijection maps
each index to the actual proposed coefficient. Advancement, exhaustion,
proposal budgets, exact ellipsoid membership, and certification are unchanged.

This is **not** PARI's full Fincke–Pohst enumeration. In particular, it does not
use the conditional Gram–Schmidt centers or avoid the complete bounding-box
scan. Its purpose is to isolate whether this simpler traversal permutation
already improves the selected workload. Tests verify bijectivity for every
admitted one-dimensional coordinate bound from 0 through 64 and check that
the source transformation leaves the cursor/acceptance logic untouched.

## Frozen 1,012-field development results

The baseline was freshly rebuilt and reproduces its previously observed
948-field first-attempt acceptance set exactly. All accepted results in every
variant agree with the frozen class numbers and invariants.

| Search policy | Accepts | Gains over baseline | Lost baseline acceptances | Exceptions |
| --- | ---: | ---: | ---: | ---: |
| Existing | 948 | — | — | 0 |
| Content normalization | 957 | 9 | 0 | 0 |
| Larger radius | 969 | 29 | 8 | 1 |
| Content + larger radius | 979 | 35 | 4 | 0 |
| Content + radius + twelve-ideal ordering | 978 | 35 | 5 | 0 |
| Origin-centered order | 949 | 4 | 3 | 0 |
| Origin-centered order + radius | 972 | 33 | 9 | 0 |

Normalization's nine newly accepting labels are `3.1.891027.1`,
`3.1.1682879.4`, `3.1.2461516.2`, `3.1.2481388.1`, `3.1.2518408.1`,
`3.1.3312571.1`, `3.1.13725963.1`, `3.1.25528932.3`, and `3.1.55754163.2`.
It does not by itself repair the selected $x^3-x^2-7x+122$ first attempt.

The combination with larger radius still loses `3.1.1264364.1`,
`3.1.2155607.1`, `3.1.29289260.3`, and `3.1.43342803.2`. A larger total
acceptance count is not sufficient to promote that policy.

## Controlled `opt` timings

The portable bundles authenticate source, generated module, and native addon
hashes before execution. Runs are serialized and launched with `taskset -c 0`
on the dedicated four-vCPU EPYC 7B13 `opt` host, Node v26.8.1, PARI 2.17.4.
Each field has seven alternating forward/reverse rounds, 64 native executions
per sample, 256 PARI executions per sample, and twenty warmups.

Native measurements include the existing conditional retry sequence
`(5,1,7,8)` and use preallocated external buffers. PARI executes fresh
`bnfinit(f,0)` calls. Public construction, receipt authentication, and
independent Sage.js replay are **not** measured. This is not public API parity.

Median milliseconds, first timing campaign:

| Polynomial | Existing | Content | Larger radius | Content + radius | PARI |
| --- | ---: | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 9.3605 | 9.2127 | 3.6647 | 4.3224 | 1.5469 |
| $x^3+9x-55$ | 1.7917 | 1.7957 | 2.1096 | 2.1350 | 1.1875 |
| $x^3-x^2+3x-4$ | 1.3000 | 1.3021 | 1.3071 | 1.3177 | 1.0039 |
| $x^3-x^2-11x-63$ | 2.1998 | 2.2189 | 4.3353 | 4.3353 | 1.2227 |

The content-only paired median candidate/baseline ratios are respectively
0.9804, 1.0038, 0.9986, and 1.0062. These small-sample observations do not
establish a universal no-regression guarantee.

A second complete timing campaign remeasures baseline and radius alongside
the centered-order variants; do not mix its medians with the first campaign:

| Polynomial | Existing | Centered | Larger radius | Centered + radius | PARI |
| --- | ---: | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 9.3205 | 9.4029 | 3.6779 | 3.7746 | 1.5508 |
| $x^3+9x-55$ | 1.7978 | 1.7618 | 2.1225 | 2.1394 | 1.1914 |
| $x^3-x^2+3x-4$ | 1.3060 | 1.2906 | 1.2883 | 1.2922 | 1.0117 |
| $x^3-x^2-11x-63$ | 2.1797 | 2.2940 | 4.2940 | 4.3003 | 1.2227 |

Thus eliminating the target's restart is valuable, but none of these variants
beats PARI there. The simpler centered traversal does not provide the hoped-for
target speed improvement. Globally enlarging the radius nearly doubles the
earlier $C_3$ example's time.

## Decision and next work

Content normalization alone is the best-behaved candidate for separate
integration and public exact-replay qualification. It is not integrated by
this diagnostic commit. The global radius and traversal replacements remain
experiments, not release candidates.

The larger search should instead be available after an insufficient unit
certificate, preserving successful cheap prefixes and resident field/relation
state. A genuine Gram–Schmidt-centered, pruned enumeration is a different
algorithmic experiment from the origin-centered permutation tested here.
Further work must account for the exact retained unit information and bounded
storage, rather than raising source or arena allowances.

## Reproduction

Use fresh disposable directories for the source-copy builds:

```sh
node bench/class-unit-groups/diagnose-cubic-content-build.cjs ROOT FRESH_DIR
node bench/class-unit-groups/diagnose-cubic-centered-build.cjs ROOT FRESH_DIR
node bench/class-unit-groups/diagnose-cubic-ablation-run.cjs BUILDS_JSON [FROZEN_CORPUS_GZ]
taskset -c 0 node bench/class-unit-groups/diagnose-cubic-ablation-timing.cjs PORTABLE_BUNDLE GP
```

The portable bundle has `builds.json` with schema
`sagejs.diagnostic/portable-cubic-ablation-v1`. Each named subdirectory contains
`source.py`, `index.cjs`, and `build/Release/sagejs_native_kernel.node`; manifest
records bind each file's SHA-256 and the native cache key. Timing JSON embeds
these identities and every sample. The native source baseline remains
`678630a3a68b436e71a34966576baa71a1fe6b645ec5f845cabb4f94cdef2447`.

Retained evidence under `build/cubic-next-evidence/`:

- `content-frozen-discovery.json`:
  `0a1f3b54430a2c2af24a61b2b5f277f91cc584cfe9b47c8f667fb6a4b34f509c`.
- `centered-frozen-discovery.json`:
  `183955d5b1aaccedd2cd9b48c8a0cbcd1075a89c028792785495048a6d9081b5`.
- `content-opt-timing.json`:
  `7227e6ff3e312f2b39e08043f2f3f6f5f5b2b7de35ac66b64c5f7e7ebd95f483`.
- `centered-opt-timing.json`, both timing logs, and both source-build manifests.

The [raw evidence archive](https://github.com/sagemathinc/sagejs/releases/download/cubic-search-policy-ablation-20260908/cubic-search-policy-ablation-20260908.tar.gz)
includes these outputs, the experimental source copies, the portable identity
manifests, and the exact timing driver used on `opt`. Archive SHA-256:
`0abeb9c7e3ca56bc56d7a6c02cbaa6bbb4ef615e606485ff18b2958e4561c1ca`.

Focused tests and `pnpm architecture:check` pass. The inherited 395-live-task
ambiguity still prevents `pnpm parallel:check` from passing. No current-source
public receipts, independent replay, holdout run, or cross-platform release
qualification is claimed.
