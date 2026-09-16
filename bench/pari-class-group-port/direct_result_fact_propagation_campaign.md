# Campaign: propagate enough facts to make copy calls direct

This document designs the fact-propagation campaign after the first three
proved direct-result `int64_pari_flx_copy` edges. It is based on the complete
37-edge classification in
[`copy_direct_result_edge_eligibility.md`](copy_direct_result_edge_eligibility.md)
and the frozen dynamic census in
[`copy_edge_causal_study.md`](copy_edge_causal_study.md). It proposes generic
compiler mechanisms only. No rule below may recognize a PARI function name,
a source line, or a frozen input.

The first three-edge milestone is the baseline for this plan, not evidence
that all remaining calls are safe. Those three edges represent 1,423 of the
65,366 four-packet calls. The remaining 34 static edges represent 63,943
calls. Dynamic counts rank engineering value; they are never proof authority.

## Coverage ledger

The existing edge partition remains useful after the first milestone:

| Remaining class | Static edges | Four-packet calls | Share of remaining calls |
| --- | ---: | ---: | ---: |
| Root known; degree or complete span missing | 13 | 10,932 | 17.10% |
| Nested directly under unsupported `while` | 13 | 37,331 | 58.38% |
| Ordinary edge after upstream context collapse | 6 | 15,676 | 24.52% |
| Degree proved, root/span missing | 2 | 4 | 0.01% |
| **Total** | **34** | **63,943** | **100%** |

Two calls in `int64_pari_flx_flxqv_eval`, totaling another 242 executions,
occur after coefficient-trimming `while` loops. They are classified in the
root-known row because the calls are not lexically inside the loops, but their
degree proof still needs loop reasoning. Thus mutable-`while` reasoning has a
direct surface of at least **15 edges and 37,573 calls**. If it also prevents
the six downstream whole-function context collapses, its transitive surface
is as high as **53,249 calls**, or 83.28% of the remaining dynamic calls.

The mechanisms compose. In particular, span reasoning without a degree bound
does not make a copy infallible, and a degree summary without authenticated
source and output spans does not make it infallible either. Counts below are
therefore affected surfaces, not additive promises.

## Two rankings

### By expected dynamic reach

1. **Mutable `while` induction and fixed points.** Directly affects at least
   37,573 calls and can transitively restore context for another 15,676. This
   is the dominant payoff and the dominant risk.
2. **Scalar return summaries.** At least 38,598 four-packet copy calls pass a
   degree that is syntactically a helper result or a variable updated from
   helper results. This includes quotient-ring square/multiply results,
   Euclidean remainders, squarefree degrees, and DDF quotient/GCD degrees.
   Some values pass through an `Int64Buffer`, so scalar summaries alone will
   not reach every one of these calls. The auditable breakdown is 3,494 DDF
   calls, 21,229 `flxq_powu` calls, 1,421 squarefree calls, and 12,454 GCD
   calls.
3. **Affine buffer-span facts.** Every one of the 34 remaining calls needs
   this proof eventually. It is immediately relevant to all 10,932 calls in
   the root-known class, but by itself unlocks none because those edges still
   lack a complete degree proof.
4. **Immutable `for` propagation.** Twelve root-known edges occur after or
   inside bounded `for` loops and account for 10,642 calls. Preserving root,
   length, and unaffected scalar facts is broadly useful, although mutable
   degree and affine-index facts remain necessary.
5. **Branch refinement.** Three copy edges are directly dominated by
   `components >= 0`; none happens to execute in the four frozen packets.
   Its direct measured payoff is therefore zero. It remains a cheap and
   essential prerequisite for success-path input guards and conditional
   workspace selection throughout the graph.

### By implementation risk, lowest first

1. **Preserve immutable facts through `for`.** Low risk: compute the loop's
   scalar and memory write set, retain facts not invalidated by that set, and
   give the induction variable the interval implied by `range`.
2. **Refine simple branches and successful guards.** Low to moderate risk:
   comparisons, conjunction/disjunction, and a raising branch have standard
   path-sensitive interval semantics.
3. **Infer scalar return summaries.** Moderate risk: summaries must be
   conditional on successful return, relational where useful, and computed
   to a call-graph fixed point without confusing checked failure with a
   returned value.
4. **Carry affine buffer spans.** Moderate to high risk: root identity,
   aliases, offsets, extents, conditional joins, and memory invalidation must
   agree. Unsound alias reasoning would remove real bounds checks.
5. **Infer mutable `while` invariants.** High risk: loop-carried values,
   breaks, data-dependent trimming, nested loops, and call-graph SCCs require
   widening followed by validation or narrowing. This must be split into
   bounded subproblems.

The recommended implementation order follows risk, not raw payoff. It gives
each later mechanism stronger inputs and makes failures attributable.

## Required fact language

The campaign should use one shared, name-independent fact representation.

### Scalar facts

Track signed/unsigned intervals, exact constants, and a deliberately small
relational vocabulary:

```text
result == parameter
result in [lo, hi]
result <= parameter + constant
result >= constant
```

Affine forms need only `constant + sum(coefficient * immutable_scalar)` with
small integer coefficients. Drop a relation at an unsupported nonlinear
operation rather than guessing.

### Buffer facts

Represent a bounded view as:

```text
(root allocation, affine start, extent interval, access mode)
```

The root carries a minimum or exact length. A span is valid only after proving
`0 <= start` and `start + extent <= root_length`, with checked arithmetic for
the proof calculation itself. Writes invalidate content facts for overlapping
regions, but do not invalidate root identity, length, or non-overlap facts.

This representation covers `scratch + 9*i`, fixed nine-word polynomial slots,
and conditional selection between two known slots without introducing a
polynomial-specific concept.

### Function summaries

For each successful private variant, summarize:

- scalar preconditions and successful-result relations;
- required and produced buffer spans;
- scalar and memory effects;
- possible failure effects; and
- whether all private callees are themselves infallible at a particular edge.

Summaries are edge-instantiated. They must not be intersected into one weak
whole-function entry state merely because another caller is unproved.

## Milestones

### P1: path refinement and immutable bounded `for`

Implement two intentionally small dataflow rules together:

1. On `if x < c`, `x <= c`, `x == c`, and their reversed forms, refine the
   true and false successor intervals. Extend this through short-circuit
   `and`/`or` only when each successor remains explicit.
2. A branch that always raises contributes no facts to the successful join.
   Thus `if x < lo or x > hi: raise` proves `lo <= x <= hi` afterward.
3. For `for i in range(start, stop, step)`, infer a conservative iterator
   interval and kill only facts affected by assignments or aliased writes in
   the body. Preserve root identities, buffer lengths, and immutable affine
   bases.

This stage should recover facts across initialization/clearing loops and
prove the true branch of `components >= 0`. It is not accepted merely because
the three unobserved component calls become eligible: the generated fact dump
must show that unaffected facts survive every relevant `for`, including zero
iteration paths.

**Risk:** low. **Immediate direct-result expectation:** small; this is an
enabling stage.

### P2: successful scalar return summaries

Infer summaries from all successful return sites, then join them. Begin with:

- exact returns and parameter identity, such as `return da`;
- bounded constants and clamped affine expressions;
- results selected by branches;
- results of already summarized private callees; and
- monotone bounds, even when exact equality is unavailable.

The join must retain facts true at every successful return while keeping
failure effects separate. Propagate summaries over the private call graph to
a fixed point, including SCCs. A call whose status is checked may consume the
successful-result summary on its success continuation; an unchecked or
possibly failing call may not silently acquire it.

The first useful target is a degree-producing chain that avoids mutable
`while`, followed by the DDF GCD/quotient chain. Metadata round trips require
a later or concurrent store-to-load fact; do not treat an arbitrary buffer
load as if it retained the callee summary.

The edge census should explicitly report which of the 38,598 helper-result
calls acquired `-1 <= degree <= 8`. This number is an attribution metric, not
an acceptance threshold.

**Risk:** moderate. **Dynamic surface:** at least 38,598 calls, jointly with
control and span facts.

### P3: affine span ownership through calls

Propagate buffer roots and affine spans through assignments, views, and
private calls. Required rules are:

1. derive a subspan from a proved parent span and an affine offset;
2. substitute caller affine arguments into callee span requirements;
3. join conditional slot choices by retaining a covering span or a finite
   disjunction of spans;
4. preserve root/length facts across coefficient writes;
5. invalidate content facts on possible overlap; and
6. reject a proof when checked affine endpoint arithmetic is not itself
   bounded.

After P2 and P3, re-evaluate the 13 root-known edges before attempting general
`while`. These 10,932 calls are the cleanest non-loop bridge from three direct
edges to a useful fraction of the graph. The two constant-`-1` calls in
`flx_mul` and `flx_rem` are a separate alias/root-regression test, although
their dynamic payoff is only four calls.

**Risk:** moderate to high. **Necessary surface:** all 63,943 remaining calls;
**near-term target:** the 10,932 root-known calls.

### P4: preserve immutable facts across unsupported `while`

Before inferring loop-carried values, replace the current empty context below
an unsupported `while` with a sound partial context:

- compute the transitive scalar and memory write set of the body;
- retain scalar facts for variables absent from that set;
- retain root identity and length even when buffer contents are written;
- retain disjointness only when no loop assignment can change either base;
  and
- do not retain the degree interval merely because frozen executions stayed
  small.

This should restore `w` and fixed workspace bases at the 13 nested edges. It
is accepted as a correctness/dataflow milestone even if it creates no new
direct-result edge by itself.

**Risk:** moderate. **Direct surface:** 37,331 calls, but degree proofs remain
for P5.

### P5: mutable `while` induction in three tiers

Do not start with an unrestricted abstract interpreter. Add tiers with
separate gates.

#### P5a: bounded monotone scalar loops

Handle loops such as coefficient trimming:

```text
while degree >= 0 and coefficient[degree] == 0:
    degree -= 1
```

From an entry interval `degree in [lo, hi]`, establish the invariant
`degree in [-1, hi]`, prove the decrement safe, and retain root/span facts.
This directly targets the two post-loop evaluation copies (242 calls) and
degree-normalization helpers used elsewhere.

#### P5b: counter loops with summarized calls

Handle countdown/window loops where the loop body assigns a bounded helper
result to `degree`. Compute a loop-header fixed point, widen only on growth,
then re-run the body to validate the candidate invariant. This targets the
seven `flxq_powu` loop edges, representing 20,939 calls.

#### P5c: Euclidean and `while True` state machines

Handle tuple-like degree transitions in GCD and nested squarefree loops,
including `break` successors. The invariant need not prove termination to
remove a copy check, but every reachable copy edge must prove its local
degree and spans. This tier targets six direct edges and 16,392 calls and may
also recover the six collapsed ordinary edges.

Any loop that fails to stabilize within a fixed analysis budget remains on
the checked ABI. Widening may lose optimization; it may never manufacture a
bound.

**Risk:** high. **Direct surface:** 37,573 calls including the two post-loop
evaluation calls; **possible transitive surface:** 53,249 calls.

## Suggested first nontrivial expansion

After the three-edge mechanism is stable, the next performance-bearing gate
should be:

1. P1 branch/`for` propagation;
2. enough of P2 to summarize non-loop degree helpers;
3. P3 affine spans; then
4. direct-result eligibility for a predeclared subset of root-known edges.

The subset should be selected from the static proof dump before timing. A
particularly useful candidate is `_int64_pari_flx_small_ddf:200`, which has
1,413 four-packet calls and uses the already guarded input degree with fixed
workspace slots. If its actual edge dump still lacks a different fact, record
that fact rather than weakening the gate or choosing an easier edge after
seeing timing.

This route produces a measurable fourth edge without making the high-risk
`while` analyzer the first dependency. It also tests that scalar and span
summaries compose with the already validated direct-result ABI.

## Acceptance and stopping rules

Every milestone must retain the ordinary checked public path and the checked
private path for unproved edges. Acceptance requires:

1. the frozen valid outputs and statuses agree exactly;
2. malformed, short-buffer, overlapping, and out-of-range cases still take
   the checked failure path;
3. generated source identifies each direct edge and its discharged proof
   obligations;
4. a static edge census accounts for all 37 calls with no implicit trust;
5. object evidence shows one direct copy core, no per-edge body clones, and no
   accidental wrapper proliferation;
6. text size, surviving symbols, and call counts are compared with the
   three-edge baseline; and
7. performance uses at least seven same-process alternating samples and is
   reported even when neutral or negative.

Reject or revise a milestone if it needs function-name policy, fixture-derived
bounds, an assertion in place of a fallback, or broad cloning. The Stage-F
result already showed that removing checks can lose overall when emission
duplicates bodies or changes inlining. Fact coverage and code shape therefore
remain independent gates.

## Recommendation

Build P1 through P3 first, aiming at a predeclared root-known fourth edge and
then the whole 10,932-call root-known class. In parallel design terms—but not
as an unsound shortcut—the largest eventual prize is P5: mutable-`while`
reasoning covers at least 58.76% of remaining calls directly and can unblock
83.28% transitively.

The campaign should stop being described as a copy optimization once these
mechanisms exist. Branch-refined successful summaries, affine owned spans,
and bounded loop invariants are general compiler infrastructure for HNF,
relation collection, modular polynomial arithmetic, and other native
number-theory kernels. `flx_copy` is simply the first fully enumerated proof
target.
