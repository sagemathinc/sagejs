# Prepared statistics: public browser development measurements

Source runtime: `a55884868`, with the source-hashed optional measurement collector
included alongside this report. These are local Linux x64 browser development
runs, not frozen production qualification, simultaneous cross-browser races,
or four-platform measurements. JSON records bind compiler, Python bundle,
evaluator, collector, workload and optional pack bytes, and browser versions.

Each engine passed disabled, accelerated, stale and missing resource sessions
through the public Python `createSage` API. The accelerated route additionally
asserts the actual function's `executionTarget == "wasm"`. The workload uses
20,000 observations, three warmups and seven checked samples per case.
Numerical values and validation classifications are checked against the ordinary
public implementation; separate shared correctness witnesses include independent
CPython and exact-rational cases. The timing run itself is not an independent
mathematical oracle.

Median milliseconds, shown as trace `none` / `summary`:

| Browser | Generic query | Prepared dynamic query | Prepared Wasm query | Wasm data preparation |
| --- | ---: | ---: | ---: | ---: |
| Chromium | 1429 / 1423 | 968 / 985 | 55 / 60 | 452 / 474 |
| Firefox | 2171 / 2351 | 1454 / 1443 | 69 / 58 | 669 / 682 |
| WebKit | 1528 / 1380 | 916 / 933 | 44 / 52 | 570 / 561 |

Raw records retain the existing workload label `prepared-native`; the execution
target in this harness is Wasm, not a Node native addon. Query time includes
sorting, independent validation, result construction and trace handling. It
excludes preparation, which is separately measured, and browser/kernel startup.
First-query and individual steady-state samples are retained in each JSON file.
The complete browser evaluator still initializes exact-math assets. This is not
a FLINT-free startup measurement or a claim about cold install latency.

The repeated-query gain is substantial for this workload but the 10 ms target
remains unmet. Current Wasm adapters allocate/copy buffer arguments for each
call and copy mutable results back elementwise; owned JavaScript data is not
equivalent to resident Wasm data. Investigate guarded bulk transfers next,
without removing public validation or changing arithmetic. Peak memory,
sustained allocation, frozen paired comparisons and deployment qualification
remain open.

Reproduce one engine (choose a fresh output path):

```sh
SAGEJS_NUMERICAL_BROWSER_TESTS=1 \
SAGEJS_NUMERICAL_BROWSER_ENGINE=chromium \
SAGEJS_NUMERICAL_BROWSER_MEASUREMENTS=build/browser-measurements-new.json \
node --test test/numerics/performance/prepared-browser.cjs
```

Omit the measurements variable for correctness-only qualification. The collector
refuses to overwrite an existing measurement file.
