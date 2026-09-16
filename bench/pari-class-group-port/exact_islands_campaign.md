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
