# Approximation benchmark

`benchmark.py` is a deterministic dynamic-source workload, not a release
performance claim. It measures:

- construction of a 32-node Chebyshev-grid barycentric interpolant and 1,000
  scalar queries;
- construction of a 2,001-node natural cubic spline and 1,000 scalar queries;
- 200 independently planned fourth-order first derivatives with analytic
  validation; and
- construction of a degree-64 Chebyshev approximation and 1,000 Clenshaw
  queries.

The `--check` guardrails are deliberately broad CPython regression limits.
Sage.js execution is recorded separately because its object-level dynamic
fallback has a different constant factor:

```sh
python3 -I bench/numerics/approximation/benchmark.py --check
node bin/sagejs --python bench/numerics/approximation/benchmark.py
```

The checked-in [`linux-x64-baseline.json`](linux-x64-baseline.json) is a
single-sample development-host observation. It establishes workload and result
equivalence through the shared checksum, but it is not a multi-sample release
receipt or a claim of superiority over SciPy. Live SciPy/NumPy performance was
not used to choose these ordinary-Python algorithms; the differential corpus
uses those libraries for correctness.
