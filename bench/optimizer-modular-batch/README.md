# Complete modular batch benchmark

Run from the repository root after `pnpm build`:

```sh
node bench/optimizer-modular-batch/benchmark.cjs --check
```

The workload evaluates a three-input complete batch over `Zmod(65521)`. The
V8 timing includes boxed-input validation/copying, private result staging, and
public result materialization. A matched JavaScript object loop is reported as
a lower bound, while a short real Sage.js `O0` run supplies the projected
dynamic baseline. All paths are checked with exact modular checksums.

The report also records the exact structural costs of the resident Wasm and
coarse native candidates. They remain rejected with stable capability reasons
until an isolated batch lowering is registered: the benchmark does not relabel
an unrelated kernel as this source-derived operation graph.

The v1 plugin is intentionally selected only by an import-proven contract:

```python
from sagejs.compiler import optimize

@optimize(require="math.modular-batch-region.v1", target="v8")
def batch(count, left, right):
    out = [None for _slot in range(count)]
    for index in range(count):
        out[index] = left[index] * right[index] + 7
    return out
```

Unannotated loops retain the existing optimizer competition. The plugin source,
verifier, and emitter are lane-owned; executable catalog and dispatcher
registration is deliberately left to the integration lane.
