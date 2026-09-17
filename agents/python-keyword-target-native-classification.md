# Native keyword-target classification

Base: `207a35333` (`agent/python-prepared-method-keyword-context`, queued behind
the attribute, construction, and method-binding integration).

## Change

The keyword binder is already a raw JavaScript boundary, but ordinary target
classification called compiled helpers to compute JavaScript `typeof`, read
plain function metadata, and test own properties. Those helpers ultimately
performed exactly the corresponding JavaScript primitives.

The binder now uses native `typeof`, property access, and `Object.hasOwn` at
that boundary. The decision tree is unchanged: non-functions and callable
instances resolve the type-level `__call__` slot; classes keep constructor
handling; unannotated callable objects retain `__call__` metadata discovery;
and ordinary Python functions proceed to the same positional/keyword binding
and error checks. Nullish targets remain safe because JavaScript `||`
short-circuiting prevents property access after the non-function test.

Prepared method targets already bypass this decision tree through their
separately authenticated context bit, so this slice targets ordinary keyword
functions without duplicating that proof.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each exact artifact; the first three samples
were discarded. Each row contains 100,000 checked operations.

| Case | Prepared-method base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 80.397 ms | 80.293 ms | flat | 8.680 ms | 9.3x |
| keyword function | 199.694 ms | 195.142 ms | **2.3% faster** | 10.063 ms | 19.4x |
| immediate keyword method | 249.879 ms | 251.002 ms | flat | 10.511 ms | 23.9x |
| empty construction | 31.222 ms | 30.764 ms | flat | 7.564 ms | 4.1x |
| no-op initializer | 54.700 ms | 53.569 ms | flat | 11.790 ms | 4.5x |
| positional construction and method | 277.084 ms | 279.099 ms | flat | 22.535 ms | 12.4x |
| keyword construction and method | 491.692 ms | 490.132 ms | flat | 37.251 ms | 13.2x |

The base artifact SHA-256 is
`79a778d7d8224dd19bc86d9de6a4169a328ccc5635ed5f7513f33cf81f3afcc6`
(24,441,610 bytes). The candidate is
`d4e402bebd68ae2cf3aee64e0bc98fc74d3bb252463e8693ff0bebcaeb13bb3c`
(24,441,523 bytes), 87 bytes smaller.

The remaining keyword-function gap is still 19.4x CPython. This is a small
boundary cleanup and does not close the argument-binding cliff.

## Qualification

- The final exact-source build converged in two passes and completed in 7m 30s.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- Twenty-two focused prepared-method, resolved-keyword, and raw-ABI checks pass;
  another 23 dynamic initializer/default and traitlets checks pass.
- The pinned decorator 5.2.1 and attrs 25.4.0 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules; merge
  invariants pass.
- Core runtime falls from 902,720 to 902,633 bytes against the unchanged
  903,000-byte budget. No source, startup, browser, or performance budget
  changed.
- The local startup gate is not a passing receipt: the candidate measured
  403.4 ms normalized and its exact parent measured 440.5 ms, both above the
  unchanged 400 ms budget. No budget was widened; merge-owned CI must supply
  the startup/browser receipt.

The branch remains queued behind its prerequisites and has no stacked PR. It is
not a release action.
