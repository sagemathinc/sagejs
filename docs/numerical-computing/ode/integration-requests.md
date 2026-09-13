# ODE integration record

> Historical handoff, resolved during P4 integration.

The ODE lane originally left shared capability registration, lazy package
ownership, strict-source enrollment, test discovery, scheduler registration,
and public-export decisions to integration. The live repository now registers
`ode.initial_value_problem`, owns the ODE and shared-sweep packages explicitly,
strict-checks their modules, and discovers the explicit, stiff, and sweep
laboratories through `pnpm test:numerics`.

Canonical imports remain under `sagejs.numerics.ode`; the parent package is a
small lazy contract/root facade rather than an eager union of every domain.
ODE-specific stopping identities such as `maximum_output_points`,
`maximum_event_records`, `minimum_step`, and `terminal_event` remain in
`OdeResult.termination_reason` and retained trace evidence. The common result
status records the cross-domain outcome. This preserves useful domain detail
without turning every solver condition into a global status alias.

The implemented methods and explicit unsupported envelopes are authoritative
in the ODE capability matrix. In particular, automatic stiffness detection,
Radau/BDF/LSODA/SUNDIALS, complex state, mass matrices, and DAEs remain
deferred. Intended browser or platform targets do not become release evidence
until the exact product candidate passes P8 qualification.

There is no active shared integration request in this file. A future method or
frontend must update capability classification, independent validation,
resource budgets, tests, and release evidence atomically.

The shared scheduler now provides genuine bounded CPython thread concurrency.
The ODE adapter exposes its `concurrency_fallback` policy directly: Sage.js
Node/browser/SEA execution records an explicit sequential fallback or fails
closed before callback dispatch when the caller selects `"error"`.
