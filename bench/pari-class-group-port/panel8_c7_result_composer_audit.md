# Panel row 8 C7 field-neutral result

Status: complete internally and deliberately not public-complete.

`panel8_c7_result_composer.cjs` joins the exact accepted-retry owner, corrected
C5 v2 compact-unit owner, matched C6 `PRECI` owner, and independently replayed
terminal closure into `class_unit_correspondence_result.cjs`. It pins these
immutable inputs:

- accepted retry: `b2e1a6a0d737880627d8829569c24447557c389690d2ec5a35a9e1c6c0430591`;
- C5 v2: `f93fa0ff5f68531646f213d799339e87a7b2d338e18457399fe81d6b0fb1df21`;
- C6: `d1f4e9e2ce4ae987952cbce8e8af9d6c9ede318f5ffa89b185fbd003ab5e28df`;
- terminal closure: `2e7a8a896f68e80093e3e5a5e198597569e804e4dc53f888869138a97710919d`.

The closure replay authenticates all 152 exact principal relations, the
`152 x 9` kernel transform, the `152 x 143` right inverse, source-order packed
logs, factor-base ideals, norms, and the three HNF states. C7 copies these
owners into the neutral envelope only after a detached synchronous replay
accepts that exact closure. A second detached authority is required to publish
the final envelope; the composer contains no authority factory.

The result has trivial class group (`h=1`, invariant factors `[]`), unit rank
two, torsion order two with generator `-1`, the accepted regulator, and the C5
compact transform/log owner. C6's matched flag-zero failure is represented as
`not_given(PRECI)` at 192 bits. The source record explicitly labels PARI's
correspondence, factor-base selection, GRH, and class-group bounds as
assumptions. The terminal tier is therefore
`correspondence_complete=true, public_complete=false`.

The immutable final envelope is:

```text
/scratch/sagejs-runtime/pari-class-group-e2e-20260917/panel8-authority/
  panel8-c7-class-unit-result-5626e6e186f481f94c7e1752daab96d04753b864a42cda45faca0607f565e27b.json
```

It is 264,058 bytes, mode `0444`, and its SHA-256 is
`5626e6e186f481f94c7e1752daab96d04753b864a42cda45faca0607f565e27b`.
Publication is content-addressed, atomic, and idempotent.

`check_panel8_c7_result_composer.cjs` performs two cold compositions from the
real immutable owners, verifies transactional publication, and rejects twelve
ancestry, matrix, principal-generator, PRECI, compact-unit, closure-tier, and
coordinated-reseal mutations. A direct attempt to promote `public_complete`
is rejected by the neutral schema.
