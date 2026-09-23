# Stage G2 fourth-edge proof frontier

## Scope and result

This is a read-only analysis of the predeclared fourth direct-result call
`_int64_pari_flx_small_ddf:200` against compiler commit `c085e4b2a` and the
Stage G2 catalog artifact `/tmp/sagejs-stage-a-catalog-hF0oNK`. No compiler
implementation or mathematical source was changed.

The smallest sufficient state at entry to the private
`_int64_pari_flx_small_ddf` clone is:

```text
len(w) >= 393
t       in [81, 108]
dt      in [0, 4]
scratch == 121
```

The current analyzer already derives `tr == 211` from `scratch + 90`. Those
facts prove the two nine-word copy views (`t..t+8` and `211..219`) and the
local direct-copy guard `-1 <= dt <= 8`. Thus **no new theorem is needed in
`int64_pari_flx_copy` or in direct-result lowering**. The missing proof is
upstream: a successful result/content summary for squarefree decomposition,
followed by ordinary bounded-loop and affine fact propagation.

A temporary in-memory audit seeded exactly this entry state (without changing
the compiler tree). At edge 200, c085 then reported:

```text
w   buffer minimum 393
t   interval [81,108]
dt  interval [0,4]
tr  interval [211,211]
```

The seeded audit is `/tmp/c085-edge200-seeded-audit.json`; the unseeded audit
is `/tmp/c085-copy-edge-audit.json`. This is a sufficiency experiment, not a
proof that the seed follows from the program.

## Current edge facts

The unseeded c085 facts at the call are:

| argument | current fact | required fact |
| --- | --- | --- |
| `w` | minimum length 393 | already sufficient |
| `t` | unknown | any interval inside `[0,384]`; actual `[81,108]` |
| `dt` | unknown | subset of `[-1,8]`; actual successful input `[0,4]` |
| `tr` | exactly 211 | already sufficient |

Frozen execution is consistent with, but does not authorize, the proof:
edge 200 executed 1,228 times in packet zero with `dt == 3`, and 1,413 times
over all four packets with `dt in [2,4]`. Adding it to G2 would raise the
direct-copy coverage from 1,423 to 2,836 four-packet calls (2.18x), or from
2.18% to 4.34% of all 65,366 profiled copy calls. The Stage G2 0.957% timing
gain makes this a material experiment, but it is not valid to extrapolate a
specific timing gain before measuring code layout and inlining again.

## Exact source dependency chain

The catalog entry authenticates degree `2..4`, a 393-word workspace, and the
other public spans. In the relevant successful path:

1. `int64_pari_flx_small_degfact` uses workspace base 9, hence
   `layers == 81`, `layer_degrees == 117`, and `work == 121`.
2. `int64_pari_flx_small_squarefree` initializes the four degree entries and
   four nine-word layer slots, returns `last <= 4`, and leaves each relevant
   degree entry in the small polynomial-degree corridor.
3. `for i in range(last)` therefore has `i in [0,3]`.
4. `layers + i * 9` is in `[81,108]`, while
   `metadata[layer_degrees + i]` is in `[0,4]` (the weaker `[-1,4]` also
   suffices for the copy contract).
5. `int64_pari_flx_small_ddf` forwards those values unchanged to
   `_int64_pari_flx_small_ddf`.
6. At operation 200, `tr == work + 90 == 211`; the direct-copy contract is
   completely discharged.

The important subtlety is step 2. A scalar return summary alone proves the
loop index and hence `t`, but it cannot bound the metadata load that becomes
`dt`. Conversely a metadata element bound without `last <= 4` cannot prove
the affine source span. Both postconditions are required.

## Smallest generic dataflow extension

The minimal static solution has four pieces. They are generic; none mentions
a PARI function or polynomial representation.

### 1. Successful scalar result summaries

Represent and instantiate a summary of the form

```text
on successful return: result in [0, parameter(degree)]
```

For this corridor, substitution gives `last in [0,4]`. Failure/raise exits
must not contribute a result fact. The summary must attach to the status
success continuation, not to an unchecked call.

### 2. Bounded buffer-content postconditions

Represent a successful memory effect independently of allocation/spans:

```text
elements(metadata, layer_degrees, 4) in [-1,4]
```

An equivalent stronger summary using `[0,4]` is valid but unnecessary for
copy eligibility. At a load, substitute an index interval proved to lie in
the summarized segment and assign the element interval to the scalar result.
Any overlapping unknown write or aliasing call invalidates the content fact;
root identity and allocation length remain valid.

The first implementation may accept an authenticated, separately verified
private postcondition for squarefree. Fully inferring it requires reasoning
about its nested `while True` state machine and is not the smallest route to
this experiment. An assertion or fixture-derived bound is not acceptable.

### 3. Summary instantiation through a bounded `for`

c085 already computes intervals for nonmutated `range(int64)` indices and
intervals for `add`/`mul`. Extend this with indexed content lookup:

```text
last in [0,4]
i in range(last)        => i in [0,3]
layer_degrees+i         => [117,120]
load metadata[...]      => [-1,4]
layers+i*9              => [81,108]
```

Zero iterations are harmless: no call edge is executed, so no fact is
needed for that path.

### 4. Preserve the instantiated facts through the forwarding wrapper

The existing native-call argument mapper already transfers scalar intervals
and the root minimum by parameter position. Once steps 1--3 populate the
caller state, no new wrapper-specific rule should be necessary. A regression
test must nevertheless assert that `t`, `dt`, and `w` arrive unchanged at the
private `_ddf` clone rather than being intersected away by an unrelated
caller.

This is smaller than general mutable-loop fixed-point inference, general
polyhedral analysis, or a new copy optimization. A generic edge-local guarded
dispatch could be smaller in implementation—check `t`, `dt`, and the two
spans at runtime, then choose direct or checked copy—but that would test a
runtime specialization mechanism, not whether the compiler can recover the
real catalog proof. It should be retained only as a separately measured
fallback design.

## c085 correctness defect exposed by the new facts

Seeding the missing intervals exposed two latent null-check defects in
`refineConditionState`:

```javascript
left !== undefined && right?.minimum === right?.maximum
right !== undefined && left?.minimum === left?.maximum
```

When the optional operand is absent, both optional values are `undefined`,
so the equality is true and the next statement dereferences `undefined`.
The required fixes are explicit definedness tests before comparing endpoints.
Sparse current facts hide the bug; the seeded target facts trigger a
`TypeError` at c085 lines 1022/1025. The temporary audit locally patched only
those two predicates in memory so it could complete. This must be corrected
and tested before adding richer summary facts.

## Concrete theorem and regression specifications

1. **Successful-return interval.** A helper with returns in `[0,n]` and a
   raising arm gives the call target `[0,n]` only on success. A failing call,
   missing return, or one return outside the interval rejects the summary.
2. **Indexed postcondition load.** A summary covering `base..base+3` gives a
   load interval only when the load index is proved in that segment. Test the
   lower and upper endpoints and reject `base-1`, `base+4`, arithmetic
   overflow, an overlapping store, and an unknown aliasing call.
3. **Affine slot theorem.** From `base == 81`, `i in [0,3]`, stride 9, and
   `len(w)>=393`, prove a nine-word span at `base+9*i`. Reject negative stride,
   a mutable bound, overflow, and `i` widened to 34 or more.
4. **Wrapper forwarding.** A one-line private wrapper preserves the root,
   scalar intervals, and affine start. An extra unproved caller must not erase
   an eligible edge; either specialize by call context or leave only that
   caller on the checked variant.
5. **Fourth-edge census.** The frozen catalog must contain exactly the three
   existing G2 direct calls plus `_int64_pari_flx_small_ddf:200`; every other
   copy stays checked. Valid, malformed, overlap, and short-buffer replay must
   remain byte-for-byte identical.
6. **Null-safe branch refinement.** Exercise comparisons with facts for only
   the left operand, only the right operand, both, and neither. No case may
   throw in the analyzer; refinement occurs only with one known singleton
   operand and a known interval for the other.
7. **Failure preservation.** Corrupt or omit the squarefree postcondition and
   assert that edge 200 reverts to checked copy, never to an unconditional
   direct call.

## Next highest-payoff non-`while` edges

The ranking below excludes the three existing G2 direct calls, edge 200, and
calls lexically nested under unsupported `while`. Counts are exact frozen
profile counts; facts are from `/tmp/c085-copy-edge-audit.json`.

| rank | edge | packet 0 | four packets | current missing proof |
| ---: | --- | ---: | ---: | --- |
| 1 | `int64_pari_flx_gcd:11` | 3,687 | 4,496 | all root/start/degree facts lost at the multi-context GCD entry |
| 2 | `int64_pari_flx_gcd:15` | 3,687 | 4,496 | same; second initial operand and `scratch+9` |
| 3 | `_int64_pari_flx_divrem:44` | 2,625 | 3,013 | entry context, `da` interval, and source/output spans |
| 4 | `int64_pari_flxq_powers:70` | 2,456 | 2,826 | `w>=393`, source 130, and output `[148,166]` already known; only `da` is absent |
| 5 | `int64_pari_flx_gcd:44` | 1,644 | 1,979 | post-loop `da` plus entry/root spans; call is after, not inside, the loop |
| 6 | `int64_pari_flx_normalize:6` | 1,449 | 1,692 | multi-context entry facts; copy is the monic fast return |
| 7 | `_int64_pari_flx_small_ddf:232` | 1,228 | 1,534 | `du` result summary and affine `factors+9*j` output span |
| 8 | `_int64_pari_flx_small_ddf:250` | 1,228 | 1,534 | prior-loop metadata content fact for degree and affine factor-slot source |
| 9 | `int64_pari_flxq_powu:368` | 1,133 | 1,133 | root, source 384, and output 130 known; only post-loop `degree` is absent |
| 10 | `_int64_pari_flx_small_ddf:221` | 821 | 980 | root and starts 283/247 known; only normalized `du` summary is absent |

`_int64_pari_flx_small_ddf:225` ties rank 10 at 980 four-packet calls
(821 in packet zero); it has exact starts 256/211 and lacks only the quotient
degree `dtr` summary.

These ten edges total 23,683 calls, 36.23% of all profiled copy calls. Dynamic
rank is not implementation order. The cheapest likely extensions after edge
200 are `powers:70`, `ddf:221`, `ddf:225`, and possibly `powu:368`: their root
and starts are already proved, so scalar return/loop summaries can finish
them. The two GCD entry copies have the largest counts but require generic
edge-context specialization so weak callers do not collapse the whole
function state. The final GCD copy and `powu:368` additionally require a
sound post-`while` invariant even though the copy operations themselves are
outside the loops.

## Recommendation

Implement this frontier in three independently gated steps:

1. fix and test null-safe comparison refinement;
2. add successful scalar plus bounded-buffer postconditions, using an
   authenticated squarefree summary if necessary; and
3. instantiate those facts through the existing bounded-range/affine engine
   and require exactly four direct calls in the frozen catalog.

Then rerun the full Stage G2 correctness, code-shape, and same-process timing
protocol. If authenticated postconditions cannot be verified without a large
general `while` analysis, measure the generic edge-local guard alternative
explicitly rather than silently treating observed degrees as proof.
