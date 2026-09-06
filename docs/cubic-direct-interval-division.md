# Direct outward interval division

The resident cubic certificate repeatedly divides dyadic intervals by positive
dyadic intervals. Computing a rounded reciprocal first does unnecessary work
and introduces a second source of enclosure width. This change computes the
exact quotient extrema directly. It is ordinary typed Python; no new native
primitive, precision reduction, host call, or memory allowance is introduced.

## Argument

Let $s>0$, $a\le b$, and $0<c\le d$ be integers. The represented intervals
are $A=[a/s,b/s]$ and $B=[c/s,d/s]$. Since the denominator is positive,
$x/y$ is increasing in $x$. For fixed positive $x$ it is decreasing in $y$;
for fixed negative $x$ it is increasing in $y$. Consequently the sharp
outward dyadic enclosure of $A/B$ has integer endpoints

$$
L=\left\lfloor\frac{as}{d_a}\right\rfloor,
\qquad
U=\left\lceil\frac{bs}{d_b}\right\rceil,
$$

where $d_a=d$ if $a\ge0$ and $d_a=c$ otherwise, while $d_b=c$ if $b\ge0$
and $d_b=d$ otherwise. Zero endpoints work with either denominator. This
covers positive, negative, and zero-crossing numerator intervals.

The former implementation encloses $1/B$ by rounding $s^2/d$ downward and
$s^2/c$ upward, then encloses the product with $A$. It therefore contains the
true quotient. The direct enclosure is the smallest containing interval on
the same dyadic grid, so it is contained in that former enclosure. Its
denominator guard retains the existing invalid-interval sentinel $(1,0)$.
Ordered numerator endpoints and positive scale remain caller preconditions.

This does not weaken the GRH contract, generator theorem, exact principal
relations, reconstructed unit checks, or analytic index-one stopping rule.
Tighter intermediate intervals can change later scheduling near a boundary;
the helper's enclosure theorem, not equality of old endpoints, justifies that
possibility. Independent certificate replay must still pass.

## Evidence and scope

The diagnostic prototype changes only this helper on `0ad63e092`. Its source
SHA-256 is `3bdaadb8483eecd9a6eba579818ccdcc1381199993856d2861abdf25663821d1`;
cache key `b6bac32248126df9563f73367fa9bdb182a2cb41af97e02fe6a2cd514d7f09b2`.
These identities are not the integrated source identity, which adds the
explanatory docstring and regression test.

An independent four-corner rational oracle checks 19,139 cases on generated
JavaScript, tagged integers, GMP, automatic native dispatch, and CPython's
`Fraction`. Tests include negative and crossing numerators, exact endpoints,
invalid denominators, non-power-of-two scales, and inputs through 1,024 bits.
Every result is the sharp outward interval; 9,001 cases are strictly tighter
than reciprocal-then-product rounding.

The fixed-effort 1,012-field diagnostic retains all 948 accepted cases and
64 declines, with no exceptions or changed class numbers/invariants. Only
the five analytic endpoint/tail output slots change. All accepted new zeta
and index intervals are contained in the old intervals, and the tail upper
bound does not increase. This direct-kernel survey is not a public replay.

An uncontrolled local alternating pilot on five existing development fields
observes roughly 2--7% smaller native medians. The provisional target
`3.1.12716.2` changes from 2.398 to 2.312 ms. These are exploratory local
native timings, not controlled `opt` results, public-call timings, or a PARI
win. The stored-plan-index experiment is separate and is not included here.

The integrated Python source SHA-256 is
`ced9ca6ae8890b030c92c907ee4987fb55a0f1b797bc90248a3213c4a193db7d`;
its production cache is
`6c2bd167d40af38bff17dbd0ed7ec2a619402003ac1b30333458567f5aabd13b`.
The same-path Linux build retains 106 functions, 22 host entries and ABI 23,
while removing one direct-call edge (246 to 245). Core C grows from
17,437,098 to 17,447,843 bytes; the host adapter and header remain 200,768
and 9,513 bytes. The standalone native binary remains 20,390,672 bytes.
Neither generated-code shrinkage nor a resource-budget increase is claimed.

The integrated eight-stage build, strict Python checks, architecture check,
and documentation check pass. All eleven focused cubic tests pass, including
authenticated public receipts, independent exact replay, large regulators,
the pinned nontrivial corpus, resource declines, and the arithmetic oracle.
The closure test now explicitly checks the removed direct-call edge rather
than retaining its obsolete count.

The broader `test:changed` invocation completed its build but stopped at the
then-stale optimizer manifest. That manifest was regenerated and the
architecture check rerun successfully; the wrapper's remaining Wasm/all-CLI
suite was not completed. The inherited parallel-task registry ambiguity also
remains. Neither is presented as a passed qualification gate.

The integrated commit `47a7db45171feb07af113ea2297c007033774684` also passes
the additional local 1,000-field public replay: all native receipts authenticate,
all independent exact replays pass, and class numbers and invariants agree
with LMFDB and the saved PARI census. Source and HEAD were checked unchanged
on completion. The report SHA-256 is
`0614b68349ac0e99d875747d96735276c17db909fc1cf5b384af71b42b07b692`.
[The immutable evidence archive](https://github.com/sagemathinc/sagejs/releases/tag/cubic-public-replay-47a7db451-20260906)
has SHA-256 `220becdd122b8448f7b41260b08cd56d22f2491f749c8abbd64fd6c83a2ff0b8`.
This is not a retained `opt` census or performance qualification. Controlled
current-source performance evidence remains required.
