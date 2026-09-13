# Explicit NLopt Nelder–Mead

Sage.js provides one exact explicit method from its authenticated NLopt Wasm
reactor:

```python
from sagejs.numerics.optimization import minimize

result = minimize(
    lambda point: (point[0] - 2.0)**2 + (point[1] + 1.0)**2,
    [5.0, 5.0],
    bounds=[[-10.0, 10.0], [-10.0, 10.0]],
    method="nlopt-nelder-mead",
)
```

The exact outward identity is NLopt's `NLOPT_LN_NELDERMEAD`. It is available
only when explicitly requested and is not an alias for generic `nelder-mead`.
Automatic planning continues to choose the source-transparent ordinary-Python
implementation.

## Honest result semantics

Derivative-free optimization of an opaque callback cannot certify local
minimality from finitely many samples. Smooth functions can hide an arbitrarily
narrow descent region between every deterministic probe. Therefore a positive
NLopt result has:

- `validation.truth_level == "heuristic"`;
- `domain_payload["local_optimum_certified"] == False`; and
- `domain_payload["global_optimum_certified"] == False`.

Heuristic success still has strict independent guardrails. The backend must
terminate positively; the candidate and objective must be finite; box bounds,
callback counters, cancellation, and budgets must be consistent; an independent
finite-difference projected-gradient check must be empirically stationary; and
a bounded coordinate-scaled direction set must contain no representably lower
feasible sample. Any observed contradiction or incomplete required evidence
vetoes success. These checks are useful evidence, not a theorem that an optimum
exists at the reported point.

The public envelope is at most 32 variables with optional box bounds. Active
bounds that do not have a numerically resolved first-order sign remain
`indeterminate`. Objective/gradient callbacks, nonlinear constraints, automatic
selection, and claims of local or global optimality are outside the envelope.

## Why COBYLA is deferred

Sage.js previously evaluated NLopt's `NLOPT_LN_COBYLA`. Source-bound sanitizer
qualification found the formal f2c one-based pointer-provenance undefined
behavior tracked by upstream NLopt issue #611. The affected indexing crosses
`cobyla`, `cobylb`, and `trstlp`; it is not a narrow adapter defect that can be
fixed responsibly with a small local patch. The COBYLA source is now absent
from the compiled closure and `nlopt-cobyla` is explicitly unsupported.

A future nonlinear-constraint backend should use the modern PRIMA COBYLA
implementation (or another mature sanitizer-clean implementation), qualify its
exact outward identity separately, and retain the same independent feasibility,
resource, provenance, and heuristic-optimality contract.

## Source and runtime closure

The reactor is built from pinned NLopt revision
`6e6593f131ba3a38bc9edbed0a357bc01526e54b` with Luksan and C++ algorithms
disabled. Only upstream Nelder–Mead plus required MIT-licensed utility sources
enter compilation. The final artifact has one packed callback import and is
authenticated against the production manifest in Node, browser, npm, and SEA
resource loaders.

The narrowed reactor completed its component qualification at commit
`100d2165ef00a69ff594d72bc82b9617c9c6567a`. The checked production manifest
records qualified sanitizer, destructive-Wasm, browser-lifecycle,
public-integration, corruption, relocation, SEA, and four-platform portable
evidence for the exact 72,592-byte artifact with SHA-256
`8abe4760d3be541fa9d86ad3af6c33eb3241d3e423fd20e4fc85393c141678eb`.
See the machine-readable
[`production-manifest.json`](../../../src/lib/sagejs/numerics/optimization/backends/nlopt/release/production-manifest.json)
and
[`qualification-v1.json`](../../../src/lib/sagejs/numerics/optimization/backends/nlopt/release/qualification-v1.json).

That component qualification does not by itself qualify a later Sage.js source
commit or the complete numerical product. Every release candidate must still
bind these exact reactor bytes through its Node, npm, SEA, and browser artifacts
and pass the source-current P8 product gate without source changes.
