# Imaginary quadratic class-group performance

Run the comparative benchmark with:

```sh
pnpm bench:quadratic-class-groups
```

The benchmark always measures the native Sage.js/FLINT path. It also measures
PARI/GP and Magma when they are installed (`PARI_GP` and `MAGMA` may override
their executable paths). Every row checks the returned class number before it
is reported.

## Semantics

The labels are deliberately more specific than “class number”:

- **Sage.js certified enumeration** uses FLINT's modular-root sieve to
  enumerate every primitive reduced positive-definite form. The number of
  forms is therefore a direct finite certificate. For a cyclic group,
  Sage.js factors that number and verifies a generator by testing
  `g^(h/p) != 1` for every prime divisor `p` of `h`.
- **PARI probable Shanks** is `qfbclassno(D)`. PARI's implementation estimates
  the class number and uses baby-step/giant-step group computations. PARI and
  Sage both warn that unusually low-exponent class groups can defeat the
  general heuristic, although Sage documents the result as correct for
  `|D| <= 2*10^10`.
- **PARI analytic proof mode** is `qfbclassno(D, 1)`, the path Sage uses for
  `proof=True`. It evaluates a rapidly convergent analytic class-number
  formula and rounds the result.
- **Magma middle-range Shanks** is the automatic `ClassNumber(D)` path at
  these sizes. Magma's handbook distinguishes this from its large-input
  index-calculus and sieve paths, whose certification bounds assume GRH.

These modes should not be collapsed into one timing. In particular, PARI's
fast probable path and its analytic proof path differ by orders of magnitude.

## August 2026 snapshot

On the Sage.js Linux x64 development host with FLINT 3.6.0, PARI 2.18, and
Magma 2.18, representative medians in milliseconds were:

| `D` | Sage.js class number | Sage.js cyclic structure | PARI probable | PARI proof | Magma Shanks |
|---:|---:|---:|---:|---:|---:|
| `-10,000,019` | 0.272 | 0.393 | 0.075 | 48 | 2.1 |
| `-100,000,007` | 1.753 | 2.548 | 0.100 | 166 | 2.5 |
| `-1,000,000,007` | 7.381 | 10.691 | 0.150 | 569 | 4.0 |

This establishes two useful facts. First, a readable Sage.js implementation
can retain an exact Python reference algorithm while making its hot kernels
competitive with specialized systems: certified class numbers are faster than
Magma in the first two cases and within a factor of two in the third. Second,
reduced-form enumeration cannot compete asymptotically with PARI's probable
Shanks method. Large-discriminant work still needs a non-enumerating
baby-step/giant-step class-number algorithm, followed by relation collection,
HNF/SNF structure computation, and an explicit proof/GRH policy.

Timings are not release budgets and will vary by machine. The benchmark script,
correctness checks, algorithm labels, and raw JSON mode are the reproducible
artifact; use `--json` when collecting a new comparison.
