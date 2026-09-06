# Warmed native cost ledger: next campaign

This is local diagnostic evidence for the `0ad63e092` generated native program,
not a controlled `opt` timing or a PARI comparison. The selected development
field is $x^3-x^2-11x-63$ (`3.1.12716.2`, $C_3$), at fixed effort five.
It predates the direct interval-division change.

## Method and limits

Diagnostic copies wrap the generated mathematical function definitions with
monotonic clocks and a thread-local child-duration stack. The final copy also
uses the existing Round-2 profiling hooks and instruments successful analysis
stages in a copied header. Production headers, generated caches, and dispatch
are not modified. The copied artifacts explicitly disclaim their inherited
cache identity as an authentication identity for the instrumented binary.

Run 1,100 calls and subtract the cumulative counters after the first 100.
The remaining 1,000 calls all return class number three. Their exclusive
durations sum exactly to the instrumented root duration. Inclusive values
must **not** be added; that would count nested stages repeatedly. The clocks
and wrappers add overhead, and local machine contention is uncontrolled.
The analysis-stage markers cover the successful target path only, not all
error exits. Worker-thread internal events are not mixed into main-thread
wall-clock accounting; the enclosing witness stage includes its join.

Cold blocks were misleading: the final instrumented run averages 3.204 ms in
the first hundred calls and 2.661 ms in the remaining thousand. Do not use the
earlier cold-inclusive 0.68--0.92 ms analysis figures as steady-state costs.

## Findings

The warmed analysis call takes about 0.324 ms in this diagnostic. Its main
subdivisions are:

| Analysis component | Inclusive ms per call |
| --- | ---: |
| Discriminant and factorization | 0.00354 |
| Order construction | 0.20305 |
| Fixed-point witnesses | 0.11126 |
| Index/discriminant evidence | 0.00056 |
| Serialization | 0.00325 |
| Cleanup | 0.00146 |

The tagged Round-2 phases account for only about 0.019 ms within order
construction. Its remaining cost still needs finer attribution; it includes
setup/conversion and untagged work, not a demonstrated single bottleneck.
The separate witness cost is consistent with the previously investigated
small-degree worker scheduling, but this profile alone does not establish how
much can be removed.

The analysis component is only about 12% of this instrumented native root.
Removing it entirely would therefore not close the several-fold public-call
gap. The finite analytic calculation, prime splitting, relation collection,
and remaining root work still matter. This ledger does not justify dropping
proofs, changing the public timing boundary, or calling one small local gain
a completed competitive frontier.

Next: subdivide the untagged order-construction cost, distinguish mathematical
work from representation/scheduling cost, and test a source-transparent or
declared-representation improvement against the unchanged exact checker.
