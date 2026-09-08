# Exact native bit length for cubic square-root setup

This experiment addresses a compiler obstruction found in the cubic cost
ledger, not a change to class-group assumptions or analytic bounds. The
baseline is commit `02d0ed004`; both comparison kernels are compiled with the
same candidate compiler. The only mathematical-source change replaces the
positive-integer division loop in `_cubic_ceil_sqrt` with
`checked_uint64(value.bit_length())`.

## Semantics and representation

IR version 40 adds `integer.bit_length`. For an integer $n$, the result is
$0$ if $n=0$, otherwise the unique integer $b$ satisfying
$2^{b-1}\leq |n|<2^b$. The receiver is evaluated once, and the operation takes
no arguments. Native `Integer` and `uint64` receivers are supported; other
receiver types fail compilation. This is a native subset, not a change to
dynamic Python semantics (in particular, Python also accepts Boolean
receivers).

The emitted implementations are:

- JavaScript: the magnitude's binary string length, returned as BigInt.
- GMP: `mpz_sizeinbase(n, 2)`, with zero handled separately and a portable
  uint64-to-mpz setter (no Windows `unsigned long` truncation).
- FLINT: `fmpz_bits`, directly within the resident exact computation.
- Tagged integers: the word helper for small values, GMP for promoted values.
- Signed words: six fixed unsigned shift-and-count steps. Negative magnitude
  is formed by unsigned subtraction, so `INT64_MIN` needs no undefined signed
  negation.

The operation participates in input liveness, scratch allocation, backend
eligibility and arithmetic-cost analysis. It is not integer-growth work and
requires no host callback or new external library. Versioning invalidates old
IR/cache identities; tests pin the new version explicitly.

## Why the cubic change is equivalent

The helper has already returned for $n<2$. After $k$ iterations of the old
loop, `probe` is $\lfloor n/2^k\rfloor$. Its first zero occurs at exactly
$k=n.\mathrm{bit\_length}()$. Thus the replacement supplies the same `bits`
to the unchanged seed construction and Newton iteration. No enumeration,
relation collection, certification threshold, precision, or resource limit
changes.

The seed-multiplication loop is deliberately retained. Current native shift
lowering is fixed-width; replacing that loop with `1 << shift` would not
establish arbitrary-precision equivalence. Likewise, the separate bounded
bit-length helper is unchanged so this experiment isolates one use site.

## Focused checks

`tools/native-kernel/test/integer-bit-length.cjs` compares 1,127 signed
integer cases with CPython, including zero, boundaries through 16,384 bits,
uint64 endpoints, reassignment/aliasing and a side-effecting receiver. It
exercises JavaScript, GMP, tagged and resident FLINT execution and inspects
the generated closed core. Invalid argument forms and noninteger receivers
must fail compilation.

`test/number-field-cubic-sqrt-bits.cjs` compiles the actual production
square-root helpers and compares them with CPython `math.isqrt`, including
negative sentinels, squares and their neighbors through 8,192-bit inputs.
These tests passed locally on Linux x64. This is not evidence of execution
on Windows or browser Wasm; their qualification remains separate.

## Controlled native comparison

On `opt` (Linux x64, AMD EPYC 7B13, Node 26.8.1, CPU-0 affinity), eleven
alternating rounds measure 256 calls per Sage.js variant and 1,000 PARI
`bnfinit(f,0)` calls after warmup. Both Sage.js variants use the same new
compiler, threshold 997, fixed effort five, preallocated external scratch and
unchanged resource limits. This times the direct polynomial-to-result kernel,
not a public Sage.js call or independent receipt replay.

For $x^3-x^2-11x-63$:

| Implementation | Median ms/call |
| --- | ---: |
| Division-loop baseline | 2.245825 |
| Native bit length | 2.193826 |
| PARI 2.17.4 | 1.222000 |

The candidate is faster in all eleven paired rounds, a 2.315% reduction in
the ratio of medians. It remains about 1.80 times PARI's time. This gain must
not be added to the separately measured cutoff-768 experiment.

The frozen 1,012-field fixed-effort survey gives 948 accepts, 64 declines and
zero exceptions for both variants. Every status and all 64 output words agree.
This does not replace the adaptive public census or its independent replay.

Two runs of the already-exposed fourteen-field regression set improve
thirteen medians each. The class-number-5 headline field goes from
1.838297 to 1.792201 ms in the first run, and 1.836824 to 1.800720 ms in
the repeat. The smallest-discriminant field `3.1.23.1` is slower in both:
0.392418 to 0.399098 ms, then 0.401311 to 0.404259 ms. We retain that
approximately 3–7 microsecond loss; this is not a universal no-regression
claim. The set is not an unseen holdout.

The diagnostic uses the existing `diagnose-cubic-bf-index-build.cjs` and
`diagnose-cubic-bf-index-timing.cjs` drivers with baseline revision
`02d0ed004`. Their historical candidate label `indexed` means the bit-length
candidate in these artifacts, not a second index-lookup change. The survey
uses `diagnose-cubic-cutoff-survey.cjs`; the fourteen-field driver is
`bench/native-source-compression-cubic.cjs`.

After replacing the differing temporary Python source paths with the same
`<SOURCE>` marker, generated C decreases from 11,207,646 to 11,200,704 bytes.
The production source allowance remains 485,000 bytes. No arena, matrix-shape,
or source allowance is increased.

The ceiling-square-root helper retains five exact scratch slots and direct
fmpz eligibility, while its IR loop count falls from three to two. The checked
machine conversion adds an explicit overflow guard rather than a truncation.

## Broader checks and outstanding qualification

Strict Python checks pass for all 382 configured modules. The complete
architecture check passes after regenerating the source-bound optimizer
dashboard through its canonical analysis pipeline. The focused suite
passes 23 tests, including address/undefined-behavior sanitizer coverage for
word magnitudes, promoted tagged values and in-place replacement. The native compiler
end-to-end suite `node test/native-kernel.cjs` also passes. The native compiler
test-directory run has 68 passes, three failures and one skipped Wasm test
(toolchain unavailable). The three failures reproduce with the baseline
compiler and baseline mathematical source: the old 59-child checkpoint
assertion now observes 89, an identifier-hygiene test expects an obsolete
wrapper name, and a Cantor mutation test omits `scalar_words`. These failures
are not silently reclassified as passes.

`pnpm parallel:check` remains blocked by inherited worktree metadata: it finds
395 live task records where it expects one. No task contracts are changed by
this patch.

The full build passes, and five production-closure/BF-prefix tests pass on
the rebuilt pack, including resumed certification and bounded failure with
workspace reuse. Public `class_number(proof=False)` calls return 5, 2 and 3
for the two headline polynomials and the selected target, with matching
authenticated native receipts and independent conditional-GRH replay.
The source-hash guard had correctly rejected the stale pre-change pack before
this rebuild. Full public/corpus performance qualification and the reserved
unseen holdout remain outstanding.

## Evidence identities

Candidate Python SHA-256:
`678630a3a68b436e71a34966576baa71a1fe6b645ec5f845cabb4f94cdef2447`.
The diagnostic baseline cache key is
`ee277bb052928897c602913b58e3cf56d7a4892731b0fad7e593ec131534788e`;
the candidate key is
`c88c2a761214f20e29637d1dd90857874e731e79a45785e8eea81e3db5c59b6e`.
These identify isolated diagnostic builds, not the production pack.

The rebuilt production source cache key is
`a443755f106bdb87d6142c4d2895de8fd0d875586169b2a76e7ee98fe43cf258`.
Its containing native pack SHA-256 is
`9b8c2f7d3ac1529fd11d44a31104ed3599796aea566c9dcddadb53e1561d6262`.

Raw evidence under the ignored `build/cubic-next-evidence/` directory:

- `bit-length-opt-timing.json`: SHA-256
  `aecd0cd6a70dec1e433f86c96268293925fa0ebfd739406dda439f53b3fbbce5`.
- `bit-length-regression.json`: SHA-256
  `a454bef429be48aedd707eea922b160e64a651329e201f8661acd69b4fc790e2`.
- `bit-length-regression-repeat.json`: SHA-256
  `ad8747afb148d47e8766484d8bc2316d31d8a64aceed5fc4c39685c153cc347a`.
- `bit-length-fixed-effort-survey.json`: SHA-256
  `50c73eb078278cc2386032bdd2f4c9fe1cce3b77b1faff886ce07dffbb8b9432`.
