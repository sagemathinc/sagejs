# $\mathbf Q(\sqrt5)$ Hilbert Brandt competitive receipt

This report summarizes the machine-readable receipt
`mestre-hilbert-sqrt5-competitive-linux-x64-2026-08-28.json`.

- Sage.js source: `de68f4213fd4246302bdf755b146fc7f3bb08884`
- Host: Linux x64, AMD EPYC 7B13, Node 26.7.0
- Magma: 2.18-5
- Samples: three fresh Sage.js processes and three fresh Magma processes per
  level
- Equal contract: public module construction plus first $T_2$
- Exact gate: Magma's cuspidal $T_2,T_3$ characteristic polynomials equal the
  Sage.js ambient polynomials after removing the Eisenstein factors $x-5$ and
  $x-10$

Times are medians. Sage.js uses wall time and Magma uses its CPU timer.

| level norm | ambient dimension | Sage.js | Magma | Sage.js / Magma |
|---:|---:|---:|---:|---:|
| $31$ | $2$ | $178.826$ ms | $580$ ms | $0.308$ |
| $389$ | $7$ | $204.779$ ms | $620$ ms | $0.330$ |
| $809$ | $14$ | $257.207$ ms | $630$ ms | $0.408$ |
| $2011$ | $35$ | $401.616$ ms | $700$ ms | $0.574$ |

The comparison is deliberately process-cold because both systems cache Hecke
operators aggressively. Magma's timer-resolved cached $T_2$ lookup is about
$90$--$100\,\mu$s; it is not used as the equal-contract row. Peak sampled
process-tree RSS was 256,253,952 bytes for Sage.js and 54,214,656 bytes for
Magma. Those process totals include different runtime baselines.

Receipt SHA-256:
`1c147511d27072513cf64affcd2b3cb6a0e04a1ed80bd7fc48a0d80d5e13aabf`.
