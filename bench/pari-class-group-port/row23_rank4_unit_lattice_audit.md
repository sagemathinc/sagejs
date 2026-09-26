# Row 23 rank-four unit-suffix dependency cut

Status: executable development probe, **not** a result owner and not evidence of
an end-to-end row-23 computation.

## Boundary and source correspondence

`row23_rank4_unit_lattice.py` translates the bounded rank-four part of PARI
2.17.4's `buch2.c` fundamental-unit path: rectangular integer LLL, the second
real LLL, `cleanarchunit`, `fixarch`, and the private `getfu` factor selection.
It is ordinary CPython-parseable Python compiled through Sage.js's normal
source-transparent native compiler; it adds no handwritten C or external
native dependency.

The probe authenticates frozen development-panel row 23
`5.5.1002836007889.1`, signature `(5,0)`, unit rank four, at W0 SHA-256
`6c4a0b2f5e74d5f156714fad24b0bbf41c8d4998de5bbd046d74c6d8a3930c89`.
Its frozen accepted relation lattice and HNF logarithms are explicitly
non-owning development inputs. It executes:

1. 9-by-4 rectangular integer LLL, state `[5,5,4,0,0]`;
2. exact log transformation and 5-by-4 real LLL, state `[0,0]`;
3. composition of the 9-by-4 compact transform;
4. totally-real phase cleaning and a source-order 4-by-4 regulator
   determinant, state `[0,4,4,-241,-233,-1,-1]`;
5. `fixarch` and private rank-four factor selection, which is the identity.

The computed compact transform is

```text
[0,0,-1,1,0,0,0,0,0,
 0,0,0,-3,3,1,0,0,0,
 0,0,1,0,-1,0,0,0,0,
 0,0,2,-3,-1,1,0,0,0]
```

and agrees entry-for-entry with PARI's `fundamental_units.U`. The
`fundamental_units` event is opened only after the translated transformations
finish.

## Native and exact checks

Run:

```bash
node bench/pari-class-group-port/check_row23_rank4_unit_lattice.cjs
```

The checker reruns the CPython probe twice, compiles the same source, and
executes the integer LLL, real LLL, composition, cleanarch, and getfu
preparation on the JavaScript, GMP, and tagged backends. All backends produce
identical state and output buffers. Malformed field, lattice, log, comparison
transform, workspace, and getfu-factor controls fail closed.

As a comparison-only post-pass, the checker converts PARI's four expanded
reference units into the prepared integral basis and replays their exact
multiplication matrices. Their exact norms are `[-1,1,1,1]`; multiplication by
their computed inverses gives the principal product. Exact dyadic accumulation
at all five real embeddings proves sign vectors
`[-1,-1,-1,1,1]`, `[-1,-1,-1,-1,1]`, `[1,1,1,-1,-1]`, and
`[1,-1,-1,-1,-1]`. These are future live-C6 verifier expectations, not a
derivation of the units.

## Honesty limitation and remaining suffix

Row 23 has no connected live relation/HNF/log owner. The probe therefore
reports `publishable=false`, `correspondenceComplete=false`, and
`frozenW0RuntimeInput=true`. W0 is an explicitly non-owning postcompute
differential oracle; this cut publishes no C5 or C6 component.

A live owner must replace the frozen accepted lattice, logarithms, and
regulator. The remaining arithmetic suffix is the totally-real quintic
four-right-hand-side `getfu` solve, exponentiation and rounding, exact unit
reconstruction, and live norm/sign publication. The rank-four lattice,
cleanarch, and private-factor functions are reusable unchanged.
