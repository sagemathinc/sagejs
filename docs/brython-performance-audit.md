# Brython / CPython / Sage.js source audit, 2026-09-15

## Bottom line

Brython's performance advantage on many object-heavy microbenchmarks is real
in this checkout. Its published near-CPython ratios are not reproduced by this
different, explicitly matched warm-function experiment. Sage.js is not uniformly
slower: it wins the trivial positional-call case decisively. Both runtimes
still have large exception costs relative to CPython.

This is local same-host reconnaissance, not a controlled benchmark-VM acceptance
campaign. See the [fixture, runtime provenance and reproduction instructions](../bench/brython-audit/README.md).
All 30 scaled cases and eight full-count repeats execute successfully on all
four engines. Postconditions cover selected outputs; this is not conformance
certification. Runtime bootstrap/import/compile costs are outside warm timings.

## Full-count repeat

Median of the final three of five calls; first two retained as cold/warmup.
Bodies retain upstream full loop counts but run inside a Python function.
Ratios are elapsed time divided by CPython time; lower is better.

| Workload | Brython / CPython | Sage.js Node / CPython | Sage.js browser / CPython |
| --- | ---: | ---: | ---: |
| Simple positional call | 10.2x | 0.37x | 0.36x |
| Complex-argument call | 10.4x | 47.7x | 53.4x |
| Empty-class instance construction | 2.2x | 35.2x | 34.8x |
| Instance with empty initializer | 6.2x | 21.1x | 21.6x |
| Immediate instance-method call | 18.0x | 49.9x | 57.8x |
| Three-item list construction | 1.6x | 10.5x | 30.8x |
| Three-item full list slice | 6.1x | 26.8x | 23.7x |
| Repeated float-literal assignment | 3.3x | 0.023x | 306x |

Do not interpret the sub-CPython ratios as universal throughput. Empty calls,
unused slice results and redundant assignments can be optimized away or
scalar-replaced by a JavaScript JIT. A counter-accumulating successful-call
probe gives a different ranking. The suite should be extended with observable
results and escaping objects before using it to select production fast paths.

Raw data: [full counts](../bench/brython-audit/evidence/full-count.json),
[30-case reconnaissance](../bench/brython-audit/evidence/reconnaissance.json).
The full-count raw report inherited an inaccurate scope sentence from its
scratch runner; README records the correction and precise actual method.

## Exception cross-check

Separate matched probes perform 10,000 operations and assert observable counts
and exception args. Native and guarded runs repeat CPython and Brython too.
Warm median times in milliseconds:

| Workload | CPython range | Brython range | Sage.js Node native / guarded | Sage.js browser native / guarded |
| --- | ---: | ---: | ---: | ---: |
| Successful call with accumulation | 0.455–0.512 | 5.65–5.70 | 1.82 / 2.08 | 6.29 / 6.42 |
| Exception construction | 0.967–1.034 | 42.8–43.1 | 103.7 / 54.4 | 116.6 / 49.9 |
| Binding failure | 4.60–4.62 | 123.2–125.0 | 165.9 / 103.7 | 148.9 / 90.9 |
| Construct, raise and catch | 1.272–1.301 | 76.4–76.6 | 110.3 / 65.7 | 105.3 / 43.7 |

Brython remains roughly 42–44x CPython for construction and 59–60x for
raise/catch. Sage.js guarded capture is faster than Brython for binding failures
and raise/catch in these local probes, while its construction remains slower.
This is not a CPython cliff closure or a replacement for controlled VM evidence.
Raw [native](../bench/brython-audit/evidence/exceptions.json) and
[guarded](../bench/brython-audit/evidence/exceptions-guarded.json) reports.

## A concrete fixable browser discrepancy

`tools/kernel-evaluator.ts` enables `pool_numeric_literals: true` with a unique
prefix. `packages/flint-wasm/compiler-worker.mjs` does not. Generated output for
the float assignment constructs `ρσ_float("1.0")` inside the unpooled loop;
pooled output initializes it once and assigns the pooled value inside the loop.

A diagnostic HTTP-served compiler option change, not a repository mutation,
measured 100,000 assignments in opposite policy orders. Warm medians were
528/525 ms without pooling and 0.100/0.095 ms with pooling. This supports the
allocation hypothesis and identifies a concrete evaluator-policy mismatch.
The tiny pooled time can reflect JIT elimination; it is not a promised 5,000x
package speedup. Production adoption must preserve literal identity policy,
numeric precision/context, closure persistence and unique pool namespaces.
See [raw pooling evidence](../bench/brython-audit/evidence/pooling.json).

## What Brython does well

Inspection of pinned source and generated JavaScript shows:

1. **Simple positional binding avoids the generic parser.** Generated `f(x)`
   checks argument count and the keyword marker, then initializes `{x: _x}`
   directly. `www/src/py_functions.js` also installs a per-function argument
   parser. Mutation and invalidation semantics must be audited before copying
   the design; a cached plan is not permission to cache stale defaults.
2. **Immediate method calls have a specific path.** `py_utils.js`'s `call_attr`
   checks builtin methods and ordinary class functions, including an instance
   override, before falling back to full attribute/call resolution. This is
   concrete precedent for avoiding needless bound-method machinery, not proof
   that every descriptor corner case is handled by that fast path.
3. **Common containers reuse JavaScript primitives.** `py_list.js`'s full-slice
   case uses `self.slice()` and sets its type marker; it does not perform the
   general stepped-slice algorithm for `a[:]`.
4. **Exception objects are not native JS Errors.** `py_exceptions.js`'s
   `BaseException.tp_new` makes an ordinary object with args, traceback and
   chaining fields. Generated functions maintain Python frames and use
   `set_exc_and_leave` for unwinding. This supports our compiler-assisted
   traceback direction, though Brython still has substantial exception costs.

These are implementation observations, not measured percentage attributions.
No Brython runtime implementation has been copied into Sage.js in this study.
Any future copied code must retain the upstream BSD notice.

## Why the website is not this experiment

The public table names Brython 3.14.1 / CPython 3.14.0 on Chrome 147 / Windows.
This checkout reports 3.14.3-dev and runs on Chrome 149 / Linux alongside
CPython 3.14.4. The source `www/speed/make_report.py` times `exec(src, {})`,
including compilation, once per snippet; `server.py` times `exec(src)` inside
its request handler. Those are not the same namespace context. Our functions
deliberately use the same local-function structure on every engine.

The checked-in report HTML references absent `make_report_no_cgi.py`; the old
automation file targets much older releases. Consequently we cannot establish
the exact published generation procedure from these files alone. This is not
evidence of dishonest numbers or a proved Brython regression.

Our old CoWasm-derived `brython.py` also has a benchmark mismatch: its
`big_integers(n=10000)` assigns `n = 60`, then loops over `range(n)`, doing only
60 powers. The pinned upstream fixture correctly uses `range(10000)` while
keeping exponent 60. Its historical comment alleging a Brython regression is
not current evidence. We leave that corpus untouched in this research PR.

## Recommended next implementation campaign

1. Qualify numeric pooling consistently in the browser; use a real package
   and persistent-session controls, not only the redundant-assignment probe.
2. Profile shared construction and complex binding on the full-count fixtures
   and `packaging` workflow. Prioritize reusable binding plans with live defaults
   and minimal per-instance allocation; retain descriptor/mutation tests.
3. Separate function metadata creation from hot function/instance paths. The
   30-case sweep shows roughly 20–34x CPython for Sage.js function creation;
   investigate allocation profiles before assigning a cause.
4. Recheck list construction/slicing, avoiding per-element or per-result
   metadata work where the representation permits it safely.
5. Keep exception cost separate: cheaper trace capture is valuable but does
   not solve binder, object and container overhead throughout real packages.

Next acceptance evidence should use pinned artifacts on an idle benchmark host,
opposite runtime orders, more samples, matched startup phases and observable
real workloads. Do not turn the geometric mean of these tiny tests into a
general language-performance promise.
