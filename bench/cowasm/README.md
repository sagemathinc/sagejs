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
```

The compatibility command runs all registered workloads under Sage.js and
requires every benchmark assertion and import to succeed. The performance
command runs the identical source in fresh Sage.js and CPython processes,
checks that both report the same benchmark names, and prints median timings
and ratios. Process startup is intentionally outside the reported per-case
times.

Use `--samples N` or `--warmups N` after `--` to change the defaults:

```sh
pnpm bench:cowasm -- --samples 5 --warmups 2
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
