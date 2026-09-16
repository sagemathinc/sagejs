# Exact-islands compiler campaign

## Frozen question

Can ordinary, typed, CPython-parseable Python express the faithful PARI 2.17.4
splitting-degree graph closely enough for the Sage.js native compiler to reach
its 1.39 ms same-algorithm fixed-storage C ceiling?

This campaign does not change the translated factorization algorithm, its eager
1,230-prime schedule, or the admitted prime bound.  It removes the remaining
exact-integer islands one at a time.  A successful stage must preserve all
7,081 active output values and the final catalog state in CPython, JavaScript,
GMP, and tagged execution.

## Frozen controls

- Prepared field: `x^3 - 20018*x + 20034`.
- Prime schedule: the existing 1,230-prime fixture.
- Catalog fixture hash:
  `c9ee35c9a64e22c7a0485af5a2015e8e15532352356a6c17c4f0fd7c4584ff07`.
- Same-algorithm fixed-storage C ceiling: 1.39 ms per catalog.
- PARI output-contract control: 2.03 ms per catalog.
- Starting tagged implementation: 13.7--14.0 ms per catalog.
- Timings are shared-host diagnostics unless a run explicitly says otherwise.

The checker must report the emitted core hash, per-function GMP evidence, total
GMP evidence, checked `int64` arithmetic sites, and heap-call sites.  Generated
code counts localize lowering decisions; they are not dynamic profiles.

## Ordered stages

1. **Convolution and polynomial offsets.** Retain `uint64` multiply-accumulate
   and high-bit reduction, but remove exact offset and slot-index arithmetic in
   `int64_pari_flx_mul`, `int64_pari_flx_sqr`, and division/remainder loops.
2. **Modular inversion.** Replace the exact inverse helper with a checked,
   bounded extended-Euclidean implementation whose signed-intermediate bound is
   stated and tested at the admitted maximum modulus.
3. **Length preflights.** Lower buffer lengths and the surrounding offset
   arithmetic as checked machine values, preserving every bounds error.
4. **Input reduction.** Isolate arbitrary-precision coefficient ingress from
   the repeated catalog kernel.  Preserve arbitrary-size input semantics and
   measure ingress separately from already-reduced repeated work.
5. **Characteristic two.** Replace the exact F2x staging reached at `p = 2`
   with bounded packed-polynomial storage, preserving factor degrees and
   multiplicities.

After each stage, run the complete checker before timing.  Retain a stage only
when the frozen output contract passes.  Record the timing delta even when it
is negligible or negative; do not combine stages before the individual result
is known.

## Safety argument for the first stage

For every odd prime in the frozen schedule, `p <= 3,037,000,493`, hence each
canonical coefficient product is below `p^2 < 2^63`.  Immediately before an
addition the accumulator is below `2^63`: whenever bit 63 becomes set, it is
reduced modulo `p`.  Therefore one addition is strictly below `2^64`, so the
source's modulo-`2^64` `uint64` multiplication and addition do not wrap on this
admitted domain.  The final reduction produces a canonical residue.

The emitted code already confirms that the hot `total += a*b` is direct
`uint64_t` arithmetic.  The remaining GMP operations in multiplication come
from an untyped valuation offset and the compound output index.  Stage one
therefore tests boundedness propagation around the convolution rather than a
new arithmetic semantic.

## Stopping rule

The campaign ends after all five stages have exact evidence and isolated
timings, or earlier if a stage requires a language feature whose safety or
fallback semantics cannot be made explicit.  The result is a compiler/runtime
diagnosis: parity is not required, but unexplained acceptance-criterion
weakening is forbidden.

## Result

All five stages pass the frozen four-field checker in CPython, JavaScript,
GMP, and tagged execution.  The checker covers 1,420 prime evaluations and all
7,081 active first-field output values.  The frozen catalog hash remains
`c9ee35c9a64e22c7a0485af5a2015e8e15532352356a6c17c4f0fd7c4584ff07`.

The retained implementation has two input corridors.  The pre-existing
`bounded_*` graph remains the arbitrary-size exact-input oracle.  The
`int64_*` experiment now states its signed-64 coefficient requirement in its
type and docstring.  Within that admitted corridor the reduction, factorization,
and publication graph has no GMP or heap operation.  This split preserves the
general exact semantics while permitting a separately measurable already-
bounded repeated kernel; it is not silent truncation or an automatic fallback.

The structural progression was:

| retained stage | whole generated-core `mpz_t` locals | static GMP operations | tagged milliseconds/catalog |
| --- | ---: | ---: | ---: |
| initial explicit signed storage | 201 | 1,885 | 13.7--14.0 |
| convolution offsets | 196 | 1,854 | timing rejected because of host drift |
| bounded unsigned modular inverse | 181 | 1,716 | 4.220--4.238 |
| checked lengths and preflights | 172 | 1,503 | 3.727--3.744 |
| direct exact-input residue reduction | 165 | 1,455 | 3.713--3.733 |
| packed characteristic two | 34 | 298 | 3.670--3.690 |
| typed loads/literals and signed-64 input corridor | 6 | 113 | 3.321--3.339 |

The last six locals and 113 operations are dormant generic support-runtime
code, not the translated mathematics.  The checker extracts all 60 emitted
`native_`, `word_`, and `tagged_` translated functions and asserts exactly
zero GMP locals, GMP calls, and heap calls across them.  The final emitted core
SHA-256 is
`f6eb54d750dd8ee88168f3be8f06a5a8587df4b51e2a722db8454bee2383e0d3`.

Seven alternating tagged batches gave a geometric mean of **3.3304 ms** per
catalog.  The GMP backend, which now executes the same fixed-width graph, gave
**3.2426 ms**.  Thus the campaign improves the original tagged implementation
by about **4.1x**, and narrows the same-algorithm C gap from about 10x to about
**2.4x**.  It is still about 1.6x slower than the separately measured 2.03 ms
PARI output-contract control.  All timings remain shared-host diagnostics.

The isolated F2 checker exhausts all 28 packed degree-two-through-four
polynomials on JavaScript, GMP, and tagged backends (84 comparisons).  Its four
emitted functions have zero GMP and heap calls.  The modular-inverse checker
covers 75,801 cases, including the maximum admitted prime.

## Compiler conclusions

Three compiler deficiencies were demonstrated rather than guessed:

1. `checked_int64` around a literal or buffer length boxed through GMP.  Direct
   literal and checked `uint64 -> int64` lowering removed that boundary.
2. `checked_uint64` around an `int64` boxed through GMP.  The new checked
   `int64 -> uint64` IR operation is implemented in every backend and rejects
   negative inputs without allocating an exact integer.
3. A fixed-width buffer load used directly in a comparison or product lost its
   fixed-width type, as did a fixed-width expression combined with an exact
   literal.  Typed local names prove that the backend is already capable of
   efficient code, but the source ceremony is too high.  This is the clearest
   next inference/range-propagation target.

Two deliberately unsafe diagnostic rebuilds localize what does *not* explain
the residual 2.4x gap.  Removing every signed overflow check changed 3.3304 ms
to 3.1354 ms.  Also removing every fixed-width buffer bounds check changed it
only to 3.1199 ms.  These are benchmark-only rebuilds and are not retained;
all production safety checks remain.  The residual gap therefore lies mainly
elsewhere—most plausibly the generated call/status ABI, code size and missed
inlining—not in GMP, heap allocation, signed overflow checks, or buffer bounds
checks.

The previously completed real HNFLLL storage-reuse transfer was rerun after
these compiler changes.  It again matched the frozen `8 x 15` exact operand and
all H/U/lambda/D/state hashes across four backends, while resident arena
storage measured 3.1491 ms versus 3.2822 ms packed (ratio 0.9595).  Thus reuse
does transfer correctly to real exact HNF arithmetic, but on this isolated
kernel it is a roughly 4% improvement rather than the explanation for the
whole HNF phase.

## Reproduction

```sh
node bench/pari-class-group-port/check_uint64_mod_inverse.cjs
node bench/pari-class-group-port/check_int64_f2x_small_factor.cjs
node bench/pari-class-group-port/check_int64_prime_degree_catalog.cjs
node bench/pari-class-group-port/benchmark_int64_prime_degree_catalog.cjs \
  /tmp/sagejs-int64-prime-degree-catalog-*/fixtures.json tagged
```

The benchmark accepts `INT64_PREBUILT_DIRECTORY` solely to time an explicitly
identified diagnostic rebuild.  Ordinary evidence generation does not set it.
