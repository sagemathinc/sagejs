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
`eagerExpansionExecuted=false`. It additionally authenticates the committed
pristine-PARI authority before claiming the two implementations match.

The common matched output deliberately contains only representation-neutral
mathematical output: the defining polynomial and field id, normalized class
number/invariant factors, unit rank, torsion order, and the fact that exact
units exist. It does not digest a particular choice, order, or inversion of
fundamental units. Its canonical row-20 SHA-256 is
`ea40bb397941f6fec98881c1d0ce2402a33c02c82c0d1bab3face46b13ae36c2`.
A Sage.js or pristine-PARI arm may claim a match only by independently
deriving this projection from its authenticated result.

## Pristine PARI flag-one authority

`pristine-row20-flag-one-authority.json` closes the former blocker with one
untimed cold-process call to the exact boundary
`bnfinit0(prepared_nf,1,NULL,nbits2prec(192))`. The process first prepares
`nf` with `nfinit0(x^5-5*x-12,0,nbits2prec(192))`, fixes PARI's RNG seed to 1,
and holds PARI to one worker. The invocation was fail-closed under a 600-second
CPU limit, 600-second wall timeout, and 4 GiB address-space limit. It does not
read or import the instrumented W0 result.

The authority uses the campaign's existing pristine PARI 2.17.4 build under
`/home/user/upstream/pari-2.17.4`. Provenance pins release archive SHA-256
`02651d99c391007d384b3fadbc20abc6916b77036f9e496c99e9ce8688ca4b53`,
pristine `buch2.c` SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`,
linked `libpari` SHA-256
`fdc8f2d7ff050c8e8c6cb8994b0f9dc971267ac763eaf5cd927454937d37357f`,
and producer-source SHA-256
`b4f52dfc8be212b0b069f48214a869255bff4d8e07252c8f6f52f7de30617a33`.
The complete canonical authority has SHA-256
`772caa06af410de7ec071ca879765a859238e0c74263c50b4c8dbc374d8777dc`.

Only compact matched output, work shape, terminal RNG state, exact call
identity, resource bounds, and build provenance are retained. Fundamental-unit
coordinates, logs, regulator values, elapsed time, and instrumented events are
absent. The independent PARI projection produces row-20 output SHA-256
`ea40bb397941f6fec98881c1d0ce2402a33c02c82c0d1bab3face46b13ae36c2`,
exactly matching Sage.js. The observed work shape is factor-base size 7, zero
retained class rows, a 3-by-2 log matrix, and two expanded units.

Regenerate the authority only as an explicit untimed diagnostic action:

```bash
node bench/pari-class-group-port/capture_pristine_row20_flag_one.cjs \
  bench/pari-class-group-port/pristine-row20-flag-one-authority.json
```

The capture program refuses to overwrite an existing authority. It verifies
the pristine archive and source before compiling and enforces the resource
limits itself.

`check_compact_flag_one_row20_adapter.cjs` validates the twelve-row derivation,
the common digest, the untimed CLI, exact pristine call/work/RNG/provenance
shape, and fail-closed rejection of a run option, changed W0/C6/C7/PARI bytes,
mutable C7 authority, and an enabled manifest. Qualification timing, final-run
execution, and reserve opening remain disabled.
