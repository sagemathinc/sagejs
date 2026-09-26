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

This receipt records the class-presentation milestone. The later resident
reverse-HNF cut now derives the `6 x 430` saturated unit kernel plus the nine
terminal presentation columns from the same retained transforms, reconstructs
the compact exact unit and inverse, and composes complete factored principal
witnesses. No `cypari2.matrix(...).matkerint()` or serialized owner remains in
that path. The branded result can materialize all retained factors for cold
replay, so the current internal result is `correspondenceComplete=true` while
remaining `publicComplete=false` and `qualifiedTiming=false`.
