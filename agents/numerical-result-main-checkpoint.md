# Numerical result binding: main-based N1 slice

This independent change starts at `5b307b65f`, the same main baseline as
the trace-accounting integration in #224. It does not depend on #224 or
the experimental native/evaluator PR stack.

## What changes

A numerical plan already retains its `NumericalProblem` object. When the
result receives that identical object, identity proves the binding without
two fresh canonical JSON serializations and SHA-256 calculations. Different
problem objects still require the existing content comparison, recomputed
on every result construction. There is no digest cache or relaxation of
mathematical validation, status, finiteness, work-count, or resource guards.

Outward serialization still emits the same independently recomputable problem
digest and complete plan/problem provenance. This is not a promise that every
export is cheap, nor that private mutation of a live problem is detected:
the old comparison hashed that same live object twice, not a frozen snapshot.

The regression uses observed problem snapshots to prove that identical binding
does no serialization and distinct binding still does fresh comparisons. It
also checks detached exports, changed distinct contents, mismatched bindings,
and the result invariants that must remain enforced on the identity path.

## Evidence and limits

The focused regression passes in CPython and freshly built Sage.js under
Node 26.8.1 and the supported Node 22.22.2 floor. The fresh eight-stage build,
strict Python (386 modules, zero errors), and all four common contract/schema
tests pass. The optimizer inventory is regenerated and verifies against source.

The broader contract, fitting/ODE frontend, ODE, and optimization run passes
14/16 tests, including optimization failures/budgets and the live SciPy ODE
oracle. Both failures reproduce on the unchanged, freshly built main baseline:
the Sage-mode frontend needs the absent optional FLINT addon, and the dynamic
ODE witness raises an assertion. The latter is still under investigation;
neither is counted as a pass. Numerical/native/Wasm/resource architecture
checks pass; the broad gate stops on an unchanged historical retired-toolchain
mention at `docs/general-class-unit-frontier.md:280`.

Paired public-call measurements are pending. Historical measurements from
another compiler or draft stack are not receipts for this branch. The program's
latency targets and N0–N6 completion remain open. Keep the integration draft
until the current-main handoff is adequately qualified.
