# Classical object-layer first-Hecke benchmark

This benchmark constructs a fresh cuspidal parent and its first exact Hecke
matrix in Sage.js, SageMath, and Magma. Language startup is outside the timed
region. Each system reports the dimension and trace; the harness refuses to
publish ratios unless those exact invariants agree.

Run it with:

```sh
pnpm bench:modular:classical-object-layer -- --json
```

`CLASSICAL_OBJECT_SAMPLES` controls the number of fresh processes per row.
`SAGE_PYTHON` and `MAGMA` select competitor executables.

## Linux optimization receipt, 2026-09-02

Command:

```sh
CLASSICAL_OBJECT_SAMPLES=3 \
  pnpm bench:modular:classical-object-layer -- --json
```

Environment:

- Sage.js: the source containing this receipt, based on `1e14059c9593`;
- SageMath `10.9.post1`;
- Magma `V2.18-5`;
- Node.js `26.7.0`, Linux x86-64, AMD EPYC 7B13.

| space and operator | dimension | trace | Sage.js | SageMath | Magma | Sage.js / SageMath | Sage.js / Magma |
|---|---:|---:|---:|---:|---:|---:|---:|
| $S_2(\Gamma_0(37)),T_2$ | 2 | -2 | 312 ms | 151 ms | 130 ms | 2.07 | 2.40 |
| $S_2(\Gamma_0(101)),T_2$ | 8 | 0 | 363 ms | 198 ms | 130 ms | 1.84 | 2.80 |
| $S_4(\Gamma_0(100)),T_3$ | 36 | -6 | 1.11 s | 1.97 s | 710 ms | 0.564 | 1.57 |

Sage.js and SageMath use wall time; the available Magma interface reports CPU
time at 10 ms resolution. Before the Hecke-dual transport optimization, the
same Sage.js rows took 484 ms, 820 ms, and 4.38 s. The new path is therefore
about $1.55$, $2.26$, and $3.93$ times faster, respectively. It preserves the
canonical $q$-expansion coordinate basis: focused tests compare each transported
matrix with independent coefficient reconstruction for good, bad, composite,
and newspace operators.
