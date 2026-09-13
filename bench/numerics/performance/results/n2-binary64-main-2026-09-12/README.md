# Binary64 summation opportunity on current-main source

This is a **local kernel-only opportunity measurement**, not a confirmed public
statistics speedup, a four-platform qualification, or a `describe` target pass.
The clean source is `c092f9fe7a923da053638569d51f41619b693bcf`, independently
based on main `c4c126d09`. Public dispatch remains unchanged.

The collector runs the actual typed `finite_sum` body through native and
generated-JavaScript backends, and compares matched finite offset inputs with
CPython's mature compiled `math.fsum`. Each retained sample is a checked batch;
raw batch times, per-call times, three warmup batches and seven retained batches
are recorded in [local-opportunity.json](local-opportunity.json). The loop/clock
control is reported, never subtracted. Native reused-storage and fresh
packing/allocation are separate. The independent 200-case correctness corpus
and sanitizer tests are not timed as part of this experiment.

| Input length | Native reused | Generated JS IR reused | Native packing/allocation | CPython `math.fsum` |
| --- | ---: | ---: | ---: | ---: |
| 1,000 | 0.00853 ms | 0.4476 ms | 0.01727 ms | 0.00578 ms |
| 20,000 | 0.1166 ms | 9.3063 ms | 0.2927 ms | 0.1154 ms |
| 100,000 | 0.5817 ms | 46.0894 ms | 0.9104 ms | 0.5725 ms |

On this workload, the compiled body approaches the established C routine's
throughput. This supports continuing typed whole-region reductions. It does
**not** show that public statistics is similarly fast: input conversion,
ownership, sorting/MAD, work/cancellation guards, independent validation,
structured results and trace handling remain outside these timings. Generated
JS IR is not the ordinary object-heavy dynamic Sage.js public path either.

Host: Linux x64, AMD EPYC 7B13, Node 26.8.1. No other build or test from this
lane ran locally during collection; the shared host's recorded load average
was 6.24 / 7.44 / 9.33, so this is not independent quiet-host confirmation.
The retained artifact is 14,504 bytes; measured compile setup was about
808 ms. That is not a clean-install startup, total dependency footprint, peak
memory or browser transfer measurement. The report binds source, collector,
core, addon and cache identities. Other samples and allocation variability
remain visible; only medians are summarized above.

Reproduce on a clean, built checkout of the exact source commit:

```sh
node bench/numerics/performance/packed-sum.cjs \
  --output build/numerical-performance/binary64-main-opportunity.json

SAGEJS_NUMERICAL_BROWSER_TESTS=1 SAGEJS_NUMERICAL_SANITIZER_TESTS=1 \
  node --test --test-concurrency=1 \
  test/numerics/performance/packed-reductions.cjs \
  tools/native-kernel/test/float64-conditional.cjs
```

Explicit browser qualification requires the prepared WASI toolchain and all
three installed Playwright engines. Explicit sanitizer qualification requires
a supported native C compiler with address/undefined-behavior/leak detection;
an unavailable requested capability fails rather than becoming a passing skip.
Use the checkpoint in `agents/numerical-binary64-main-checkpoint.md` for the
separate broader-test failures and remaining acceptance work.
