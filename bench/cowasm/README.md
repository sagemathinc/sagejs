# CoWasm Python benchmark corpus

This directory vendors the ordinary-Python part of CoWasm's benchmark suite
as a shared Sage.js compatibility and performance corpus.

## Provenance

- Repository: <https://github.com/sagemathinc/cowasm>
- Revision: `399e57372483049c668ebe5a21f57231a8482236`
- Source directory: `python/bench/src`
- Imported: 2026-07-28
- Upstream license: BSD 3-Clause; see [`LICENSE`](LICENSE)

The benchmark bodies are preserved unchanged. The only upstream-file change is
a three-line `registered_benchmarks()` accessor in `bench.py`; Sage.js's module
compiler deliberately does not export module globals directly. The additional
`src/corpus.py` runner imports the same modules and executes the same registered
benchmark callables, but deliberately allows exceptions to terminate the
process. The upstream runner catches them because it was written for
exploratory timing; silent failures are unsuitable for a compatibility test.

The adjacent CoWasm `cython` and `zig` directories are implementation-specific
experiments, not common Python inputs, so they are referenced here rather than
vendored. `mandel.py` is included for provenance but remains excluded from the
registered corpus exactly as it is upstream.

## Running

From the Sage.js repository root:

```sh
pnpm test:cowasm
pnpm bench:cowasm
pnpm bench:cowasm:ceilings
```

The compatibility command runs all registered workloads under Sage.js and
requires every benchmark assertion and import to succeed. The performance
command compiles once, then runs the identical source in one Sage.js process
and one CPython process. Warmup and measured corpus passes happen inside those
processes, so V8 optimization survives into the measured samples. Process
startup and Sage.js compilation are intentionally outside the per-case times.

The report separately shows the first in-process pass and warm medians. It
also reports the median and geometric mean of the per-benchmark ratios. The
historical benchmark iteration counts differ greatly, so the sum-of-medians
ratio is useful for tracking this exact workload but is not a neutral overall
language score.

Use `--samples N` or `--warmups N` after `--` to change the defaults:

```sh
pnpm bench:cowasm -- --samples 5 --warmups 2
```

Use `--only` with an exact benchmark name for focused profiling without
changing the common corpus:

```sh
pnpm bench:cowasm -- --only ord_builtin --samples 7 --warmups 3
```

Set `SAGEJS_COWASM_PYTHON` to select another Python executable. Pass an
additional runtime explicitly to include Sage:

```sh
pnpm bench:cowasm -- --runtime sage=/path/to/sage
```

This is a historical language-runtime corpus, not a substitute for
domain-specific mathematical benchmarks. Its value is that compatibility and
performance are measured with the same readable Python programs, and that
newly supported workloads can move into the corpus without creating a
separate synthetic test.

`bench:cowasm:ceilings` runs hand-written JavaScript translations of a few
hot paths. They are deliberately not compatibility tests or a competing
score: they answer the narrower question “is V8 the limit here, or is the
generated/runtime machinery the limit?”
