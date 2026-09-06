# Exact compression of a rounded arctangent tail

Status: candidate; native equivalence checked, public qualification pending.

The cubic generator-bound and analytic-certificate routines bound $\pi$ using
Machin's identity and integer enclosures of $\arctan(1/d)$ for $d=5,239$.
This change preserves the previous **80-term interval endpoints exactly**.
It changes neither the analytic theorem nor the proof assumptions.

For integers $d>1$ and $S>0$, write

$$
t_i=\frac{S}{(2i+1)d^{2i+1}},\qquad
S\arctan(1/d)=\sum_{i=0}^{79}(-1)^i t_i+R.
$$

The alternating-series theorem gives $0<R<t_{80}$. The implementation adds
$[\lfloor t_i\rfloor,\lceil t_i\rceil]$ at even indices, subtracts it at
odd indices, and finally adds $[0,\lceil t_{80}\rceil]$.

Suppose at index $k<80$ its exact denominator is greater than $S$. All later
denominators are strictly larger, so $0<t_i<1$ for every $i\geq k$.
Every remaining even summand therefore contributes exactly $[0,1]$ to the
old rounded calculation, and every odd summand contributes $[-1,0]$.
Let $P,N$ count the even and odd indices in $\{k,\ldots,79\}$. If $[L,U]$
is the accumulated prefix, the original routine must return

$$
[L-N,\ U+P+1].
$$

The final $1$ is the unchanged positive remainder bound. Counting these
indices replaces multiplication and division of successively larger exact
integers. If no denominator crosses $S$ before index 80, execution retains
the original loop and remainder calculation. Equality of a denominator with
$S$ deliberately does **not** trigger compression.

This is not an approximate early exit, a table of field-specific answers, or
a tighter interval that could alter a certification branch. It reproduces
the same endpoints for every admitted integer denominator and scale; invalid
inputs retain the same sentinel. It allocates no new owner and relaxes no
resource bound. It may succeed with less temporary space than the original
calculation, but resource exhaustion never authorizes publication.

The regression `test/number-field-cubic-arctan-tail.cjs` compares the actual
source, under CPython and generated JavaScript/tagged/GMP/automatic execution,
with a separate uncompressed 80-term oracle. Its 432 cases include both tail
parities; exact threshold equality and its two neighbors; indices 78, 79,
and 80; large denominators; scales through 4,096 bits; and invalid inputs.
## One constant enclosure per generator search

The generator inequality uses two endpoints $c_N^+,c_D^+$ determined by the
field discriminant, the fixed signature, and the precision. Neither depends
on the trial bound. `_cubic_grh_generator_constants` computes them once, in
the same borrowed scratch owners, before doubling and binary search begin.
Every trial receives these exact integers. The discriminant and transcendental
table remain unchanged throughout the search; the lazily populated splitting
table is a separate owner. No process-global or cross-field cache is used.

All original inequalities and rounding directions are preserved. A failed
constant enclosure yields no generator bound and permits no trial probe.
The search regression covers 2,484 cap/threshold combinations, checks that
constants are evaluated exactly once when needed, and rejects an invalid
constant enclosure before probing. (The capped search can still legitimately
return zero when no trial is certified.)

The combined candidate returned identical 64-slot native outputs on every
accepted member of the frozen 1,012-record population: 940 accepted, 72
matching fixed-effort declines, and zero errors. This is not a full public
coverage census or independent transcript replay. Those remain separate
gates, together with controlled public timing, in the campaign checkpoint.
