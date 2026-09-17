# Frozen panel row 8: authenticated C5 unit suffix

Status: complete for the 192-bit flag-zero path. The accepted 152-relation
owner now continues through PARI 2.17.4's C5 lattice and archimedean cleaning
stages to the exact `9 x 2 U` and `3 x 2 A` printed by pristine W0 event 489.
This cut does not eagerly expand fundamental units (`fu` is `NULL` upstream).

## Authenticated boundary

The sole production input is immutable owner
`b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591`.
It supplies the translated computation's accepted `3 x 152` logarithm owner,
`9 x 2` rank-two relation lattice, and regulator. Its ancestry binds pristine
W0 digest `4f7535622072f1350787ca8caab417cce4023aea4ef68c67c3fb20ef65d01ca1`.

`panel8_c5_unit_lattice_cleanarch.py` then executes, in source order:

1. `pari_unit_lattice_selection`, reproducing `extract_full_lattice`'s NULL
   shortcut because there are only nine columns;
2. `pari_unit_integer_lattice_rank_two`, producing `U1`;
3. `pari_log_matrix_transform` and `pari_unit_real_lattice_rank_two`,
   producing `U2`;
4. `pari_unit_compose_rank_two`, producing the nine-column unit transform;
5. another packed-log transform and `pari_cleanarchunit_mixed_quartic`;
6. `pari_field3_prepare_getfu` plus the optional second real LLL, whose live
   factor computes to the identity on this field; and
7. final composition of both `U` and `A`.

All public outputs remain private scratch until every arithmetic gate passes.
Only after the root returns does the owner composer read pristine event 489
and compare all 18 cells of `U`, all 42 packed cells of `A`, the regulator,
empty `CU`, and null `fu`. No event-489 value is an arithmetic input or fixture.

The exact computed intermediate transforms are:

```text
U1 = [0,0,0,0,0,4,-2,0,1, 0,0,0,0,0,1,0,0,0]
U2 = [0,1,1,-10]
U  = [0,0,0,0,0,1,0,0,0, 0,0,0,0,0,-6,-2,0,1]
F  = [1,0,0,1]
```

The owner retains `AU`, cleaned `A`, final `A`, and the complete arithmetic
state in addition to those matrices. The complete state is
`[0,192,3,0,0,0,0,-1,0,0,1,1,9,3,2,9]`.

## Immutable production owner

```text
/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel8-authority/
  panel8-c5-unit-lattice-fdcefd07285eb7147da5dd2679ef1ff56442e5f8ed3503f5c74bdd604e96cc62.json
```

It is 5,201 bytes, mode `0444`, and has SHA-256
`fdcefd07285eb7147da5dd2679ef1ff56442e5f8ed3503f5c74bdd604e96cc62`.
Publication is content-addressed, atomic, and idempotent; an existing path is
reused only after rechecking its digest and mode.

## Differential and fail-closed validation

`check_panel8_c5_unit_lattice_cleanarch.cjs` performs two independent CPython
publications and then captures the exact arithmetic call packet, without any
reference answers. The complete root is compiled once and run through both
the JavaScript-exact and native GMP backends. Both reproduce CPython's exact
`U1`, `U2`, `U`, `AU`, cleaned/final `A`, factor, and state. The generated
native core is 16,096,995 bytes and contains no Python, V8, or N-API callback.

The check rejects short native output storage and six authenticated-boundary
mutations: field identity, W0 ancestry, lattice shape, a lattice cell, a packed
log cell, and the terminal-comparison latch. Failed coordinator cases publish
nothing. All jobs remain below 600 seconds and 4 GiB.

The only compiler change in this cut guards an optional parser constructor
before using it as the right-hand side of `instanceof`. This restores contract
collection with parser backends that do not expose annotated assignments; it
does not weaken any optimizer contract or mathematical check.
