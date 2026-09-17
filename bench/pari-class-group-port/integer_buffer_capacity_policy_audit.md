# IntegerBuffer capacity policy for the prepared h1 worker

`IntegerBuffer.wordCapacity` is a dense per-entry stride.  It is not a shared
scratch budget: an owner of length `L` reserves `8 * L * wordCapacity` limb
bytes, plus four bytes of signed size per entry.  The prepared candidate has
275 integer owners and 1,025,559 integer slots.  A uniform capacity of 16,384
words would consequently reserve about 125.2 GiB before either kernel runs.

The compiled entry already publishes the transitive write set as
`entry.effects.externalWrites`.  Use it as allocation authority:

1. A buffer absent from `externalWrites` is read-only throughout the compiled
   call graph.  Give it exactly the maximum input magnitude width, with a
   one-word floor.  In particular, the nine `admission_products` slots need
   1,470 words for this prepared prime-product table, while the other owners do
   not inherit that width.  This is prepared-input metadata, not a result or an
   expected answer.
2. A mutable candidate or final-bridge owner gets the greater of its input
   width and 16 words.  The 16-word floor is the next power of two covering
   four times the admitted 192-bit precision.  It covers the source's
   double-precision exponential numerator and exact cubic/HNF headroom without
   consulting a successful result.
3. A mutable p2176 replay owner gets the greater of its input width and 128
   words.  This is the next power of two covering twice 2,176 bits, matching
   the source's multiply-before-normalize precision arithmetic.
4. Compute the total dense owner bytes before allocation and reject a bounded
   process budget.  For the current candidate, the 16-word mutable floor plus
   exact-width read-only owners is about 128.3 MiB including signed-size
   arrays, not hundreds of GiB.

The prepared product table is controlled by `admission_prime_limit` (65,537),
not by `admission_factorlimit` (1,048,576).  The latter is a trial-division
frontier.  The actual prepared products are immutable and so their input width
is both sufficient and the narrowest correct allocation.  A separate sanity
ceiling may reject malformed prepared input, but must not widen every owner.

The live worker failure reproduced during this audit is unrelated to capacity.
The candidate and owner bridge both return successfully under the existing
16/2,048/128 allocation.  The failure occurs later when a newly rebuilt p2176
regulator triplet is compared directly to the accepted p192 triplet.  Because
the representations have different precisions, raw triplet equality cannot
establish agreement; the replay must first use the representation's intended
normalization/rounding rule, after which a remaining mismatch would be a
mathematical replay defect rather than an allocation defect.
