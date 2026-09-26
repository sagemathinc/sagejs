# Copy direct-result edge eligibility

This report refines the 37-edge census in
[`copy_edge_causal_study.md`](copy_edge_causal_study.md) for the stricter
direct-result question. It uses the fixed-point input facts visible to the
checked-region analyzer at compiler commit `670dda553` and the exact Stage-E/F
catalog artifacts. No compiler implementation file was changed.

## Result

Today **zero call edges are direct-result eligible**. Five edges prove the
Stage-F local scalar guard `-1 <= da <= 8`. Three of those also carry enough
root and start intervals to prove both nine-word spans mathematically. But the
emitted copy still contains two view-validation failures and three checked
range-latch additions. The present proof consumer removes neither class, so no
edge closes every reachable failure effect.

The distinction is:

| Eligibility level | Static edges | Packet-zero calls | Four-packet calls |
| --- | ---: | ---: | ---: |
| Proves `da in [-1,8]` | 5 | 1,234 | 1,427 |
| Also proves `w`, source span, and output span | 3 | 1,230 | 1,423 |
| Compiler proves every copy failure unreachable | 0 | 0 | 0 |

The three fact-complete edges are:

| Edge | Facts at edge | Packet-zero calls | Four-packet calls |
| --- | --- | ---: | ---: |
| `int64_pari_flxq_powu:167` | `len(w)>=393`, `a=121`, `da=1`, `out=130` | 0 | 0 |
| `int64_pari_flxq_powu:184` | `len(w)>=393`, `a=121`, `da=1`, `out=384` | 97 | 290 |
| `int64_pari_flxq_powu:243` | `len(w)>=393`, `a=121`, `da=1`, `out=339` | 1,133 | 1,133 |

The other two scalar-guard edges are `int64_pari_flx_mul:3` and
`int64_pari_flx_rem:7`. Both pass constant `da=-1`, but their caller entry
facts have already collapsed: neither `w` nor the output slot is
authenticated. Each executes twice on packet zero and across all four
packets.

## Exact edge classification

The following partitions all 37 static edges; there is no omitted residual
category.

### Full local precondition in current edge facts: 3

```text
int64_pari_flxq_powu:167
int64_pari_flxq_powu:184
int64_pari_flxq_powu:243
```

These prove the strong private precondition
`valid_span(w,a,9)`, `valid_span(w,out,9)`, and `-1<=da<=8` by combining the
393-word root minimum with exact start intervals.

### Scalar guard only: 2

```text
int64_pari_flx_mul:3
int64_pari_flx_rem:7
```

Both prove `da=-1`; both lack root and span facts.

### Root fact, but not degree and complete spans: 13

```text
_int64_pari_flx_small_ddf:137
_int64_pari_flx_small_ddf:200
_int64_pari_flx_small_ddf:221
_int64_pari_flx_small_ddf:225
_int64_pari_flx_small_ddf:232
_int64_pari_flx_small_ddf:250
_int64_pari_flx_small_ddf:276
_int64_pari_flx_small_ddf:297
int64_pari_flx_flxqv_eval:192
int64_pari_flx_flxqv_eval:260
int64_pari_flxq_powers:70
int64_pari_flxq_powu:207
int64_pari_flxq_powu:368
```

Some of these already have exact starts, so their spans follow from the root
minimum. They remain ineligible because their degree is a mutable value or a
callee result with no authenticated return interval. Others additionally miss
one start interval. `_int64_pari_flx_small_ddf:137` is inside a conditional
`components >= 0`; the analyzer does not refine that branch, so its merged
state cannot justify the output span even though the call is dominated by the
test.

### Ordinary edge after upstream fact collapse: 6

```text
int64_pari_flx_deflate:6
int64_pari_flx_gcd:11
int64_pari_flx_gcd:15
int64_pari_flx_gcd:44
_int64_pari_flx_divrem:44
int64_pari_flx_normalize:6
```

These operations are not themselves nested under unsupported control flow,
but their caller functions received an empty incoming context from at least
one upstream edge. Whole-function intersection therefore removed `w`, degree,
and span facts before these calls were analyzed.

### Nested under unsupported `while`: 13

```text
int64_pari_flxq_powu:193
int64_pari_flxq_powu:198
int64_pari_flxq_powu:311
int64_pari_flxq_powu:327
int64_pari_flxq_powu:336
int64_pari_flxq_powu:350
int64_pari_flxq_powu:360
int64_pari_flx_small_squarefree:75
int64_pari_flx_small_squarefree:107
int64_pari_flx_small_squarefree:109
int64_pari_flx_gcd:22
int64_pari_flx_gcd:34
int64_pari_flx_gcd:38
```

The analyzer intentionally records an empty call context for these. They
account for 32,569 of 55,903 packet-zero calls.

The detailed per-edge source lines, dynamic counts, and observed degree ranges
are in the preceding causal-study report.

## Remaining failure effects

Direct scalar return is sound only if every reachable copy failure is absent:

1. source and destination view construction must not raise;
2. both `da + 1` computations must not overflow;
3. five logical view indexes must be in range;
4. three range-latch additions must not overflow; and
5. all paths must return the declared scalar, here exactly `da`.

The Stage-F local interval clone proves items 2 and 3. Its static census
removes two checked arithmetic sites and five signed-index sites. It retains
the two view validations and the three latch checks, so its status ABI remains
semantically necessary even at the three fact-complete caller edges.

Given the strong precondition, the missing theorems are straightforward and
generic. All three ranges emit offsets in `[0,8]`; their post-body latches also
remain in signed 64-bit range. The result operation is the parameter `da` on
every return path. There are no calls, divisions, owned resources, or explicit
raises elsewhere in the copy body.

## Minimal extensions for the first direct-result calls

The smallest sound milestone should target the three already fact-complete
edges. It needs no new global invariant inference:

1. **Edge-local span derivation.** Convert `len(buffer)>=N` plus an exact or
   bounded start interval into `valid_span(buffer,start,L)` when
   `start>=0` and `start+L<=N`. Do this at the call edge rather than requiring
   a fact intersection at the callee entry.
2. **Call-edge precondition matching.** Match the callee's generic private
   contract against each caller state. Select a direct core only for proved
   edges; every other call remains on the checked status ABI.
3. **Post-final-latch proof.** For an authenticated bounded `range(int64)`,
   prove the final iterator update as well as emitted indexes. This removes
   the three remaining checked latch additions without trusting a copied
   source proof.
4. **Generic failure fixed point.** Mark a scalar private core infallible only
   after every local failure operation has proof authority and every callee is
   infallible. Infer `result == da` here as an ordinary scalar postcondition.
5. **Direct scalar call lowering.** Emit the infallible core with scalar return
   and rewrite only eligible private call edges. Preserve public and unproved
   checked implementations byte-for-byte.

This yields three static direct edges and 1,230 packet-zero direct calls. It is
a deliberately small validation of the direct-result machinery, not yet the
main performance payoff.

## Extensions needed to reach the remaining 34 edges

After the first milestone, expanding coverage requires generic dataflow work:

- preserve immutable buffer/root and scalar facts recursively through
  unsupported loops;
- refine simple comparison branches, especially nonnegative sentinel tests;
- infer scalar return intervals and relational results across private calls;
- carry affine workspace-span ownership through local arithmetic and calls;
- analyze mutable `while` degrees with a conservative induction/fixpoint; and
- avoid whole-function intersection when an edge-specialized direct core is
  sufficient.

The order matters. Root preservation alone does not authenticate a single new
direct-result edge because 32 edges still lack `da`; degree summaries alone do
not establish spans. Edge specialization prevents one obscure unproved call
from erasing useful facts at every hot proved call.

## Recommendation

Implement and validate direct-result lowering on the three existing
fact-complete `powu` edges first. Require generated-C and object-code evidence
that it introduces no wrapper, duplicate copy body, or new dispatch branch;
Stage F showed that an otherwise correct wrapper can lose 12.7% through code
layout and inlining changes.

If that shape is clean, add branch refinement and interprocedural degree/span
summaries to grow eligible edge coverage. Do not wait for a general `while`
fixed point before testing direct-result ABI mechanics, and do not globally
declare copy infallible from frozen observations: 34 static edges still lack a
complete proof.
