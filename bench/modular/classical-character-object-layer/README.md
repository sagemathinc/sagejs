# Classical character object-layer benchmark

This benchmark exercises the public parented object layer, rather than timing
the modular-symbol engine in isolation. It measures a fresh space and its first
requested exact Hecke operator for:

- $S_3(\Gamma_0(12),\chi_7)$ and bad-prime $U_2$;
- the new subspace of $S_4(\Gamma_0(20),\chi_9)$ and good-prime $T_3$;
- $S_2(\Gamma_0(13),\chi_4)$ over $\QQ(\zeta_6)$ and $T_2$.

The two quadratic rows run in Sage.js, SageMath, and Magma. The higher-order
row runs in Sage.js and SageMath: Magma V2.18-5's public `ModularForms([chi])`
interface combines Galois conjugates and its direct Hecke path does not expose
the same single-character contract. Every timing is accepted only after the
dimension and a Galois-invariant Hecke fingerprint agree exactly.

Run one process-cold sample per row with:

```sh
pnpm bench:modular:classical-character-object-layer -- --json
```

Set `CLASSICAL_CHARACTER_OBJECT_SAMPLES` for repeated samples,
`SAGE_PYTHON` to select SageMath, and `MAGMA` to select Magma. Language startup
and Sage.js kernel creation are outside the timed region.

Exact bases, coordinates, products, old/new certificates, relative Hecke
packets, recurrences, and SagePack round trips are pinned separately in
`test/classical-modular-form-characters.cjs`; the benchmark deliberately has a
small equal-work contract.

## Linux development receipt, 2026-09-03

The median of three process-cold samples on AMD EPYC 7B13, Linux x86-64,
Node.js $26.7.0$, SageMath $10.9.post1$, and Magma $V2.18-5$ gave:

| object-layer contract | exact dimension | Sage.js | SageMath | Magma |
|---|---:|---:|---:|---:|
| quadratic level $12$, $U_2$ | $2$ | $334$ ms | $165$ ms | $130$ ms |
| quadratic level $20$ newspace, $T_3$ | $2$ | $760$ ms | $252$ ms | $150$ ms |
| order-$6$ level $13$, $T_2$ | $1$ | $310$ ms | $216$ ms | not comparable |

The exact trace/determinant fingerprints on the quadratic rows and the minimal
polynomial fingerprint on the cyclotomic row agreed before ratios were
reported. These are diagnostic timings, not immutable performance gates; use
several samples for a release receipt.
