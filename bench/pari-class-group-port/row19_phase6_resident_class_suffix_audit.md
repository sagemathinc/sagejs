# Row 19 resident class suffix

The closed-record and bounded-workspace compiler support now connects the live
terminal HNF buffer directly to `pari_class_group_smith_transform`. The handoff
does not call `.toArray()`, serialize JSON, publish an owner, or enter CPython.

`row19_phase6_resident_class_private.py` uses a three-scalar `TypedDict`
manifest, one borrowed 81-cell `IntegerBuffer` view, and fixed automatic
workspaces. It produces invariants
`[6,3,3,3,3,3,3,3,3]` and class number `39366`. The full resident check passed
under the existing four-GiB/600-second envelope with 1,042,740 KiB peak RSS.
The receipt is
`/scratch/row19-phase6-resident-class-check-v1.json`, SHA-256
`91aaa006a202af2790c9be2d854092d1902f8958cac8d99abcabb917b007dae5`.

This closes the class-presentation arithmetic, not class generators or
principal witnesses. The exact next native source cut is the reverse-HNF map
from the retained first and appended terminal transforms to the `6 x 430`
saturated raw relation kernel. Today `row19_live_rank1_unit.py` obtains that
kernel with `cypari2.matrix(...).matkerint()`. Without the raw-to-kernel map,
the compact unit, exact-unit verification, and final owner cannot honestly be
connected. The retained root now keeps all first/terminal buffers required by
the source-transparent reverse-HNF implementation; no mathematical data needs
to be recovered from a serialized owner.

Accordingly the resident result remains `correspondenceComplete=false`,
`publicComplete=false`, and `qualifiedTiming=false`.
