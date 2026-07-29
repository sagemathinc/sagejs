# Odlyzko zeta-zero data notice

`src/baselib/zeta_data.py` contains a compressed, generated prefix of the
`zeros6` table distributed by SageMath as `database_odlyzko_zeta` version
20061209. The table is attributed to Andrew Odlyzko and contains numerical
ordinates of nontrivial zeros of the Riemann zeta function.

SageMath package documentation:

<https://doc.sagemath.org/html/en/reference/spkg/database_odlyzko_zeta.html>

Upstream package archive:

<https://mirrors.mit.edu/sage/spkg/upstream/database_odlyzko_zeta/database_odlyzko_zeta-20061209.tar.bz2>

- package archive SHA-256:
  `8919f01992718b9bf5c0602dbf16dd9d6f58b141b25f67f5cfd59f6cd0f9a0d4`
- extracted `zeros6` SHA-256:
  `2ef7b752c2f17405222e670a61098250c8e4e09047f823f41e2b41a7b378e7c6`
- embedded rows: first 15,000
- retained precision: nine decimal places

The generated representation is reproducible with
`scripts/build-odlyzko-subset.cjs`. Sage.js is distributed under
GPL-3.0-only; the CoWasm packaging of this same SageMath data package declares
`GPL-2.0-or-later`.
