# Brython source and performance audit

2026-09-15 reconnaissance, not a release acceptance benchmark or overall
language score. See `../../docs/brython-performance-audit.md` for interpretation.

## Provenance

`cases.json` retains the original 30 benchmark bodies from
https://github.com/brython-dev/brython at commit
`d961555dc75502286d72381bfe59b6c37875971e`, under
`www/speed/benchmarks/`, selected by `www/speed/make_report.html`.
Each original body has a SHA-256. Copyright Pierre Quentel and contributors;
the upstream BSD license is retained in `BRYTHON-LICENCE.txt`.
The runner and exception probes are Sage.js audit code, not Brython code.

Runtime: that checkout's `www/src/brython.js` reports 3.14.3-dev. Its SHA-256 is
`fa53eb535625e8a5e9d6426f9a26419f5ff0bef645ca5f5e34a27a251e2b7f7a`;
`brython_stdlib.js` is
`ca49915a776a7bfd9a6c7972f1afef205c2724a0d493f6f2627d5eb97e27dd04`.
Both run in Chromium 149.0.7827.196 on Linux x64, AMD EPYC 7B13.
CPython is 3.14.4; Node is 26.8.1. Sage.js uses the exception campaign's built
Node runtime and the browser bundle qualified after the pending NLopt refresh.
Node compiler SHA-256:
`484eafdb3e2ba251686ee6efd071a96e8a55d75c389f6dbae87b910ebdda0f0f`.

## Method and limitations

- Identical Python source per run, four engines: CPython, Brython/Chromium,
  Sage.js/Node, Sage.js/Chromium. Sage.js Python mode, native capture; Brython
  debug 0. The separate guarded exception report explicitly opts into guarded
  capture; the upstream-suite reports use native capture.
- Strip the unused `JS_CODE` comparison payload, wrap each body in a function,
  optionally divide fixed loop counts by ten. Do not change the numerical
  operand `n = 60` in the big-integer case.
- Five invocations in one initialized process: retain the first cold sample,
  use the second as additional warmup, summarize the final three by median.
- Timers surround calls, not compilation/import/bootstrap. The one CPython
  process-wall figure is not a matched startup comparison.
- Add postcondition assertions where specified in `cases.json`. All workloads
  must finish; an error is reported and fails the runner. These postconditions
  are not a comprehensive Python conformance oracle. Several original tests
  discard results or create empty objects and can benefit from JIT elimination.
- Sequential engines in fixed order on the local shared host, no CPU pinning,
  no statistical confidence claim, three warm samples only. First study has
  30 cases at one-tenth counts; repeat has eight cases at full upstream counts.
  This is not a reproduction of the published top-level `exec()` measurements.
- `evidence/full-count.json` retains the original scratch runner's stale scope
  string mentioning divided counts. Its actual eight cases used full counts;
  the correction is recorded here rather than silently rewriting raw evidence.
- The pooling experiment serves a modified compiler-worker response from a
  local HTTP server, with unique literal-pool prefixes. No production source
  changes. Seven samples, discard first two, opposite policy order. Its tiny
  pooled timings are JIT-sensitive, not a universal speedup claim.

## Reproduce

Supply existing built runtime roots and a new output directory:

```sh
export SAGEJS_AUDIT_ROOT=/path/to/built/sagejs
export SAGEJS_AUDIT_BROWSER=/path/to/built/sagejs/packages/flint-wasm
export BRYTHON_AUDIT_ROOT=/path/to/brython
AUDIT_OUTPUT=/tmp/new-audit node bench/brython-audit/run.cjs
AUDIT_OUTPUT=/tmp/new-full AUDIT_DIVISOR=1 \
  AUDIT_ONLY=list_slice,function_call,function_call_complex,create_instance_simple_class \
  node bench/brython-audit/run.cjs
AUDIT_OUTPUT=/tmp/new-exceptions AUDIT_SOURCE=bench/brython-audit/exceptions.py \
  node bench/brython-audit/run.cjs
AUDIT_OUTPUT=/tmp/new-guarded AUDIT_SOURCE=bench/brython-audit/exceptions.py \
  AUDIT_CAPTURE=guarded node bench/brython-audit/run.cjs
node --test bench/brython-audit/audit.test.cjs
AUDIT_OUTPUT=/tmp/new-pool-probe node bench/brython-audit/pool-probe.cjs
```

The runner requires local Chromium at `/usr/bin/chromium` and `python3`.
The original scratch evidence is also retained under
`/home/user/brython-audit.W0m98I`, `/home/user/brython-full-audit.JowJVR`,
and `/home/user/brython-exception-audit`. Do not run benchmarks concurrently.

`exceptions.json` uses native Sage.js capture; `exceptions-guarded.json` uses
guarded capture (their scratch metadata predates the explicit capture field).
Both use `exceptions.py`, 10,000 operations and observed counter/args checks;
the generic scope string and divisor field do not describe these custom probes.
The later reusable runner records custom source, capture selection and hashes.
