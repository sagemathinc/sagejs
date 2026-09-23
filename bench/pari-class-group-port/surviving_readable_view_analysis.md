# Surviving readable-view analysis

This is a read-only analysis of the real Stage-D 36-function catalog after the
narrow fixed-view proof prototype. It does not change the Python algorithm or
the compiler. A disposable copy of the validated generated C counted each
view construction and each access through the resulting alias. All four
frozen packets were replayed exactly before the counts were accepted.

The dynamic boundary used for ranking is one fresh execution of frozen packet
zero, the same boundary as the remaining-check profile. The four-packet totals
are included as a stability check.

## Census and ranking

The 11 surviving `uint64.buffer.view` operations account for 266,240 dynamic
view constructions and 2,097,421 accesses on packet zero. Across all four
frozen packets they account for 304,038 constructions and 2,394,949 accesses.

| Rank | View operation | Python view | Start | Length | Packet-0 constructions | Packet-0 accesses | Four-packet accesses |
| ---: | --- | --- | --- | --- | ---: | ---: | ---: |
| 1 | `int64_pari_flx_copy:7` | `output` | `out` | `9` | 55,903 | 503,127 | 588,294 |
| 2 | `_int64_pari_flx_divrem:15` | `quotient` | `quot` | `9` | 26,997 | 374,892 | 426,040 |
| 3 | `_int64_pari_flx_divrem:19` | `remainder` | `rem` | `9` | 26,997 | 312,692 | 352,608 |
| 4 | `int64_pari_flx_sqr:7` | `output` | `out` | `9` | 14,373 | 188,248 | 205,374 |
| 5 | `int64_pari_flx_sqr:45` | `source` | post-trim `a` | post-trim `da + 1` | 14,373 | 171,746 | 190,053 |
| 6 | `_int64_pari_flx_divrem:11` | `divisor` | `b` | `9` | 26,997 | 163,861 | 187,831 |
| 7 | `int64_pari_flx_copy:3` | `source` | `a` | `9` | 55,903 | 147,507 | 174,557 |
| 8 | `_int64_pari_flx_divrem:7` | `dividend` | `a` | `9` | 26,997 | 102,809 | 117,285 |
| 9 | `int64_pari_flx_mul:17` | `output` | `out` | `9` | 5,900 | 69,971 | 79,358 |
| 10 | `int64_pari_flx_mul:63` | `right` | post-trim/swap `b` | post-trim/swap `db + 1` | 5,900 | 41,712 | 49,034 |
| 11 | `int64_pari_flx_mul:57` | `left` | post-trim/swap `a` | post-trim/swap `da + 1` | 5,900 | 20,856 | 24,515 |

The access count sums the manifest `get` and `set` operations whose buffer is
the alias created from that view. It therefore measures the amount of real
traffic unlocked by virtualizing each descriptor; it is not a claim that all
of those access checks can also be removed.

## Exact missing facts

Every view root is the callee parameter `w`, ultimately the entry
`word_workspace`. The entry guard proves `len(word_workspace) >= 393`, but the
prototype's callee entry state contains no buffer fact for `w` in any of the
four functions. It also contains no scalar interval for the view starts. The
only nonempty interval observed in these callees was `want_rem in [0, 1]` in
`_int64_pari_flx_divrem`, which is irrelevant to its views.

Consequently, the eight fixed-length views all miss the same two facts:

1. the call edge preserves the root identity `w = word_workspace` and hence
   `len(w) >= 393`; and
2. the relevant start has `0 <= start` and `start + 9 <= len(w)`.

The facts are needed for starts `a` and `out` in `copy`; `a`, `b`, `quot`, and
`rem` in `divrem`; and `out` in `mul` and `sqr`. There are 37 static calls to
`copy`, three to `divrem`, and one each to `mul` and `sqr`. Whole-function fact
intersection cannot retain a start interval when even one call occurs below a
control-flow construct that invalidates nested-call facts.

The three dynamic-length views additionally need an affine-span invariant:

- In `sqr`, each leading-zero iteration updates `a += 1` and `da -= 1`.
  Thus `a + da + 1` is invariant and the post-loop span
  `[a, a + da + 1)` remains inside the original input slot.
- In `mul`, the same paired invariant is needed independently for
  `(a, da)` and `(b, db)`. The following conditional swap permutes the two
  already-valid span pairs, so both post-swap spans remain valid.

The narrow prototype recognizes only constant lengths and rejects a start or
length expression assigned anywhere in the function. It therefore cannot use
these conserved affine spans even if the caller facts were propagated.

## Smallest generic next extension

The smallest extension that reaches all 11 views is **checked virtual views**,
not a new catalog-specific relational guard:

1. Retain the existing generated validation of `start >= 0`, `length >= 0`,
   and `start + length <= root.length` exactly where the view is constructed.
2. After that check succeeds, represent a nonescaping view internally as the
   SSA tuple `(root, start, length)` rather than materializing a
   `sagejs_uint64_buffer` descriptor.
3. Propagate that tuple through `uint64.buffer.copy` aliases.
4. Lower accesses to `root.data[start + index]`, retaining the logical-view
   bounds check against `length` unless an independent range proof removes it.
5. Fail closed if the view escapes, is returned, is passed to an unrecognized
   call, or if the root/offset/length values cannot be snapshotted with their
   original semantics.

This is generic over buffer roots and scalar expressions and requires no PARI
function or slot name. It is also strictly weaker than proving the view valid
at region entry: the validation remains observable and preserves malformed
fallback behavior. It handles the three dynamic lengths without teaching the
analyzer paired-update loop invariants.

A later, stronger contract can remove the retained construction checks. The
minimal reusable vocabulary for that step is a call-edge span fact
`buffer-contains-span(buffer, start, length)`, plus affine-span conservation
and pair-permutation rules. That theorem work should not block descriptor
virtualization, and it should be justified separately against malformed
inputs.

## Reproduction notes

The source build was `/tmp/sagejs-stage-a-catalog-pvHwrA`; its readable source
was `/tmp/sagejs-view-proof-catalog-aGpIpX/int64_flx_small.py`; and fixtures
were `/tmp/sagejs-int64-prime-degree-catalog-fcTr9K/fixtures.json`. The
diagnostic inserted one `uint64_t` counter before each of the 11 view-operation
provenance markers and the 37 alias `get`/`set` markers in only the private
checked graph, rebuilt the disposable directory, replayed all four expected
snapshots, and then profiled packet zero and the four-packet sequence in fresh
processes. The accepted raw result is `/tmp/view-profile.json`.
