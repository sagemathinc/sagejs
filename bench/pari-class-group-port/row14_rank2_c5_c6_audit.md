# Row-14 rank-two C5/C6 suffix

This cut consumes the immutable live accepted owner, the independently
computed post-806 terminal receipt, and prepared factor metadata. It reads no
frozen W0 data at runtime. The seven leading packed columns of live `C`, the
14-cell accepted unit lattice, and the live regulator feed the existing
rank-two integer/real reductions, mixed-quartic `cleanarchunit`, private
`getfu` factor, and mixed-quartic reconstruction machinery.

The honest terminal reason is `LARGE`, not `PRECI`. In pinned PARI 2.17.4
`buch2.c` (SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`),
`expbitprec` at lines 991--1003 rejects real exponent above 20;
`RgM_expbitprec` at lines 1015--1022 maps that rejection to `LONG_MAX`; and
`getfu` at lines 1145--1150 maps `LONG_MAX` to `fupb_LARGE`. Other
nonnegative argument-reduction accuracy maps to `fupb_PRECI`. The live suffix
returns state `[2,38,0,0,0,0,0,1]`, so the exponent guard wins first.
The reason values are fixed by `paripriv.h` line 270 (`LARGE=2`, `PRECI=3`).
`not_given` at `buch2.c` lines 975--988 emits a reason-specific diagnostic
only at debug level and returns `NULL` for either reason.

Frozen W0 event 5392 contains `A`, `U`, `CU`, `fu`, and `regulator`, but no
reason field. Both `LARGE` and `PRECI` return `NULL` through `not_given`, so
the public `fu:null` value cannot distinguish them. Only after the live result
is published, the focused checker confirms W0's null `fu`, matching regulator,
and public `A` maximum real exponent 41. W0 is therefore differential-only.

No exact expanded unit is published. The current accepted owner does not yet
contain the exact raw-to-seven-unit-column HNF transform, so this cut also
keeps `compactFactoredUnitsRetained=false` and
`correspondenceComplete=false`. The compact archimedean C5 state is retained,
but it must not be promoted to an authenticated raw principal-factor product
until the separate ancestry owner proves `R*T=0` and exact log equality.
