# Row-21 live quintic honesty audit

This lane selects the immediate-success `be_honest` path in PARI 2.17.4
`src/basemath/buch2.c:2800-2865` for panel row 21,
`36+930*x-305*x^2-90*x^3+x^5`, with `C1=5`, `C2=31`, and `setrand(1)`.

The root accepts only prepared number-field multiplication data, raw `F.FB` / 
`F.LV` descriptors, `KCZ`, `KCZ2`, `subFB`, and an RNG snapshot. It derives
the effective group widths, skips one-ideal groups, rebuilds each initial
`pr_hnf`, derives `pr_norm` as `p^f`, and invokes the existing no-cache
collector. No probe retries, automorphisms, or random ideal products occur in
this frozen path.

The checker compiles the pristine archived `buch2.c`, authenticates its SHA-256,
and compares all six live-derived ideals to `pr_hnf`. It then runs the actual
translated collector for each ideal. The pristine and translated schedules are
`(11,1..3), (13,1), (29,1..2)`, all statuses are one, transient `KCZ` reaches
six and restores to three, and RNG is unchanged. A second run changes the
fourth returned collector status to zero only after calling the real collector;
the selected corridor rejects that mutation without publishing or changing
the borrowed RNG, subfactor, or factor-base owner state.

The local degree-five HNF code is intentionally confined to this new root.
No shared `prime_ideal_hnf.py` source change is required, and this lane makes no
timing or broader end-to-end completion claim.
