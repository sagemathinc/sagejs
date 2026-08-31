# Dense numerical linear algebra benchmark

`benchmark.py` measures the ordinary-Python, same-source fallback. It keeps
storage conversion, LU factorization, retained-factor solves, independent
validation, pivoted QR, Jacobi diagnostics, the complete structured operation,
and trace collection separate. Every timed result passes the same independent
backward-error gate before the JSON record is published.

Run an identical 16-by-16 workload with three measured samples after one
warmup:

```bash
PYTHONPATH='' python3 -I -c '
import collections.abc, hashlib, json, math, sys, typing
sys.path.insert(0, "src/lib")
sys.path.insert(1, ".")
from bench.numerics.linear_algebra.benchmark import benchmark
print(json.dumps(benchmark(16, 3), sort_keys=True))
'

node bin/sagejs --python bench/numerics/linear_algebra/benchmark.py
```

The CPython command deliberately imports standard-library modules before
putting `src/lib` first, matching the repository's differential-test harness.
The benchmark is representative evidence, not a backend competition: no
accelerated backend is selected in this lane. Record host, revision, runtime,
size, sample policy, and the complete JSON when using its timings in a claim.
