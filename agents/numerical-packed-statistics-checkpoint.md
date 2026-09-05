# N2 packed-statistics checkpoint

Work in progress; **no public dispatch or speedup is enabled yet**.
The existing statistics API and its generic input/callback behavior are unchanged.

The first private typed-Python reduction adapts CPython's accurately rounded
finite partials sum. The full PSF license and source/change notice are retained
under `licenses/`. This is the owned reduction primitive, not a replacement
for the complete `math.fsum` interface or a competing external math library.
The same body is lowered by the existing compiler; it does not select an
unrelated handwritten C function. It uses bounded caller-owned packed input,
scratch and output and makes no callbacks after marshalling. Caller-side
non-aliasing, input ownership and work/memory limits must precede public use.

Completed source-path checks:

- 200 independent exact-rational / CPython cases: cancellation, half-even
  correction, large offsets, subnormals, signs, nonfinite values and overflow.
- Bitwise comparisons in generated JavaScript IR, native C, and emitted Wasm.
- All 200 cases executed in real Chromium, Firefox and WebKit workers; a host
  import invocation throws, proving the tested arithmetic stays isolated.
- Separate ordinary Sage.js source fallback checks; output is unchanged on
  rejected input/capacity and inputs stay unmodified.
- Strict Python: 368 modules, zero errors.
- Architecture checks pass, including the explicit acyclic dependency from
  numerical statistics to the lazy native marker/buffer interface. This does
  not add a dependency on a FLINT package or enable a production kernel.

Commands (a prepared existing native dependency prefix and WASI toolchain are
needed for compiler tests; browser mode requires the three Playwright engines):

```sh
pnpm test:baselib:strict
SAGEJS_NUMERICAL_BROWSER_TESTS=1 node --test test/numerics/performance/packed-reductions.cjs
node bench/numerics/performance/packed-sum.cjs --output build/numerical-performance/packed-sum.json
```

The benchmark is intentionally classified as a **kernel opportunity** and
separates reused storage from packing/allocation. It does not time `describe()`
or justify automatic selection. Tests currently use the already-built,
unchanged compiler plus the new source explicitly, not a claim of a complete
fresh product build at this working revision.

An exploratory local run on Linux x64 / Node 26.8.1 measures the 20,000-value
sum at 0.119 ms with reused native buffers and 0.277 ms including input/scratch/
output allocation; the generated JavaScript IR takes 11.53 ms. The standalone
addon is 14,504 bytes and compilation took about 920 ms. These are one-run
opportunity measurements on a dirty, source-hashed development candidate,
not paired public-API speedups or accepted crossover thresholds. Frozen,
repeatable product measurements still have to include the surrounding costs.

## Required next steps

1. Add source-transparent centered/scaled reductions with the same accuracy,
   overflow and independent-check contracts; then connect a complete public
   statistics operation and retained-query path.
2. Preserve generic iterators, float-conversion hooks, exceptions, cancellation
   order and exact evaluation budgets. A compiled loop cannot call user Python
   or JavaScript; prove a checked input envelope rather than moving arbitrary
   callbacks across it.
3. Avoid binding these small floating kernels to the monolithic exact-arithmetic
   production pack. The current standalone compiler also checks for an MPC
   development prefix even for float-only code; reuse it for experiments, but
   do not confuse that build dependency with an acceptable numerical runtime
   dependency. Qualify a small independently lazy native/Wasm path.
4. Measure the entire public call against the frozen `bd26cfefb` baseline,
   including packing, independent validation, results, cancellation and memory;
   then qualify four native platforms and real public browser workers.

The public `describe(20_000)` baseline still costs about 1.57 seconds. Its
rough diagnostic spends about 496 ms in input/budget work and 479 ms in centered
sums of squares. Fast summation alone cannot meet the 10 ms program target.
