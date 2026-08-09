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
pnpm bench:numbers
pnpm bench:brython
pnpm bench:programs
pnpm bench:numbers:check
pnpm bench:cowasm:ceilings
pnpm bench:cowasm:landscape
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
changing the common corpus. Repeat the option to select several cases:

```sh
pnpm bench:cowasm -- --only gcd --only xgcd --samples 7 --warmups 3
```

Set `SAGEJS_COWASM_PYTHON` to select another Python executable. Pass an
additional runtime explicitly to include SageLite or another compatible
interpreter:

```sh
pnpm bench:numbers -- --runtime sagelite=/path/to/sagelite
```

`bench:numbers` is the first named performance suite. It covers the eight
integer workloads in upstream `numbers.py` and keeps them in one persistent
process per runtime. Named suites live in `performance-suites.json`; they are
selections from the unchanged compatibility corpus, not rewritten benchmark
implementations.

`bench:brython` selects the language and object-model microbenchmarks from
`brython.py`. `bench:programs` selects the larger Pystone, nbody, recursive
Fibonacci, and matrix-multiplication workloads. They use the same persistent
process, warmup, and comparative reporting as `bench:numbers`. For a focused
nbody measurement:

```sh
pnpm bench:cowasm -- --only nbody --samples 5 --warmups 2
```

Write a machine-readable report when comparing revisions or machines:

```sh
pnpm bench:numbers -- --samples 7 --warmups 3 --json /tmp/numbers.json
```

The versioned JSON contains every sample, first-pass and warm medians, ratios
to CPython, runtime versions, the complete corpus source-tree hash, Git state,
and host CPU/load/memory metadata. Generated reports are observations, so they
are not committed as source.

`bench:numbers:check` applies `numbers-budget.json`. Each workload has two
relative-to-CPython thresholds:

- `targetRatio` is an improvement goal and is reported without failing.
- `maxRatio` is a deliberately loose regression ceiling and fails the command.

Relative ceilings remove most differences between fast and slow machines, but
they cannot eliminate scheduler noise. Use several warmed samples on a quiet
host before tightening a ceiling. Absolute timings and workload-weighted totals
remain diagnostic data rather than pass/fail criteria.

This is a historical language-runtime corpus, not a substitute for
domain-specific mathematical benchmarks. Its value is that compatibility and
performance are measured with the same readable Python programs, and that
newly supported workloads can move into the corpus without creating a
separate synthetic test.

`bench:cowasm:ceilings` runs hand-written JavaScript translations of a few
hot paths. They are deliberately not compatibility tests or a competing
score: they answer the narrower question “is V8 the limit here, or is the
generated/runtime machinery the limit?”

## Cross-language landscape

The landscape command compares a deliberately narrower scalar subset with
algorithm-equivalent Julia, PARI/GP, Magma, and C translations. It also runs
the unchanged Python bodies under Sage.js, CPython, and PyPy, plus
source-transparent Native Kernel adaptations where the current typed subset
can express the same operation counts. The manifest in the landscape directory
states the equivalence contract and expected checksum for every workload.
Translations use the same loops and algorithms instead of replacing them with
language or library builtins.

The AOT inputs live in `native/`. They receive runtime parameters where needed
to prevent fixed-input constant folding, but retain the source algorithms.
They currently cover all nine landscape workloads: exact integer loops,
recursive calls, checked overflow-capable arithmetic, integer division, and
binary64 conversion/absolute-value loops. This is a compiler experiment, not a
claim that the remaining object-model-heavy corpus is naturally expressible in
C, GP, or the current typed subset.

Unavailable optional runtimes are reported and skipped. To include Magma from
a nonstandard installation and require every selected runtime, run:

    SAGEJS_COWASM_MAGMA=/work/bin/magma \
      pnpm bench:cowasm:landscape -- --strict

The command accepts `--only ID`, `--runtime NAME`, `--samples`, `--warmups`,
and `--json`.
This comparison is intentionally separate from the 61-workload compatibility
score. Translating dynamic object-model microbenchmarks to C or GP would
measure different language constructs rather than the same program.

The compatibility corpus currently contains 61 registered workloads; the
older 58-workload description predates three additional dictionary and parsing
cases. Audit the complete source tree without building native artifacts with:

```sh
sagejs native audit bench/cowasm/src
sagejs native audit bench/cowasm/src --json
```

## Packed-buffer numerical landscape

Native Kernel v13's focused packed-buffer comparison compiles the actual typed
Python n-body and repeated matrix-multiplication bodies in
`native/numerical_buffers.py`. It compares those bodies with their generated
JavaScript fallback, CPython, PyPy, Julia, and an algorithm-equivalent C
translation. Inputs are prepared outside the measured region, every runtime
checks the same deterministic result, and native compilation happens before
measurement:

```sh
pnpm bench:cowasm:buffers
pnpm bench:cowasm:buffers -- --runtime native --runtime c --json report.json
```

The runner accepts `--only`, `--runtime`, `--samples`, `--warmups`, `--strict`,
and `--json`. Set `SAGEJS_COWASM_JULIA` when Julia is not on `PATH`.
