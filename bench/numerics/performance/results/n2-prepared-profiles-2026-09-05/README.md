# Complete prepared-query profiles

These two **local diagnostic profiles are not latency qualification**. They use
the owned full compiler/module/runtime build of the `3fc0831aa` mathematical
source, the source-compiled optional binary64 kernels, and the same 20,000-value
offset-data workload. The native route is asserted during preparation. The
existing authenticated optimizer sampler seals lazy imports before measuring
100 full public queries, after three warmups, separately for no trace and summary.

The mathematical/compiler/runtime source did not change in the later receipt
documentation commits. Full raw reports are retained as gzip assets, with both
compressed and original digests in `profile-summary.json`; the profile driver
is retained alongside them. The observations include the source-map bindings,
actual generated-script identities, engine samples, and execution status.

| Raw engine label | No trace | Summary |
| --- | ---: | ---: |
| Stable packed ordering helper, self samples | 19.3% | 19.1% |
| Python `instanceof` helper, self samples | 11.9% | 11.8% |
| Attribute lookup helper, self samples | 6.1% | 6.5% |
| Internal member lookup, self samples | 5.7% | 5.5% |
| Truth conversion, self samples | 5.2% | 4.6% |

The sorting comparator has additional separate samples; rows above are not an
inclusive call tree or a complete phase partition. Only 148/6000 and 136/6206
samples map to authenticated Python source spans. **Do not normalize that tiny
matched subset into a claimed complete Python bottleneck map.** The raw engine
labels point to ordering and object/validation machinery, not an attribution
proof that a particular Python constructor owns every runtime sample.

The sampled wall spans are about 3.56 s and 3.69 s for 100 calls. Instrumentation
changes execution costs: use the separate uninstrumented development report for
query medians. The sampler's ~34–35 s preparation includes compilation, import
authentication and profile setup; it is not the ~0.5 s `StatisticsData` setup cost.

Next experiments should measure trusted internal result/projection construction
and ordering independently, while preserving defensive public copies, bounded
visualization data and final mathematical validation. Do not optimize only the
arithmetic kernel and call the 10 ms public target achieved. The independent
floating native/Wasm packaging work is a separate prerequisite, not a substitute
for reducing the remaining full-query costs.

Reproduce after compiling the two statistics source modules into an explicitly
selected cache and preparing the corresponding owned application build:

```sh
SAGEJS_NATIVE_CACHE_DIR=/path/to/selected/cache SAGEJS_NATIVE_DISABLE=0 \
  node scripts/optimizer-profile.cjs --language python --entry query_none \
  --prepare prepare --warmups 3 --repetitions 100 --sampling-interval 500 \
  --output build/new-profile.json \
  bench/numerics/performance/results/n2-prepared-profiles-2026-09-05/prepared-profile.py
```

Use `query_summary` for the other trace policy. There is no new profiler or
benchmark service; this reuses `scripts/optimizer-profile.cjs`.
