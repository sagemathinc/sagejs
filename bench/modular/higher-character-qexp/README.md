# Higher-character $q$-expansion scaling benchmark

This benchmark compares the public exact cusp-form basis reconstruction for
characters whose value fields have degree greater than two.  It deliberately
uses larger prime levels than the object-layer smoke benchmark:

- order $20$, degree $8$, level $101$;
- order $12$, degree $4$, level $157$;
- order $16$, degree $8$, level $241$;
- order $16$, degree $8$, level $401$ in the `--large` profile.

Each process constructs `CuspForms(chi, 3)` and asks for enough coefficients
to expose a non-pivot coefficient of the canonical basis.  The systems must
agree on the dimension and on the exact minimal polynomial fingerprint of
that coefficient before a timing is accepted.  Language startup and character
enumeration are outside the timed region.

Run the standard or extended grid with:

```sh
pnpm bench:modular:higher-character-qexp -- --json
pnpm bench:modular:higher-character-qexp -- --large --json
```

Set `HIGHER_CHARACTER_QEXP_SAMPLES` for repeated samples and `SAGE_PYTHON` to
select SageMath.  This is a scaling receipt rather than a fixed performance
gate; exact times depend strongly on the host.

## Linux development receipt, 2026-09-04

One process-cold sample per row on the development host, excluding language
startup and character enumeration, gave:

| level | order | field degree | cusp dimension | Sage.js | SageMath | ratio |
|---:|---:|---:|---:|---:|---:|---:|
| $101$ | $20$ | $8$ | $16$ | $0.51$ s | $2.53$ s | $0.20$ |
| $157$ | $12$ | $4$ | $25$ | $1.18$ s | $3.53$ s | $0.33$ |
| $241$ | $16$ | $8$ | $40$ | $2.23$ s | $22.65$ s | $0.10$ |
| $401$ | $16$ | $8$ | $66$ | $13.61$ s | $142.02$ s | $0.096$ |

All four exact fingerprints agreed.  The implementation follows the optimized
strategy in SageMath's `hecke_images_nonquad_character_weight2`: character
values and modular-symbol coordinates remain in the rational power basis of
the cyclotomic field while one functional's $T_n$ images are accumulated for
all requested $n$.  Sage.js extends that idea to the supported weights and
then uses certified completely-split-prime row reduction to construct the
canonical basis.  The portable backend retains the exact prime-power
recurrence fallback.
