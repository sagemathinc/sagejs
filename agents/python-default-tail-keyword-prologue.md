# Generated default-tail keyword ownership

Base: merged PR #317 (`1fa7a26bd`), which integrates the qualified constructor
guard used for the controlled measurements below.

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

The shared Linux x64 project host ran Node 26.9.0 and CPython 3.14.4. Ten
alternating fresh processes compared exact base and candidate artifacts; the
first three samples were discarded. Compilation and startup are outside the
measured regions. Each row contains 100,000 checked operations. Functions and
methods in this table have one trailing default and supply it by keyword.

| Case | Receiver-guard base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 90.237 ms | 87.644 ms | flat | 11.718 ms | 7.48x |
| keyword function | 163.383 ms | 156.044 ms | **4.49% faster** | 13.356 ms | **11.68x** |
| immediate keyword method | 174.529 ms | 160.840 ms | **7.84% faster** | 13.218 ms | **12.17x** |
| empty construction | 54.525 ms | 53.578 ms | flat | 8.655 ms | 6.19x |
| no-op initializer | 70.140 ms | 72.135 ms | flat | 12.067 ms | 5.98x |
| positional construction and method | 236.051 ms | 230.291 ms | flat | 19.609 ms | 11.74x |
| keyword construction and method | 380.245 ms | 366.637 ms | **3.58% faster** | 35.711 ms | **10.27x** |

The exact base artifact is
`2371d5010d0c2ee9ddebe7ce6dc6d75312d4b70c4ecf7a37cdb49dcf70eb0019`
(24,341,229 bytes). The candidate is
`be8c164b0520667224cda7fcf98d88268d5fe975cf82482a4dad3c48ee648ebe`
(24,337,175 bytes), 4,054 bytes smaller.

A signature decomposition confirms the mechanism rather than a broad JIT
shift. Required-only keywords improve 3.31% from one-pass positioning; one
required keyword with an omitted default improves 3.88%; a positional required
argument plus one supplied default improves 27.70%; and a required keyword plus
four supplied defaults improves 9.23%. Their candidate/CPython ratios remain
10.15x--14.48x. Default-tail ownership is valuable, but required-name placement
and the generated prologue remain large cliffs.

## Qualification

- The corrected source-current compiler converged in two self-hosting passes;
  the full build completed in 7m 28s.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift. An earlier parallel,
  oversubscribed run timed out one normally passing case; the isolated rerun is
  the qualification receipt and no baseline was changed.
- All 110 focused binder, live-default, dynamic-initializer, method,
  positional-only, lowering, and raw-ABI checks pass in Python/Sage modes.
  All six pinned traitlets checks pass.
- Pinned attrs 25.4.0 and decorator 5.2.1 workflows pass with checked outputs.
- The current 11-package runner is unchanged from the exact #317 parent: both
  pass 9/11, with the same pyparsing execution failure and mpmath timeout. This
  optimization therefore introduces no package-workflow drift, but the broad
  package suite is not claimed as globally qualified.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules;
  documentation, merge invariants, and the complete architecture check pass.
  The compiler-input change regenerated and verified the repository-owned
  optimizer-opportunity manifest and Markdown identity.
- Core runtime is 902,417/903,000 bytes. No source, startup, browser, or
  performance budget changed. The standalone artifact shrinks by 4,054 bytes.
- Back-to-back current-head startup qualification measured the exact #317
  parent at 416.3--416.7 ms raw and the candidate at 415.5--418.1 ms raw. With
  contemporaneous load normalization, both pass at 396.4 ms and 398.0 ms
  respectively against the unchanged 400.0 ms budget.

The branch is the direct follow-up to merged PR #317. It is not a release
action.
