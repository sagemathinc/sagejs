# Browser numeric literal pooling

The browser compiler now enables the same numeric-literal pool mechanism used
by the Node evaluator for ordinary compiled Python and Sage cells. Bootstrap
and the separate dynamic-compilation path retain their existing unpooled
policy. Each compilation gets a distinct pool prefix; initialization does not
reset the counter within a compiler worker's lifetime. A new worker has a new
execution context. Ordinary cells also use the compiler's reusable main-module
namespace, preserving earlier definitions across imports and later cells.

Pooling requires `AST_Call.numeric_literal`, set by the numeric-token lowerer.
A spelling such as `Integer("2")` is not sufficient: explicit calls must still
resolve local callables and execute their side effects at the original point.
This closes a pre-existing issue in the Node pool as well as making the browser
change safe. Literal object identity is not promised; numeric values remain
immutable and their type/value semantics are preserved.

## Qualification

`test/compiler-numeric-literal-pool.cjs` exercises Python and Sage values,
explicit constructor-call effects, and closures surviving later and failed
cells. `packages/flint-wasm/test/compiler-numeric-literal-pool.test.mjs` tests
the actual worker output policy and distinct prefixes without Wasm.

The specialized `packages/flint-wasm/test/browser-numeric-literal-pool.mjs`
uses actual Chromium with an existing built browser runtime, substituting the
candidate compiler, compiler frontend, and worker. It checks both policies in
both modes, saved definitions, failure recovery, exact decimal/hex integers,
`math.sqrt`, observable list contents/sum, and session reset. It is not a full
production-bundle or four-platform qualification. The existing browser runtime
does not provide `fractions`; no package-coverage claim is made for it.

For an existing browser artifact, first build the candidate with `pnpm build`
and bundle its frontend using `packages/flint-wasm/scripts/build-compiler-frontend.cjs`
(the same helper used by the Wasm build). Set `SAGEJS_AUDIT_BROWSER` to the
built browser package root and `SAGEJS_AUDIT_FRONTEND` to that candidate frontend,
then run:

```sh
node --test test/compiler-numeric-literal-pool.cjs
node --test packages/flint-wasm/test/compiler-numeric-literal-pool.test.mjs
node packages/flint-wasm/test/browser-numeric-literal-pool.mjs
```

## Local measurement, 2026-09-15

Chromium 149 on Linux x64, shared EPYC host. Five samples, first two excluded
from warm medians. Compilation/bootstrap are excluded. Other qualification
jobs were active, so these are directional measurements, not acceptance
thresholds or CPython comparisons.

| Workload | Python unpooled / pooled | Sage unpooled / pooled |
| --- | ---: | ---: |
| 100,000 repeated assignments | 472.8 / 0.190 ms | 769.0 / 0.215 ms |
| Materialize 10,000 values and verify sum | 51.0 / 3.48 ms | 191.0 / 63.7 ms |

The assignment loop can be eliminated by the JavaScript JIT once allocation
is removed; its huge ratio is not a whole-program speedup. The materialized
list/sum probe gives approximately 15x (Python) and 3x (Sage), and includes
assertions on both its length and numerical sum. Startup remains a separate
cost; this change does not establish a startup improvement.

## Handoff status

The full local build passes, including the native-kernel pack after provisioning
FLINT and its generated FFI adapter. Architecture checks, seven focused Node
pool tests, the browser policy/session tests, and three literal-evaluation and
float-coercion checks pass. Both browser modes pass the component qualification
above with pooling on and off.

The broader compiler fixture suite is not green: 24 pass, 34 are skipped by
existing fixture policy, and 8 fail. Seven failures report missing polynomial
module imports (`packed_prime_field`, `field_capabilities`, or
`extension_mpoly_backend`); `algebra.py` times out. The polynomial failure also
reproduces alone after the complete native build, so it is not merely the
earlier missing-addon setup problem. This fixture harness does not enable
numeric pooling, but that observation alone is not a baseline comparison.
No assertions, classifications, or timeouts have been relaxed. PR #289 remains
draft pending accounting for these broader failures and CI results.
