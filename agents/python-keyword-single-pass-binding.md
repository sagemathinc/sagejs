# Single-pass generated keyword binding

Base: `2db70414c` (`agent/python-exact-integer-add-native`, queued behind the
call, construction, and attribute integration sequence).

## Change

Generated functions advertise `__handles_kwarg_interpolation__`: after the
shared binder validates and positions ordinary named arguments, their generated
prologue remains responsible for live defaults, keyword-only arguments, and
the residual keyword packet. The shared binder nevertheless made two complete
passes over each ordinary keyword call. The first pass found and validated
packet keys; the second scanned every positional parameter again, repeated the
membership test, copied each value, and deleted each consumed property.

The authenticated generated-function path now consumes each recognized named
property while it validates the packet. It removes the packet from the
positional array only when a recognized property requires interpolation, keeps
keyword-only and `**kwargs` properties in insertion order for the generated
prologue, and retains the existing direct call when no named property is
consumed. Duplicate and unexpected keywords still fail before invocation.
Callable classification, custom/callable instances, non-generated functions,
positional-only parameters, and every constructor path retain their existing
logic.

A raw shared-bootstrap regression covers sparse positioning, prepared method
contexts, duplicates, unexpected keywords, keyword-only values, and residual
`**kwargs`. The Python differential and package workflows exercise generated
defaults and real decorator/trait notification call shapes.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes compared the exact base and candidate artifacts;
the first three samples were discarded. Each row contains 100,000 checked
operations.

| Case | Exact-iadd base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 16.842 ms | 17.271 ms | flat | 8.660 ms | 1.99x |
| keyword function | 91.526 ms | 87.075 ms | **4.9% faster** | 10.093 ms | **8.63x** |
| immediate keyword method | 147.809 ms | 143.737 ms | **2.8% faster** | 10.447 ms | **13.76x** |
| empty construction | 32.022 ms | 31.311 ms | flat | 7.603 ms | 4.12x |
| no-op initializer | 54.632 ms | 54.177 ms | flat | 11.866 ms | 4.57x |
| positional construction and method | 221.432 ms | 224.177 ms | flat | 22.925 ms | 9.78x |
| keyword construction and method | 433.199 ms | 430.295 ms | flat | 37.085 ms | 11.60x |

The exact base artifact is
`09fbfe5af570f0352402f9651287a0b87f9076b99c7d9da8b57f91feef70cd81`
(24,441,141 bytes). The candidate is
`c9b9d338f9b97d291a799e7df6167d34edf90bad9e8d262fba67d9e723756130`
(24,440,859 bytes), 282 bytes smaller. The result is a useful reduction in a
shared successful-call mechanism, but keyword calls remain 8.6x--13.8x
CPython and keyword construction remains 11.6x; those cliffs are open.

## Qualification

- The source-current build converged in two self-hosting passes and completed.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- Twenty-two raw/shared and resolved/prepared keyword checks pass; the broader
  default, dynamic-initializer, method, keyword-size, and pinned traitlets set
  passes 36/36.
- Pinned attrs 25.4.0 and decorator 5.2.1 workflows pass with checked outputs.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules;
  documentation and merge invariants pass.
- Core runtime falls to 902,332/903,000 bytes. No source, startup, browser, or
  performance budget changed.
- The local startup measurement is not a passing receipt: 427.0 ms normalized
  exceeds the unchanged 400.0 ms budget. This is recorded rather than widened;
  merge-owned CI must provide the startup/browser receipt when the integration
  queue reaches this candidate.

The branch remains queued behind its prerequisites and has no stacked PR. It is
not a release action.
