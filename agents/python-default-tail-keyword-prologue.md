# Generated default-tail keyword ownership

Base: `3396da6ff` (`agent/python-keyword-receiver-guard`, queued behind the
existing call, construction, and attribute integration sequence).

## Change

Compiler-generated functions with positional defaults already emit a prologue
which reads those named values from the internal keyword packet. The shared
binder nevertheless copied and deleted the same trailing values into a sparse
positional array first. The generated prologue then repeated its fixed
ownership checks against an empty packet.

Generated functions now publish, through the existing internal
`__handles_kwarg_interpolation__` slot, a one-based count of trailing
positional parameters whose keyword assignments their prologue owns. A count,
rather than an absolute parameter index, remains valid when native/unbound
method and class-constructor adapters add or remove an explicit receiver. The
shared binder still validates every key, duplicate, positional-only rule, and
unexpected keyword before invocation. It positions required parameters exactly
as before, but leaves the authenticated default tail in the packet for the
generated prologue. Boolean handlers used by handwritten builtins retain the
complete legacy positioning path.

Live `__defaults__` mutation does not change which source parameters can be
supplied by keyword: provided tail values are read before the existing live
default lookup, while omitted values retain the same short/null/default error
behavior. Keyword-only and `**kwargs` entries remain in insertion order.

The audit also found and repaired an ordinary Python discrepancy in the
existing generated prologue. A positional-only parameter with a source default
was incorrectly consumed from `**kwargs`; for `def f(a=1, /, **kw)`, `f(a=2)`
returned `(2, {})` instead of `(1, {"a": 2})`. Positional-only defaults are now
excluded from prologue keyword assignment. The checked fixture includes that
CPython oracle as well as mixed required/default calls, duplicates, unexpected
keywords, keyword-only/variadic packets, saved methods, unbound methods,
explicit instance callbacks, evaluation order, and live defaults.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes compared exact base and candidate artifacts; the
first three samples were discarded. Each row contains 100,000 checked
operations.

| Case | Receiver-guard base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 16.435 ms | 16.609 ms | flat | 8.639 ms | 1.92x |
| keyword function | 82.218 ms | 42.546 ms | **48.3% faster** | 10.045 ms | **4.24x** |
| immediate keyword method | 142.690 ms | 97.414 ms | **31.7% faster** | 10.469 ms | **9.31x** |
| empty construction | 31.007 ms | 31.799 ms | flat | 7.692 ms | 4.13x |
| no-op initializer | 54.178 ms | 54.310 ms | flat | 11.808 ms | 4.60x |
| positional construction and method | 225.434 ms | 224.615 ms | flat | 23.162 ms | 9.70x |
| keyword construction and method | 441.508 ms | 394.863 ms | **10.6% faster** | 37.253 ms | **10.60x** |

The exact base artifact is
`70ffd5bad252d8c4922c2196d5c0af6c7ce9c798b16f7f4e79fda631333333d7`
(24,440,875 bytes). The candidate is
`3874a08f2bfc9192935d219b1e220fae6bfe0a29d64d2737db22224b369d162e`
(24,437,540 bytes), 3,335 bytes smaller. The result closes roughly half of
the remaining keyword-function gap, but keyword functions, immediate methods,
and keyword construction remain 4.2x, 9.3x, and 10.6x CPython. Those cliffs
remain open.

## Qualification

- The corrected source-current compiler converged in two self-hosting passes;
  the full build completed.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift. An earlier parallel,
  oversubscribed run timed out one normally passing case; the isolated rerun is
  the qualification receipt and no baseline was changed.
- Forty-nine focused binder, live-default, dynamic-initializer, method,
  positional-only, and pinned traitlets checks pass in Python/Sage modes.
- Pinned attrs 25.4.0 and decorator 5.2.1 workflows pass with checked outputs.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules;
  documentation, merge invariants, and the complete architecture check pass.
  The compiler-input change regenerated and verified the repository-owned
  optimizer-opportunity manifest and Markdown identity.
- Seventeen compiler fixtures pass. Fifteen compiler fixtures and the generic
  unit tier cannot run in this worktree because the optional
  `packages/flint/build/Release/sagejs_flint.node` is absent; every reported
  failure has that same missing-module root cause. This is an environment
  limitation, not a passing receipt.
- Core runtime is 902,583/903,000 bytes. No source, startup, browser, or
  performance budget changed. The standalone artifact shrinks by 3,335 bytes.
- The local startup measurement is not a passing receipt: 430.2 ms normalized
  exceeds the unchanged 400.0 ms budget. Merge-owned CI must supply the
  startup/browser receipt when the integration queue reaches this candidate.

The branch remains queued behind its prerequisites and has no stacked PR. It is
not a release action.
