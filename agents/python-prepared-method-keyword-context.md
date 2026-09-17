# Prepared-method keyword context

Base: `6677a5544` (`agent/python-constructor-new-guard-native`, queued behind
the attribute and construction integration).

## Change

Immediate keyword method calls already use `ρσ_prepare_method_call`. Its warm
path accepts a cached target only when the descriptor epoch, prototype owner,
absence of instance override, namespace state, and method-plan callable proof
all remain current. The keyword binder nevertheless classified that proven
target again as a native function, class, callable instance, or callable object
before binding its argument packet.

The prepared tuple now carries one internal authentication bit only on that
warm proven path. The binder uses it to skip target-kind classification while
retaining all actual argument binding and error checks. Cold/fallback lookup,
custom `__getattribute__`/`__getattr__`, instance assignments, descriptors,
native receivers, classes, callable instances, and dynamically replaced
targets do not receive the bit and keep the full path. Lookup still occurs
before argument evaluation, and receiver evaluation remains exactly once.

The direct ABI regression makes every classification operation throw and proves
that an authenticated tuple still binds the keyword packet correctly. Existing
CPython-oracle tests cover mutation/deletion, explicit instance assignment,
custom hooks, saved methods, native receivers, super/metaclass binding, and
evaluation order.

## Controlled measurements

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each exact artifact; the first three samples
were discarded. Each row contains 100,000 checked operations.

| Case | Constructor-guard base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 81.158 ms | 80.004 ms | flat | 8.666 ms | 9.2x |
| keyword function | 199.979 ms | 201.603 ms | flat | 10.005 ms | 20.1x |
| immediate keyword method | 261.043 ms | 253.500 ms | **2.9% faster** | 10.366 ms | 24.5x |
| empty construction | 31.163 ms | 30.961 ms | flat | 7.560 ms | 4.1x |
| no-op initializer | 54.136 ms | 54.447 ms | flat | 11.852 ms | 4.6x |
| positional construction and method | 280.658 ms | 279.152 ms | flat | 22.439 ms | 12.4x |
| keyword construction and method | 503.415 ms | 494.809 ms | flat | 37.170 ms | 13.3x |

The base artifact SHA-256 is
`dc72202e1033ec346a476114c8383860061e3bcf5647f6c0bdac2f9a65bad30b`
(24,441,502 bytes). The candidate is
`79a778d7d8224dd19bc86d9de6a4169a328ccc5635ed5f7513f33cf81f3afcc6`
(24,441,610 bytes), 108 bytes larger.

The improvement is real but small, and the remaining immediate-keyword-method
gap is still 24.5x CPython. This does not close the call cliff.

## Qualification

- The final exact-source build converged in two passes and completed in 7m 33s.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- Twenty-two focused prepared-method, resolved-keyword, and raw-ABI checks pass;
  another 23 dynamic initializer/default and traitlets checks pass.
- The pinned decorator 5.2.1 and attrs 25.4.0 workflows pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules; merge
  invariants pass.
- Core runtime is 902,720/903,000 bytes. No source, startup, browser, or
  performance budget changed.
- The local startup gate is not a passing receipt: the candidate measured
  440.5 ms normalized and its exact parent measured 417.9 ms, both above the
  unchanged 400 ms budget. No budget was widened; merge-owned CI must supply
  the startup/browser receipt.

The branch remains queued behind its prerequisites and has no stacked PR. It is
not a release action.
