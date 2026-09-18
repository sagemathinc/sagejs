# Python keyword-constructor dispatch fast path

Base: the source-current merge of `91063e8f9` (mutation-safe attribute stores)
and `bf6565634` (exact integer div/mod), queued behind those two reviewed
prerequisites.

## Change

Static keyword construction already prepares the instance with
`Object.create(Class.prototype)`, then calls the generated class adapter. The
generic constructor wrapper nevertheless sent that adapter through the complete
keyword binder. The binder recognized the registered class, invoked it without
the prepared receiver, and the adapter allocated a second instance. The first
allocation was discarded.

The shared constructor wrapper now asks the existing
`_internal_keyword_constructor_prototypes` registry whether the current target
still has an authenticated generated-class prototype. Only that case applies
the target directly to the prepared receiver. Unregistered or dynamically
replaced callables retain the complete keyword-binding path; explicit apply
calls retain their existing direct path. The final JavaScript-constructor
result rule remains shared by both branches: an explicit object/function result
wins, while `None`, `undefined`, and primitives return the prepared receiver.

The helper moved from compiled ordinary Python into the existing raw shared
bootstrap next to the keyword binder. This removes duplicate allocation and
generic dispatch without adding a second semantic implementation or weakening
mutation guards.

## Controlled measurements

The shared Linux x64 project host ran Node 26.9.0 and CPython 3.14.4. Ten
alternating fresh processes ran each checked artifact; the first three samples
were discarded. Compilation and startup are outside the measured regions. Each
row contains 100,000 checked operations. This is a source-current local
comparison; an idle benchmark host should independently confirm it.

| Case | Combined prerequisite base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 19.775 ms | 20.047 ms | flat | 6.722 ms | 2.98x |
| keyword function | 108.524 ms | 109.416 ms | flat | 8.080 ms | 13.54x |
| immediate keyword method | 164.987 ms | 164.810 ms | flat | 8.276 ms | 19.92x |
| empty construction | 5.730 ms | 5.660 ms | flat | 6.077 ms | 0.93x |
| no-op initializer | 37.685 ms | 38.001 ms | flat | 8.010 ms | 4.74x |
| positional construction and method | 183.190 ms | 179.301 ms | flat | 15.282 ms | 11.73x |
| keyword construction and method | 409.000 ms | 384.550 ms | **5.98% faster** | 29.774 ms | 12.92x |

The base `dist/compiler/task-runtime.js` SHA-256 is
`179a70f847b1662aacc797906deb2f78ff3977057966d6cbb356c54acf550ab9`
(24,343,873 bytes). The candidate is
`a950650d09955f60ab489da6e8a29c07efdcae971421720bb7c41381c8127527`
(24,342,937 bytes), 936 bytes smaller.

The remaining keyword-construction gap is still 12.92x CPython and common
keyword method calls remain 19.92x. This is a bounded improvement, not closure
of the construction or argument-binding cliffs.

## Rejected experiment

A preceding experiment passed preclassified receiver context from
`ρσ_call_keyword_initializer` into the generic binder. It produced no controlled
gain: retained medians varied from -0.7% to +1.3% across the matrix. The exact
artifact was
`b9202d1e121e2a018ff8b4eca2f2a20b725707ea16659fec3d2a31296d02ef34`
(24,442,826 bytes). That code was completely reverted rather than retaining an
unproven parallel protocol.

## Qualification

- The current prerequisite-source build converged in two passes and completed
  in 7m 31s.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- Forty-two directly focused constructor, live-default, prepared-method, and
  shared-bootstrap checks pass on the replayed head. The earlier broader qualification
  additionally covers custom `__new__`, foreign allocation,
  replaced/deleted/inherited initializers, positional-only and duplicate
  arguments, callable initializer objects, and invalid initializer returns in
  Python and Sage modes.
- All six pinned traitlets checks and the pinned decorator 5.2.1 and attrs
  25.4.0 workflows pass on the source-current build.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules. Core runtime is 902,456/903,000 bytes. No source, startup, browser, or
  performance budget changed.
- The local startup gate is not a passing receipt: the candidate measured
  417.2 ms normalized and the exact prerequisite measured 416.4 ms normalized,
  both above the unchanged 400 ms budget.
  This host result neither widens the budget nor establishes a candidate
  regression; integration CI must supply the merge-owned startup receipt.

The branch remains queued behind its attribute-cache prerequisites. It is not a
release action.
