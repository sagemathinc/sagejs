# Compact flag-one untimed row-20 seed

This seed freezes the compact tier as the twelve `additional-development`
rows of the existing qualification manifest: panel rows 3, 4, 6, 10, 11,
13, 16, 18, 19, 20, 21, and 23. The derivation is checked against the exact
panel, qualification-manifest, runner, and receipt-schema bytes. Execution,
timing, the final run, and reserve opening all remain disabled.

The row-20 Sage.js adapter does not execute the expensive C6 exponential
expansion or C7 exact closure. It admits only the already-published immutable
C6 owner SHA-256
`5449d3812514fa9aad06364e6b5ba0c18d10ee66225d0baa4fc5ea7d39f7ea1d`
and C7 envelope SHA-256
`3d0b7e2fdb43e70a9f6e6be4c50c50ca6d5e4414e05812b58f6ce049b3496052`,
both descended from pristine W0 SHA-256
`6ea7098d80c586a7fbf050f9f650f4a3bff258cd84dd7a2a3c7dab210d1bf468`.
It checks immutable modes, canonical C7 bytes, the authenticated C7 payload,
row identity, and exact C6/C7 unit-coordinate and norm agreement before
emitting an untimed receipt. No materialization work is hidden in a measured
region: the receipt contains no measurements and states
`eagerExpansionExecuted=false`.

The common matched output deliberately contains only representation-neutral
mathematical output: the defining polynomial and field id, normalized class
number/invariant factors, unit rank, torsion order, and the fact that exact
units exist. It does not digest a particular choice, order, or inversion of
fundamental units. Its canonical row-20 SHA-256 is
`ea40bb397941f6fec98881c1d0ce2402a33c02c82c0d1bab3face46b13ae36c2`.
A future Sage.js or pristine-PARI arm may claim a match only by independently
deriving this projection from its authenticated result.

## Pristine PARI blocker

No pristine PARI 2.17.4 row-20 flag-one authority currently exists at the
required `bnfinit0(prepared_nf, 1, NULL, nbits2prec(192))` boundary. The W0
file is an instrumented development-driver trace, so relabeling it as the
pristine comparison arm would be false. Creating and validating a pristine
adapter necessarily executes that exact row-20 flag-one call—the heavy target
workload—and then needs a cold replay to authenticate its result. This seed
therefore records PARI as `blocked-unexecuted`; it adds no source-only adapter
that could appear runnable without evidence, and it does not launch the heavy
call.

`check_compact_flag_one_row20_adapter.cjs` validates the twelve-row derivation,
the common digest, the untimed CLI, and fail-closed rejection of a run option,
changed W0/C6/C7 bytes, mutable C7 authority, and an enabled manifest.
