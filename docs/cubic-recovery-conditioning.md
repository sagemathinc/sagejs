# Cubic recovery: root reuse and dependency conditioning

Research checkpoint, 2026-09-09. No new PARI win or release qualification is
claimed. This separates a small production refactoring from a larger isolated
experiment. The [preceding experiment](cubic-resumable-shell-experiment.md)
contains the initial paired timings and frozen-corpus evidence.

Implementation/diagnostic commit: `91df1656b1299d400eaa1cd10d7a6170b3fe4e24`.
[Immutable evidence archive](https://github.com/sagemathinc/sagejs/releases/tag/cubic-recovery-conditioning-20260909):
`cubic-recovery-conditioning-20260909.tar.gz`, SHA-256
`842bc82736660b47caf6a86f02873d91bdeee3c3d39fa18dca83acc0b9c9c220`.
The inventory authenticates 120 files: raw surveys and replay, generated cores,
source variants, portable timing artifacts, drivers, and validation logs.
The archive is research evidence, not a Sage.js product release.

## Integrated root reuse

`_cubic_relation_prefix_has_archimedean_unit` now calls the existing
`_cubic_fill_dependency_logs` helper. The polynomial and dyadic scale are
constant within each log batch; one root enclosure therefore replaces repeated
identical root isolation. Each generator still uses the same interval arithmetic,
basis, denominator, and precision. Nothing is cached across batches. Invalid
root/log enclosures still fail, and partial-write behavior is regression-tested.
The mathematical argument is recorded in the
[class-group proof document](complex-cubic-native-class-group-proof.md).

Production Python SHA-256:
`905b57635a478db2252d9e4f139a6f66bb5cad767b0e2377759e870aa7ae868e`.
The file shrinks by 393 bytes to 437,668; its aggregate package occupies
484,287 of the unchanged 485,000-byte allowance. Resident/temporary arena
limits remain 1 MiB / 3 MiB.

The rebuilt production kernel has cache key
`af504651762b78652eebd38851d20780072c38e64e594c4717b85a667086ca0c`.
Its generated core is 17,553,014 bytes, SHA-256
`7cf9f0ae7e42c0d3b9fad02c48a89f91fdf6317d9131b557ade95802be31f906`;
the header is 9,513 bytes and host-adapter source 200,768 bytes. These are
source sizes, not resident-memory measurements. Focused poisoned-prefix and
checkpoint tests report peaks of 205,680 bytes on fmpz and 642,112 bytes on GMP;
these witnesses do not establish a general peak-memory bound.

The earlier isolated source-copy timings measure exactly this Python source,
but a different built artifact. They must not be described as new timings of
this production pack. The production refactoring does not include resumable
shell scheduling or the unreduced-basis experiment below.

The integrated runtime passes all 1,000 tune-field public native receipt
authentications and independent ordinary-object exact replays, checking class
numbers, invariants, and discriminants. Its runtime-content closure is checked
before and after each 250-field batch and remains unchanged. Report SHA-256:
`97aa9cdb5da71a3f5566d776e5063077f9c7d01d9865a0d5b04e91a44008cc5e`.
Runtime-closure SHA-256:
`c1568809c201c61dd56eb08257ce3473cd89baf9df312d5670f2d418a015195b`.
The run began at commit `052ec863ca360c0b1f07443af77f5bd3554abca6` with the
preserved `candidate.patch` (SHA-256
`950f8378fae5cf9cef8604e6e18e0296f3d735327f16047cd841fb4345b21e92`).
This identifies the dirty candidate explicitly rather than attributing its
results to the older clean commit. Later diagnostic/doc additions are not
part of that frozen patch. The replay is local correctness evidence with an
inherited environment, not a hermetic opt census or a performance measurement.

All seven native/public regression groups pass, including exact-backend and
sanitizer/checkpoint witnesses. The three focused root-reuse, instrumentation,
and unreduced-transform tests pass. Architecture, documentation, and strict
Python checks pass (382 strict modules, zero errors). The full build succeeds;
optional numerical reactors are skipped because their toolchain is absent,
not qualified by that build. The parallel gate still rejects the inherited
395-live-task metadata. The known unrelated modular-qexp source-freeze failure
has not been repaired or newly qualified here. No new full-unit, public-timing,
unseen-holdout, or four-platform qualification is claimed. PR #190 stays draft.

## Where recovery time goes

The profiled source is the isolated **resumable plus batched-log** program,
SHA-256 `64aa44ef9fb7628a74bf34038d92b6031d8411e3f36bdec729bc058a5954ba79`.
Generated-code instrumentation adds nested clocks and separate clocks around
the recovery HNF and LLL foreign calls. It is deliberately not a production
artifact or an uninstrumented timing result.

On `opt`, pinned to CPU 0, each run compares all 64 output slots against an
uninstrumented fixed-effort reference for 1,100 calls. The first 100 calls are
discarded. Exclusive durations sum exactly to the root's inclusive duration.
The driver records source/core/module/addon identities; timings include the
instrumentation overhead.

| Field | Instrumented total | Recovery LLL | Recovery HNF | Recovery calls |
| --- | ---: | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 5.796 ms | 0.812 ms | 0.066 ms | 1 |
| $x^3+27x-159$ | 5.091 ms | 0.412 ms | 0.058 ms | 3 |

The LLL/HNF columns sum all recovery calls per root call. Separate full
presentation preparation costs only about 0.010 / 0.012 ms in the preceding
broad profiles. It is not the next large optimization opportunity. Failure
for missing unit evidence occurs before BF analytic certification, so BF
is not work repeated by that failed closure.

The diagnostic builders are
`bench/class-unit-groups/diagnose-cubic-exclusive-clock-build.cjs` and
`diagnose-cubic-instrumented-core-run.cjs`. Instrumentation is generated into
a separate directory and rejected if the expected foreign boundaries cannot
be identified. It must never be installed as a production cache artifact.

## Why an unreduced dependency basis is mathematically interesting

Let $A\in\mathbb Z^{m\times n}$ be the exact relation matrix, with row $i$
expressing the principal ideal of an authenticated generator $\alpha_i$.
An exact unimodular row transformation $U$ satisfies $UA=H$. If $H$ has rank
$r$ and its final $m-r$ rows are zero, the corresponding rows of $U$ form a
$\mathbb Z$-basis of the left kernel of $A$: writing any row vector as $yU$
reduces the kernel equation to $yH=0$, and independence of the first $r$ rows
forces their coefficients to vanish.

For every such dependency $v$, the principal ideal of
$\prod_i\alpha_i^{v_i}$ is the unit ideal. The product is a unit. An invertible
integer change of dependency basis preserves the subgroup of units obtained.
LLL conditions the basis; it is not needed for this kernel-to-unit implication.
Neither basis alone proves that the resulting unit subgroup is the full unit
group, nor that the relation lattice is complete. The unchanged regulator and
analytic-index certification must still establish the required conclusion.

However, omitting LLL is **not** automatically a safe production optimization.
Unreduced coefficients can require more precision, exceed the 512-bit guard,
exhaust the arena, or obstruct reconstruction. The experiment retains every
existing coefficient/interval/reconstruction/certification check and fatal exit.
It does not reinterpret a fatal result as permission to continue searching.
A production policy may need staged conditioning with an explicit fallback;
the experiment does not establish such a policy.

`diagnose-cubic-unreduced-recovery-build.cjs` replaces only the recovery LLL
call with a logical-shape copy of the exact HNF dependency basis in a separate
source file. Its manifest explicitly permits acceptance outcomes to change.
The source-boundary test verifies that the rest of the helper, including all
coefficient and certification checks, remains byte-identical.
The resulting experimental source SHA-256 is
`a7737650759d3822ebcccb32b3932e4d19e3afb4043d7d6c8726681e91a87625`.
The logical-shape copy adds 207 source bytes to the isolated resumable variant;
it is not a source-compression result.

The frozen 1,012-field development survey retains all 961 acceptances of the
resumable-plus-log baseline, with no new acceptance, lost acceptance, or
exception. Every accepted class number and invariant agrees with the corpus.
Exactly three accepted transcripts differ, solely by simultaneous negation
of the three unit-coordinate slots (25--27); all other slots agree. These are
the same units modulo the torsion unit $-1$, not full byte equivalence.
This survey is not independent exact replay, public receipt qualification,
or evidence on the 20 reserved unseen neighbors.

## Controlled uninstrumented experiment

The same two standalone native artifacts were copied to `opt`. Seven rounds
alternate forward/reverse execution order, with 20 warmups, 64 native calls
per sample, and 256 fresh PARI `bnfinit(f,0)` calls per sample. The existing
native retry sequence remains 5, 1, 7, 8. Inputs and external scratch are
preallocated; this is not public API timing or certificate-replay timing.

| Polynomial | Resumable + batch logs | Without recovery LLL | PARI |
| --- | ---: | ---: | ---: |
| $x^3-x^2-7x+122$ | 5.125 ms | 4.313 ms | 1.539 ms |
| $x^3+27x-159$ | 4.519 ms | 4.088 ms | 1.496 ms |
| $x^3-x^2+56x+99$ | 4.773 ms | 4.453 ms | 1.500 ms |
| $x^3+146x-156$ | 5.286 ms | 4.848 ms | 1.691 ms |
| $x^3+9x-55$ | 1.812 ms | 1.821 ms | 1.191 ms |
| $x^3-x^2+3x-4$ | 1.291 ms | 1.305 ms | 1.008 ms |
| $x^3-x^2-11x-63$ | 2.200 ms | 2.207 ms | 1.227 ms |

These are medians of each implementation's samples. Median paired time ratios
without/with recovery LLL are respectively 0.8414, 0.9106, 0.9294, 0.9132,
1.0072, 1.0138, and 1.0027. Do not claim universal non-regression. All timed
class numbers and invariants agree; all implementations remain slower than
PARI on these workloads.

The target saves about 0.81 ms, consistent with the independent instrumented
attribution. This identifies useful avoidable work, not the whole remaining
gap. Adjacent relation collection still costs about 2.3 ms in the target's
broad instrumented profile. Next investigate staged dependency conditioning
with explicit failure semantics, and the relation-search work itself, rather
than optimizing the roughly 10-microsecond presentation refresh.

## An elementary exact negative certificate

There is a stronger mathematical option than simply trying an unreduced basis.
Let $K$ have signature $(1,1)$, let $\sigma$ be its real embedding, and let
$u\in\mathcal O_K^\times$. Then

$$
u\notin\{1,-1\}\quad\Longrightarrow\quad
\bigl|\log|\sigma(u)|\bigr|\geq\log(5/4)>1/5.
$$

Here is a direct proof requiring neither GRH nor an optimal regulator bound.
Replace $u$ by its negative and/or inverse so that $r=\sigma(u)>1$. If the
original absolute real embedding were exactly one, injectivity of $\sigma$
would already give $u=\pm1$. Write $z,\overline z$ for the other embeddings
of the adjusted unit. Its norm is the positive integer unit $1$, so
$|z|=r^{-1/2}\leq1$. The nonzero algebraic integer $u-1$ has nonzero integer
norm; hence

$$
1\leq N_{K/\mathbb Q}(u-1)
  =(r-1)|z-1|^2
  \leq4(r-1).
$$

Thus $r\geq5/4$. Finally,
$\log(5/4)=\int_1^{5/4}dt/t>\tfrac14\cdot\tfrac45=1/5$.
This proves the claim, including the sign/inversion cases.

Suppose authenticated exact principal relations and a certified integer kernel
basis give units $u_j$. If scaled outward log intervals $[L_j,U_j]$ with
positive scale $S$ satisfy

$$
-S\leq5L_j\leq5U_j\leq S
$$

for every basis vector, the claim proves every $u_j=\pm1$. Since the basis
spans the full integer kernel, every dependency of this relation set gives
only torsion. This is an exact negative certificate about the **current
relation set**, not a claim that the field lacks non-torsion units. No LLL
basis change can reveal a non-torsion unit from that same kernel.

This certificate needs only integer comparisons after the outward logarithms;
there is no numerical approximation to $\log(5/4)$ in its acceptance rule.
If any interval fails the test, the conclusion is **unknown**, not that its
unit is non-torsion. Invalid intervals, incomplete kernel information, or
unauthenticated principal equalities cannot authorize this conclusion.

The lemma and proposed certificate are written down here, but are **not yet
Lean-formalized or implemented as a production shortcut**. Next measure the
raw-basis log cost and the incidence of this certificate before designing its
staging and resource-failure behavior. This offers a justified early exit on
the previously observed all-torsion target prefix without hardcoding that
field or relying on PARI agreement.
