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
ODE witness intermittently fails `rejections.success`. An instrumented full
baseline retry later passes unchanged conditions. The isolated rejected-step
case converges with identical 100 iterations / 601 evaluations in baseline,
result-only and trace-only branches; baseline/result-only take about 30.5 s
near the existing 30 s cooperative budget, versus about 1.55 s with #224.
This is consistent with budget sensitivity, but the failing run's status was
not captured: do not claim a conclusively diagnosed mathematical failure or
erase the original failed runs. No limits were raised.
Numerical/native/Wasm/resource architecture
checks pass; the broad gate stops on an unchanged historical retired-toolchain
mention at `docs/general-class-unit-frontier.md:280`.

[Paired public-call evidence](../bench/numerics/performance/results/n1-result-main-2026-09-12/README.md)
now retains all 40 matching observations against the freshly built main
baseline. Host drift makes quantitative gains provisional; no speedup is
independently confirmed here. Linux ARM64 and native Windows also pass the
exact source-archive CPython oracles, explicitly not full product qualification.
Source commit `b0c532cfb` passes routine Linux, Chromium parity, and Linux ARM64,
macOS ARM64 and Windows x64 CI smoke checks. Evidence-only follow-ups must
retain that attribution; current integration checks remain separate.

The narrow identity shortcut is ready for review on its correctness and
no-snapshot witnesses, not a claim of completing N1 or meeting latency targets.
Independent quiet performance confirmation and N0–N6 remain open.
