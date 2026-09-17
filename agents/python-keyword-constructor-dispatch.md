# Python keyword-constructor dispatch fast path

Base: `ddee65db6` (`agent/python-attribute-store-assignment`, queued behind the
attribute read/store integration).

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

The idle `bench-1` Linux x64 host ran Node 26.5.1 and CPython 3.12.3. Ten
alternating fresh processes ran each checked artifact; the first three samples
were discarded. Compilation and startup are outside the measured regions.
Each row contains 100,000 checked operations.

| Case | Assignment-cache base | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 79.934 ms | 81.077 ms | flat | 8.784 ms | 9.2x |
| keyword function | 200.921 ms | 199.172 ms | flat | 10.182 ms | 19.6x |
| immediate keyword method | 261.334 ms | 259.646 ms | flat | 10.652 ms | 24.4x |
| empty construction | 37.103 ms | 36.192 ms | flat | 7.617 ms | 4.8x |
| no-op initializer | 60.950 ms | 60.669 ms | flat | 11.834 ms | 5.1x |
| positional construction and method | 284.258 ms | 284.085 ms | flat | 22.758 ms | 12.5x |
| keyword construction and method | 541.702 ms | 502.178 ms | **7.3% faster** | 37.211 ms | 13.5x |

The base artifact SHA-256 is
`2470c310864ee70e986b72cfdf67d28113334c048db1bc535075c44878487f0a`
(24,442,916 bytes). The candidate is
`8658a7e82e89e3c335d5e202495f6449920300dc264c201547b4e4036d544674`
(24,442,406 bytes), 510 bytes smaller.

The remaining keyword-construction gap is still 13.5x CPython and common
keyword method calls remain 24.4x. This is a bounded improvement, not closure
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

- The exact-source build converged in two passes and completed in 7m 27s.
- The CPython differential corpus passes 505 cases with the same three
  intentional incompatibilities and no baseline drift.
- Thirty-four focused initializer, live-default, prepared-method, and shared
  bootstrap checks pass. These include custom `__new__`, foreign allocation,
  replaced/deleted/inherited initializers, positional-only and duplicate
  arguments, callable initializer objects, and invalid initializer returns in
  Python and Sage modes.
- All six pinned traitlets checks and the pinned decorator 5.2.1 and attrs
  25.4.0 workflows pass.
- Core runtime is 902,744/903,000 bytes. No source, startup, browser, or
  performance budget changed.
- The local startup gate is not a passing receipt: the candidate measured
  430.8 ms normalized and the exact prerequisite measured 419.9 ms normalized,
  both above the unchanged 400 ms budget (raw medians 430.8 ms and 433.7 ms).
  This host result neither widens the budget nor establishes a candidate
  regression; integration CI must supply the merge-owned startup receipt.

The branch remains queued behind its attribute-cache prerequisites. It is not a
release action.
