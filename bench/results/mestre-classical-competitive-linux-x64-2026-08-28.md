# Classical Mestre/Brandt competitive receipt

This report summarizes the machine-readable receipt
`mestre-classical-competitive-linux-x64-2026-08-28.json`.

- Sage.js source: `db4192c2c82707c84fb374ae67fb25fedf31bad0`
- Host: Linux x64, AMD EPYC 7B13, Node 26.7.0
- Samples: 3 fresh Sage.js processes per prime; 3 fresh Magma Brandt modules
  per prime and mode
- Magma: 2.18-5, with `gram-theta` and `neighboring-ideals` kept separate
- Exact gate: dimensions, row sums, and complete characteristic polynomials
  agree in every sample

The equal-contract time is public module construction plus the first $T_2$.
Times are medians; Sage.js uses wall time and Magma uses its CPU timer.

| $p$ | dimension | Sage.js | Magma Gram/theta | Magma neighboring ideals |
|---:|---:|---:|---:|---:|
| 37 | 3 | 88.104 ms | 40 ms | 80 ms |
| 389 | 33 | 204.913 ms | 1460 ms | 870 ms |

At level $389$, the Sage.js median full-degree projected Krylov proof is
33.784 ms after construction. Magma's timer-resolved cached $T_2$ lookup is
about $1.2$--$1.3\,\mu$s in both modes; this is a cache-lookup measurement, not
a reconstruction of the operator.

Peak sampled process-tree RSS was 260,853,760 bytes for a fresh Sage.js run
and 26,984,448 bytes for Magma. These absolute totals include very different
runtime baselines and are reported as resource envelopes, not as payload-only
storage. The Sage.js authoritative level-$389$ operator contains only $95$
nonzero entries.

An exploratory level-$10007$ Magma `BrandtModule` run was interrupted after
586.097 seconds without completing a record. It is deliberately excluded from
the accepted timing table. Sage.js retains level $10007$ as its large sparse
witness: dimension $835$, $2502$ nonzero entries, and an exact full-degree
projected proof in about 4.08 seconds once $T_2$ is built.

Receipt SHA-256:
`44553c103c6fbb2d7f2c6979c873f1b23809bd1e21ce2d7ff8dd62d83a9b4c9f`.
