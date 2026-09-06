# Shared exact root isolation for complex cubics

The analytic logarithm, ideal embedding, and archimedean unit reconstruction
stages use the same source-transparent integer root isolator. Newton steps
accelerate the search but do not certify an approximation: exact polynomial
signs certify every returned interval. No floating-point operation, new
foreign primitive, precision reduction, or resource allowance is introduced.

## Contract and argument

Let $f(x)=x^3+bx^2+ax+c$ have negative discriminant and let $s>0$ be
the integer fixed-point scale. Thus $f$ has exactly one real root $r$.
Evaluate the integer polynomial

$$F(t)=s^3 f(t/s)=t^3+bs t^2+as^2t+cs^3.$$

The existing Cauchy bound initializes $L,U$ with $F(L)<0<F(U)$; the
implementation checks these signs explicitly. Uniqueness of the real root
implies that a negative value lies to its left and a positive value to its
right, even when $f$ is not monotone on the whole real line.

At each iteration choose the endpoint $t$ with smaller $|F(t)|$ and, when
$F'(t)\ne0$, propose $t-\lfloor F(t)/F'(t)\rfloor$. Accept a proposal
only strictly inside $(L,U)$, and replace the corresponding endpoint only
after evaluating its exact sign. A zero gives the exact root. Test the
adjacent integer on the root-facing side as well: opposite signs certify
the unique unit-width interval immediately. These tests cannot leave the
original bracket because the proposal is an interior integer.

If the accepted proposal has not reduced the width by at least half,
perform ordinary integer bisection of the remaining bracket. Thus each
nonterminating iteration changes width $w$ to at most $\lceil w/2\rceil$.
Keep the existing 1,024-iteration cap and return the invalid-interval sentinel
if the final width still exceeds one. No assumed convergence rate of Newton's
method participates in correctness or termination.

For nonintegral $sr$, the only possible successful interval is
$[\lfloor sr\rfloor,\lceil sr\rceil]$. For integral $sr$, exact evaluation
returns $[sr,sr]$. Consequently successful outputs agree with ordinary
bisection wherever that earlier bounded search succeeds. Faster convergence
may certify some inputs whose earlier search exhausted its iteration budget;
this is not permission to increase memory or precision limits.

## Consumers and authority

The complex embedding helper now calls the shared isolator instead of
duplicating its loop. Unit reconstruction retains its initial bracket checks
to preserve the distinction between failure codes 10 and 11, then calls the
shared isolator. All subsequent rounding, exact unit authentication, and
analytic stopping conditions are unchanged. Root approximation alone does
not prove a unit or a class group.

## Validation scope

The focused test compares CPython, JavaScript, tagged integers, GMP, and
automatic native execution against independent integer bisection, and checks
the exact endpoint signs. It includes negative-discriminant cubics with
nonmonotone derivatives, exact roots, large coefficient imbalance, multiple
fixed-point scales, and invalid scales.

Before integration qualification, an experimental complete native closure
matched all 64 output slots on 1,012 frozen survey/control inputs: 940
successes, 72 matching declines, and no exceptions. This is differential
evidence, **not independent class-group replay or a public performance claim**.
The subsequent local production-pack run passed all eight focused/public
tests, including authenticated receipts, independent exact replay, pinned
nontrivial fields, large units, and exhaustion/reuse. The standalone root
regression made 2,492 exact comparisons per execution backend and CPython.
Strict Python and architecture checks passed. `parallel:check` could not
select a task in this non-lane worktree because the inherited registry has
395 live tasks; no unrelated task contracts were changed.

With the same absolute source path, generated C changes from 17,399,276 to
17,395,261 bytes; the Linux x64 addon remains 20,382,480 bytes. There are still
105 functions and 22 host-callable entries, with 245 rather than 244 call
edges. Source text changes from 433,750 to 434,340 bytes. The shorter temporary
experiment path produces a much smaller C file merely because diagnostic
paths appear thousands of times; it is not a code-size improvement.

Serialized, CPU-pinned alternating whole-native diagnostics on `opt` measured
2.787 to 2.647 ms on the selected target (about 5% improvement), and about
15% improvement on two resumed-certification examples. Four warmup rounds
were discarded, followed by fifteen alternating rounds of ten calls. All
64 output slots agreed. These are native diagnostics, not retained public-call
timings or a PARI win. Raw results are in the
[census and follow-up diagnostic release](https://github.com/sagemathinc/sagejs/releases/tag/cubic-frontier-census-bbe1d2ca3-20260906).
The successful 1,000-field public census is pinned to the earlier
constant-compression commit and does not qualify this follow-up candidate.
Full public census and retained timing qualification remain required.
