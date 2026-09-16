# Copy-edge causal study

This study uses compiler commit `2d22ea208` and the exact Stage-E artifact
`/tmp/sagejs-stage-a-catalog-aFllaE`. It is diagnostic only: the compiler and
Python algorithm were not changed. A disposable generated-C copy recorded the
degree and both nine-slot spans at every static call edge, then reproduced all
four frozen outputs exactly.

## Summary

There are 37 static calls to `int64_pari_flx_copy`. Thirteen occur below an
unsupported `while`; the current analyzer deliberately contributes an empty
fact set for those calls. The other 24 are visited normally.

On frozen packet zero:

- the 37 edges execute 55,903 calls;
- unsupported-loop edges account for 32,569 calls (58.26%);
- ordinary analyzed edges account for 23,334 calls;
- every call has `da` in `[-1, 8]` and valid source/output nine-slot spans;
- the degree histogram is `-1: 1,644`, `0: 5,390`, `1: 12,158`,
  `2: 29,043`, `3: 7,668`; and
- only five static edges, representing 1,234 calls (2.21%), carry an existing
  proof that `da` is in `[-1, 8]`.

Across all four frozen packets there are 65,366 calls, again with zero degree
or span failures. Five static edges are not exercised by those packets; their
correctness therefore rests on source reasoning, not dynamic evidence.

## Static edge census

`W` means the existing analyzer carries `len(w) >= 393` to the edge. `D`
means it carries `da in [-1, 8]`. No edge currently carries both source and
output span validity, so the span column is uniformly absent. Dynamic degree
ranges and calls below are for all four frozen packets.

| Caller:operation | Line | Degree argument | Control | Existing | Calls | Observed degree |
| --- | ---: | --- | --- | --- | ---: | --- |
| `_int64_pari_flx_small_ddf:137` | 364 | `dt` | ordinary | W | 0 | unobserved |
| `_int64_pari_flx_small_ddf:200` | 404 | `dt` | ordinary | W | 1,413 | 2..4 |
| `_int64_pari_flx_small_ddf:221` | 413 | `du` | ordinary | W | 980 | 1..4 |
| `_int64_pari_flx_small_ddf:225` | 417 | `dtr` | ordinary | W | 980 | 0..3 |
| `_int64_pari_flx_small_ddf:232` | 418 | `du` | ordinary | W | 1,534 | 0..4 |
| `_int64_pari_flx_small_ddf:250` | 423 | expression | ordinary | W | 1,534 | 0..4 |
| `_int64_pari_flx_small_ddf:276` | 436 | `du` | ordinary | W | 0 | unobserved |
| `_int64_pari_flx_small_ddf:297` | 443 | `dtr` | ordinary | W | 0 | unobserved |
| `int64_pari_flx_flxqv_eval:192` | 418 | `degree` | ordinary | W | 121 | 1..3 |
| `int64_pari_flx_flxqv_eval:260` | 451 | `degree` | ordinary | W | 121 | 1..3 |
| `int64_pari_flxq_powers:70` | 320 | `da` | ordinary | W | 2,826 | 1..3 |
| `int64_pari_flxq_powu:167` | 166 | `da` | ordinary | W,D | 0 | unobserved; proved 1 |
| `int64_pari_flxq_powu:184` | 173 | `da` | ordinary | W,D | 290 | 1 |
| `int64_pari_flxq_powu:193` | 180 | `degree` | unsupported `while` | none | 1,816 | -1..3 |
| `int64_pari_flxq_powu:198` | 185 | `degree` | unsupported `while` | none | 1,010 | -1..3 |
| `int64_pari_flxq_powu:207` | 187 | `degree` | ordinary | W | 290 | -1..3 |
| `int64_pari_flxq_powu:243` | 200 | `da` | ordinary | W,D | 1,133 | 1 |
| `int64_pari_flxq_powu:311` | 233 | expression | unsupported `while` | none | 1,133 | 1 |
| `int64_pari_flxq_powu:327` | 244 | `degree` | unsupported `while` | none | 6,386 | 0..2 |
| `int64_pari_flxq_powu:336` | 257 | `degree` | unsupported `while` | none | 4,392 | 0..2 |
| `int64_pari_flxq_powu:350` | 264 | `degree` | unsupported `while` | none | 2,322 | 0..2 |
| `int64_pari_flxq_powu:360` | 271 | `degree` | unsupported `while` | none | 3,880 | 0..2 |
| `int64_pari_flxq_powu:368` | 273 | `degree` | ordinary | W | 1,133 | 1..2 |
| `int64_pari_flx_mul:3` | 158 | constant `-1` | ordinary | D | 2 | -1 |
| `int64_pari_flx_rem:7` | 297 | constant `-1` | ordinary | D | 2 | -1 |
| `int64_pari_flx_small_squarefree:75` | 596 | `df` | unsupported `while` | none | 1,411 | 1..4 |
| `int64_pari_flx_small_squarefree:107` | 618 | `dr` | unsupported `while` | none | 5 | 0 |
| `int64_pari_flx_small_squarefree:109` | 619 | `dv` | unsupported `while` | none | 5 | 1 |
| `int64_pari_flx_deflate:6` | 443 | `da` | ordinary | none | 0 | unobserved |
| `int64_pari_flx_gcd:11` | 397 | `da` | ordinary | none | 4,496 | 0..4 |
| `int64_pari_flx_gcd:15` | 398 | `db` | ordinary | none | 4,496 | -1..3 |
| `int64_pari_flx_gcd:22` | 401 | expression | unsupported `while` | none | 2,517 | 0 |
| `int64_pari_flx_gcd:34` | 405 | `db` | unsupported `while` | none | 6,227 | 1..3 |
| `int64_pari_flx_gcd:38` | 406 | `dc` | unsupported `while` | none | 6,227 | -1..2 |
| `int64_pari_flx_gcd:44` | 409 | `da` | ordinary | none | 1,979 | 0..4 |
| `_int64_pari_flx_divrem:44` | 328 | `da` | ordinary | none | 3,013 | -1..3 |
| `int64_pari_flx_normalize:6` | 109 | `da` | ordinary | none | 1,692 | 1..4 |

The apparent loss of `W` on ordinary edges near the bottom is itself caused
by whole-function intersection: those callers receive at least one empty
incoming context upstream. Merely preserving `w` through the immediately
enclosing statement is therefore insufficient; the preservation must work
recursively across the closed graph.

## What follows from the desired entry facts

The source copy operation first constructs two checked views
`view(w, a, 9)` and `view(w, out, 9)`. Successful construction authenticates

```text
0 <= a,   a + 9 <= len(w)
0 <= out, out + 9 <= len(w).
```

If one additional local predicate establishes `-1 <= da <= 8`, ordinary
range arithmetic proves every internal index without a special polynomial
rule:

- `range(da, -1, -1)` has possible emitted indices `[0, 8]`;
- `range(0, da + 1)` has possible emitted indices `[0, 8]`; and
- `range(da + 1, 9)` has possible emitted indices `[0, 8]`.

Thus `a + i` and `out + i` stay in their authenticated nine-slot views,
`da + 1` stays in `[0, 9]`, and each range latch remains in signed 64-bit
range. This is a generic interval theorem; only the entry facts are missing.

## Route 1: propagate invariants through the graph

Extending unsupported-loop handling to retain facts for variables not assigned
by the loop is sound and would recover the root `w` fact at the 13 directly
nested edges. Applied recursively, it should recover `len(w) >= 393` for all
37 edges.

That single extension does **not** establish the copy precondition. Nineteen of
the 24 ordinary edges still lack a degree interval, and all 37 lack source and
output span relations. Closing the graph-wide proof requires at least:

1. preservation of unmodified facts through unsupported loops;
2. branch-condition refinement and induction/fixpoint handling for mutated
   degree variables in `while` bodies;
3. interprocedural return-range summaries for normalize, division, remainder,
   multiplication, and quotient-ring helpers; and
4. affine workspace-span ownership facts propagated through calls and
   conditional slot selection.

Those are valuable general capabilities, but this is not a small one-rule
patch. Fact intersection also means one missed edge erases the callee proof,
so partial progress does not remove copy's checks.

## Route 2: authenticated local guarded fast path

A much smaller generic mechanism specializes a private helper after validating
its local precondition:

```text
checked view(w, a, 9)
checked view(w, out, 9)
if -1 <= da <= 8:
    run the interval-proved copy body
else:
    run the ordinary checked body
```

Equivalently, a wrapper may check both spans and the degree before dispatching
to a private fast clone. On false it must invoke the unchanged checked path;
there is no assertion or undefined-behavior escape hatch. The mechanism is
generic: a function-local checked predicate authenticates facts for a private
dominated region, just as the outer checked-region guard does for a call
graph.

Packet zero currently executes inside `copy`:

- 1,222,531 checked signed-arithmetic operations;
- 650,634 signed buffer-index checks; and
- 111,806 view validations (two per call).

That is 1,984,971 dynamic checked sites across 55,903 calls, or 35.51 sites per
call. A local fast path needs only the two existing span validations plus one
degree predicate: 167,709 predicates, or three per call. It can therefore
remove 1,817,262 internal dynamic checks on the frozen packet while preserving
the complete fallback. The 13 unsupported static edges and their 32,569 calls
need no special treatment.

## Recommendation

Implement the authenticated local guarded fast path first. It has one compact
proof obligation, reaches every edge at once, and directly tests whether
copy's 1.98 million checks are causally important. Keep graph-wide invariant
propagation as a subsequent compiler project: it is broadly useful, but it is
too large and all-or-nothing to be the smallest sound path to a zero-check
copy body.

Acceptance should require exact valid and malformed replay, an emitted-C audit
showing no checked arithmetic or buffer indexing in the true fast body, a
forced-false test reaching the ordinary checked body, and same-process paired
Stage-E timing. Dynamic observations in this report are evidence for expected
branch frequency, never proof authority.
