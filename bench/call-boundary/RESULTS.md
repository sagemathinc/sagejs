# Scalar native-call boundary results

Measured 2026-08-26. The operation is deliberately tiny: add two signed
32-bit integers and return one signed 32-bit integer. The inputs remain in
range, so arithmetic policy does not dominate the call.

The absolute scale is the first important result: `0.1 ms` is `100,000 ns`.
The measured Node-API calls took **30–69 ns**, and typed WebAssembly calls took
**7–41 ns**. The original `0.1 ms` estimate was therefore about 1,450–3,300
times too high for Node-API and 2,400–14,000 times too high for WebAssembly.

## Incremental boundary cost

These medians subtract the same runtime's dependency-chained inline loop.
They are the best estimate here of boundary cost, but subtraction of two
microbenchmarks is necessarily approximate.

| Host | Node N-API | Bun N-API | Deno N-API | Node Wasm | Bun Wasm | Deno Wasm | CPython FASTCALL | CPython VARARGS |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Linux x64, EPYC 7B13 | 39.6 ns | 60.1 ns | 56.3 ns | 7.1 ns | 7.0 ns | 7.1 ns | 14.0 ns | 41.3 ns |
| Linux ARM64, Neoverse-N1 | 47.8 ns | 81.1 ns | 98.5 ns | 11.1 ns | 9.7 ns | 11.0 ns | 13.9 ns | 74.6 ns |
| Windows x64, EPYC 7B13 | 29.9 ns | 79.6 ns | 68.0 ns | 7.1 ns | 6.7 ns | 7.5 ns | 21.1 ns | 63.3 ns |
| macOS ARM64, M1 Max | 67.5 ns | 110.2 ns | 108.8 ns | 39.6 ns | 14.3 ns | 38.7 ns | 24.9 ns | 108.5 ns |

## Raw elapsed time

Raw medians include the language loop, call, argument handling, addition, and
result handling. This is the number that controls elapsed time for a real loop
with one boundary crossing per iteration.

| Host | Node N-API | Bun N-API | Deno N-API | Node Wasm | CPython FASTCALL |
| --- | ---: | ---: | ---: | ---: | ---: |
| Linux x64, EPYC 7B13 | 39.9 ns | 60.3 ns | 56.6 ns | 7.5 ns | 40.0 ns |
| Linux ARM64, Neoverse-N1 | 48.6 ns | 81.4 ns | 99.3 ns | 11.8 ns | 61.5 ns |
| Windows x64, EPYC 7B13 | 30.2 ns | 79.9 ns | 68.4 ns | 7.5 ns | 62.0 ns |
| macOS ARM64, M1 Max | 68.9 ns | 110.7 ns | 110.2 ns | 41.0 ns | 83.2 ns |

## What the measurements say

- CPython's modern C boundary really is cheaper than Node-API in isolation:
  FASTCALL was 1.4–3.5 times cheaper incrementally. But CPython was not three
  times faster end to end. Its raw call loop tied Node on Linux x64 and was
  1.2–2.1 times slower on the other hosts because the Python loop itself cost
  26–58 ns, versus roughly 0.2–1.4 ns for the optimized JavaScript loop.
- Bun was slightly faster for an ordinary JavaScript call on every tested
  host, but its Node-API compatibility boundary was 1.5–2.7 times slower than
  Node's. A fast JavaScript engine does not imply a fast Node-API bridge.
- Deno's JavaScript and WebAssembly results closely tracked Node on all four
  hosts. Its Node-API compatibility boundary was 1.4–2.3 times slower.
- Typed WebAssembly was substantially cheaper than Node-API: 4.2–5.6 times on
  the x64 and Linux ARM hosts. The M1/V8 result was the exception at 1.7 times.
- Windows was not 1.5 times slower across the board. On the two EPYC 7B13
  hosts, Windows Node-API was faster than the Linux-container result. These are
  separate VMs, however, so this does not isolate the operating system.
- The M1 Max V8 results were reproduced after a fresh rebuild: about 40 ns for
  Wasm and 69 ns for Node-API. Bun/JavaScriptCore's 15 ns Wasm result on that
  same host and Node's 12 ns result on Linux ARM show that this is not a general
  conclusion about either ARM64 or macOS.

For Sage.js architecture, the practical conclusion is unchanged but is now
quantified: tens of nanoseconds are cheap for coarse mathematical calls and
expensive inside scalar inner loops. A batch of 10,000 additions pays about the
same fixed boundary cost as one addition if represented by one packed call.

## Method and limitations

- JavaScript used Node 26.5/26.7, Bun 1.4.0, and Deno 2.9.5. CPython versions
  were the current installed 3.12–3.14 versions on each host.
- The same compiled stable-ABI Node-API addon was loaded by Node, Bun, and Deno
  on each host. It validates two arguments with `napi_get_value_int32` and
  boxes the result with `napi_create_int32`.
- The Wasm module is the minimal typed `(i32, i32) -> i32` function, with no
  linear-memory access or marshalling.
- CPython tests both vectorcall-compatible `METH_FASTCALL` and legacy
  tuple-forming `METH_VARARGS`.
- Each result is the median of nine rotated, warmed samples: 10 million calls
  per JavaScript sample and 5 million per CPython sample. Every sample checks a
  dependency-chained checksum.
- Cross-host figures include different processors, VM allocation, frequency,
  compiler, and operating-system conditions. Runtime comparisons within one
  row are stronger evidence than comparisons between rows.
- This measures the smallest useful scalar boundary. Strings, arrays,
  arbitrary-precision numbers, ownership, callbacks, and memory copies can
  dominate real bindings and require separate workload-specific benchmarks.

The exact medians and host metadata are retained in
[`results-2026-08-26.json`](./results-2026-08-26.json); the reproducible source
and build commands are in [`README.md`](./README.md).
