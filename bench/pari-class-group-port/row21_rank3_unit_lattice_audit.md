# Row 21 rank-three unit-suffix dependency cut

Status: executable development probe, **not** a result owner and not evidence of
an end-to-end row-21 computation.

## Boundary and source correspondence

`row21_rank3_unit_lattice.py` translates the bounded rank-three part of PARI
2.17.4's `buch2.c` fundamental-unit path (`extract_full_lattice`, the second
real LLL, `cleanarchunit`, and the private `getfu` factor selection around
lines 4142--4177).  The translated source is ordinary CPython-parseable Python
and compiles through the normal Sage.js native compiler; there is no handwritten
C implementation.

The probe authenticates frozen development-panel row 21
`5.3.1009349859375.3`, signature `(3,1)`, unit rank three, at W0 SHA-256
`45087efb874a7c756e0695ea8c79873cdfc22cfe5702c24df18619d368622b5a`.
It consumes the frozen 8-by-3 accepted relation lattice and the first eight
columns of the exact 4-by-32 HNF log owner, then executes:

1. rectangular integer LLL, with state `[5,5,3,0,0]`;
2. exact log transformation and 4-by-3 real LLL, with state `[0,0]`;
3. composition of the 8-by-3 compact transform;
4. signature-`(3,1)` phase cleaning and regulator comparison, with state
   `[0,3,3,-183,-174,-1,-1]`;
5. `fixarch` and the private 3-by-3 getfu-factor selection, obtaining the
   column-major factor `[1,0,0,0,1,0,1,0,1]`.

The computed compact transform is exactly

```text
[0,0,0,0,0,1,0,0,
 0,0,0,0,0,1,3,1,
 0,0,0,-1,1,0]
```

and agrees entry-for-entry with PARI's `fundamental_units.U`.  The reference
event is opened only after the translated transformations finish.

## Native and exact checks

Run:

```bash
node bench/pari-class-group-port/check_row21_rank3_unit_lattice.cjs
```

The checker reruns the CPython probe twice, compiles the source, and executes
the integer LLL, real LLL, transform composition, cleanarch, and getfu
preparation on the JavaScript, GMP, and tagged backends.  All three backends
produce identical states and buffers.  Seven malformed or mutated controls are
rejected, including field identity, accepted-lattice shape, HNF-log shape,
comparison-only `U`, and transactional short-buffer controls.

As a comparison-only post-pass, the checker converts PARI's three expanded
reference units into the prepared integral basis and replays their exact
multiplication matrices.  All have exact norm `-1`, exact multiplicative
inverses, and principal product `[1,0,0,0,0]`.  Exact dyadic accumulation at
the three real embeddings proves sign vectors
`[-1,1,1]`, `[1,-1,1]`, and `[1,-1,1]`.  These checks define the output that a
future live C6 producer must reproduce; they are not a substitute for deriving
the units.

## Honesty limitation and next cut

Row 21 still has no connected live relation/HNF/log owner.  Therefore this
probe deliberately reports:

```text
publishable = false
correspondenceComplete = false
frozenW0RuntimeInput = true
```

It publishes no C5/C6 owner.  A live owner must first replace the frozen HNF,
logarithm, accepted-lattice, and regulator inputs.  After that connection, the
remaining arithmetic suffix is the signature-`(3,1)` three-right-hand-side
`getfu` solve, exponentiation/rounding, exact unit reconstruction, and live
norm/sign publication.  The rank-three lattice, cleanarch, and private-factor
machinery in this cut can then be reused unchanged.
