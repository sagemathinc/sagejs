# Scalar native-call boundary benchmark

The checked cross-runtime measurements and interpretation are in
[`RESULTS.md`](./RESULTS.md). Machine-readable medians are in
[`results-2026-08-26.json`](./results-2026-08-26.json).

This benchmark isolates the fixed cost of calling a native function that adds
two signed 32-bit integers and returns one signed 32-bit integer. It compares:

- a checked Node-API callback using `napi_get_value_int32` and
  `napi_create_int32`;
- a typed WebAssembly `(i32, i32) -> i32` export;
- CPython's modern `METH_FASTCALL` extension ABI;
- CPython's legacy tuple-forming `METH_VARARGS` extension ABI.

Each harness also times an inline dependency-chained loop. The report includes
both raw time and the approximate incremental boundary cost obtained by
subtracting that same-runtime loop median. Nine rotated samples are used by
default so frequency and temperature drift are not always charged to the same
case. The final accumulator is checked after every sample.

On Linux or macOS:

```sh
bench/call-boundary/build-posix.sh
node bench/call-boundary/benchmark-js.mjs
bun bench/call-boundary/benchmark-js.mjs
deno run --allow-ffi --allow-read bench/call-boundary/benchmark-js.mjs
PYTHONPATH=bench/call-boundary/build \
  python3 bench/call-boundary/benchmark-python.py
```

On Windows, run the equivalent build from PowerShell with Visual Studio C++
Build Tools installed:

```powershell
bench/call-boundary/build-windows.ps1
node bench/call-boundary/benchmark-js.mjs
bun bench/call-boundary/benchmark-js.mjs
deno run --allow-ffi --allow-read bench/call-boundary/benchmark-js.mjs
$env:PYTHONPATH = "bench/call-boundary/build"
python bench/call-boundary/benchmark-python.py
```

The JavaScript harness is deliberately shared unchanged by Node, Bun, and
Deno. The downloaded Node headers define the stable Node-API ABI used by all
three runtimes; the addon is compiled only once per operating system and
architecture. WebAssembly bytes are embedded directly, avoiding a compiler or
toolchain difference in that case.
