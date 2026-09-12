# Detached BDF generation and conditional completeness

`export_conditional_class_unit(source, generation_theorem="bdf")` and the
existing `replay_conditional_class_unit(text)` compose exact component replay,
fresh BDF factor-base generation and fresh Belabas--Friedman analytic-index
verification. They use the same bounded decoder and analytic proof owner as
the Minkowski-only adapter. No producer callback, cached bound, serialized
"rigor" flag or trusted hash grants mathematical authority.

The default export remains `generation_theorem="minkowski"` and emits the
documented v1 envelope. The new v2 format is explicitly conditional on two
named hypotheses. It does not silently give v1 inputs a stronger assumption.

## Format and hypotheses

Generation v2 has exactly `schema`, `field_order`, `factor_base`, `theorem`,
`assumptions`, `claimed_bound` and `content_sha256`. Its schema is
`sagejs.number-fields/class-unit-generation-v2`; this version accepts only
`theorem="bdf"` and the canonical one-element list containing
`BDF_CLASS_CHARACTER_GRH`. The claimed integer bound must be at least two and
at most 1000. The claim is checked against a freshly recomputed bound; it
never limits enumeration. Seals follow the existing sorted-key, compact ASCII
JSON SHA-256 convention and detect corruption, not correctness.

Completion v2 adds `assumptions` to the existing outer completion keys and
requires the v2 generation envelope. Its schema is
`sagejs.number-fields/class-unit-conditional-completion-v2`. The assumptions
are the canonical sorted union of `BDF_CLASS_CHARACTER_GRH` and
`BELABAS_FRIEDMAN_ZETA_GRH`, respectively class-character L-function GRH and
the GRH hypothesis for the Dedekind zeta functions of $K$ and $\mathbb Q$.
Missing, duplicated, reordered, renamed or weakened assumptions are rejected
before field construction. V1 requires generation v1; cross-version splicing
is rejected even after every digest is recomputed.

`compact-bf-index-v1` is unchanged: it already binds the component and
generation digests, the analytic configuration and the claimed proof. The
receiver still derives $H$ from the verified relation presentation and
recomputes the regulator and analytic index on its own exact field/order/unit
objects, with no retained analytic workspace.

## Mathematical argument

The existing BDF service evaluates Corollary 2.2, equation (10), derived from
Theorem 2.1 of Belabas--Diaz y Diaz--Friedman,
[Small generators of the ideal class group](https://www.math.u-bordeaux.fr/~kbelabas/research/OnBach.pdf)
(Mathematics of Computation 77 (2008), 1185–1197), using rigorous rational intervals and fresh
prime splitting data. Numerical hints select search candidates only. A hint
cannot certify the inequality, and finite-precision indecision cannot grant
generation. The published theorem gives generation by prime ideals of norm
strictly less than $T$. The existing exact prime stream conservatively checks
all nontrivial prime ideals of norm at most the certified integer $T$.
Unramified inert singleton ideals are principal and may be omitted; ramified
singletons remain. Every required ideal must be present exactly in the
decoded submitted base; extra valid primes are harmless.

Under the stated generation hypothesis, exact relation rows give a finite
quotient of order $H$ divisible by the class number $h$. Full-rank units with
all torsion give regulator $R'=i_U R$ for a positive integer unit index $i_U$.
The existing BF verifier encloses the positive integer

$$
\frac{HR'}{hR}=\frac{H}{h}i_U.
$$

Only an enclosure identifying it as one proves both the complete relation
lattice and fundamental units, conditional on the union of the two theorem
hypotheses. The generation report alone always has `complete=false`; it is
not a class/unit certificate or a live map/context token.

## Limits and qualification

No arithmetic limit is raised. Generation remains degree 2–10, bound and
rational primes at most 1000, at most 128 input/required ideals and 16 MiB
estimated plan-record memory. Completion retains degree at most four, 32
factor-base primes, 128 relations, 32-bit defining coefficients, 128-bit
discriminants and the existing compact-product limits. The existing analytic
precision, prime and refinement ceilings remain the sole analytic policy.

A failure to find a BDF bound within 1000 propagates the existing descriptive
`ValueError`; inability to separate its rigorous intervals propagates
`ArithmeticError`. These are bounded search/precision declines, not evidence
that the theorem is false or that a factor base does not generate. They are
not broadly caught or disguised as missing-prime reports. Actual missing
coverage returns `missing-coverage`; infeasible plan estimates and the adapter's
required-count check keep the existing `resource-limit` report. Actual prime
stream count or retained-record memory overflow propagates the owning service's
descriptive `ValueError` without a partial coverage report. Untrusted replay still needs
external time and memory supervision; arithmetic caps are not RSS guarantees.

The focused positive fixtures are the real cubic $x^3-x^2-34x-57$, with
class group $C_2\times C_2$, and the mixed quartic $x^4-x^2-10$, with class
group $C_2$. Their BDF bounds are 19 and 16, compared with Minkowski bounds
41 and 61. Both have unit rank two and previously failed detached Minkowski
coverage. The fixtures also require actual analytic index two after squaring
one unit; malformed proof claims alone are not sufficient rejection tests.
Existing v1 rank-three and proper relation-sublattice controls remain required.
These small cases do not qualify the expensive bridge panel or establish a
competitive performance claim. Source/generated-code accounting and full
integration/platform qualification are separate release obligations.

## Implementation evidence, 2026-09-12

The focused thirteen-test replay suite passes, including both nontrivial
rank-two positives, actual index two after squaring a unit in each field,
the existing rank-three control, and a proper relation sublattice of index
eight. Producer discovery, expansion, retained analytic workspaces and live
certificate callbacks are disabled during the fresh completion checks.
Strict checking of the two changed modules also passes. These are developer
host correctness runs, not controlled competitor measurements.

The first new test run failed before mathematics at a `type(K).attribute`
assignment parser limitation and at an eager-import violation of the existing
malformed-input guard. The test now binds the class to a local variable, and
the hypothesis import is lazy; the old cold-import guard is unchanged. A
subsequent combined test reached its 300-second cap. Phase diagnostics showed
successful positive replay of both fields but excessive adversarial test work.
The squared-unit test now requests log-residue radius `1/8`, not `1/64`, and
still requires the actual rigorous interval decision to be uniquely two.
This changes neither production precision policy nor the acceptance criterion.
The final focused suite passed in 220.43 seconds under the unchanged cap.

Fresh canonical lazy-module generation, using compiler SHA-256
`6b62435f11238dadf1f23b6aa002400c1f7d15ad185a4ab079824d6f373b3b56`,
measured the following. The normalization is exactly the packaged
`canonicalizeJavascriptTemplate` boundary, not JSON cache-envelope size.

| Source | Python bytes | Canonical JavaScript bytes |
| --- | ---: | ---: |
| `class_unit_replay.py` | 26,906 | 175,902 |
| `class_unit_generation_replay.py` | 6,637 | 39,636 |
| `_class_unit_replay_data.py` | 6,623 | 65,717 |
| Total | 40,166 | 281,255 |

Relative to the shared-data factoring baseline this adds 3,628 Python bytes
and 15,799 canonical JavaScript bytes. No native core/object or foreign export
is added. Existing native arena and analytic work limits are unchanged;
fresh integrated build time, peak memory and platform qualification remain
pending. The earlier 739.77-second implementation build predates the lazy
import fix and is not claimed as the final source's build receipt.

Package ownership/strict registration for the new replay modules and explicit
source-inventory review belong to the integration lane. The standalone
architecture check still fails that pending package integration; this branch
does not relocate modules or raise an allowance to hide it. The source and
generated-byte measurements above inform that review, not a passing release
gate. All earlier failures remain retained in the campaign evidence.
