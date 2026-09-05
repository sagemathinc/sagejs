# Non-draft integration wave: Python, scalar roots, modular abelian varieties

The user approved the preceding merge plan with an explicit constraint:
**do not merge draft PRs or pull draft-only dependencies into main**. This
wave is integration, not a release. Recheck draft state and head identity
before publication. New work outside this list needs a separate scope decision.

## Order and pinned review inputs

1. Python stack: #124 (`ad8a1b6a7`), #133 (`0ad18acc9`),
   #136 (`26b64a831`), #139 (`0a220d73c`), #141 (`19368d2a6`),
   #143 (`e560fe80c`), #145 (`ca55dd3ec`). These are a linear
   non-draft stack; review each delta, then qualify their combined integration.
2. #121 (`e910c67c2`): avoid discarded optional iteration traces for scalar
   symbolic roots, retaining the shared solver, mandatory validation, rich
   defaults, and explicit trace overrides.
3. #137 (`e3ebda342`) and #147 (`c52a7c096`) together: modular abelian
   varieties and the performance/correctness follow-up. The second PR addresses
   real scaling problems in the first and must not be replaced with a refreshed
   optimizer manifest as evidence of acceptable performance.

Integration starts from main `603c14f62` in a separate worktree. Preserve the
release lane's changes; do not move tags or publish release artifacts.

## Python review and reconciliation

- Keep main's cancellation-aware performance test wrapper, not the incoming
  synchronous subprocess wrapper. Retain its bounded runtime and process-tree
  cancellation.
- Keep main's confirmed-sample-count validation regression.
- Use the source-level `sagejs.runtime.__dir__` implementation from #143 and
  remove the temporary generated-JavaScript hook. Test live attribute
  insertion/deletion, host values equal to undefined, sorting, and exclusion
  of compiler-private names.
- Rebind the changed runtime source in the NLopt manifest, preserving its
  **pending source-current requalification** status. A new hash is not a new
  portable mathematical qualification.
- Build receipt v3 separates artifact inputs from validation-only inputs.
  Complete output inventories are authenticated, unknown source paths remain
  inputs, and numerical manifest-reviewed tests remain build inputs.
  Native refresh does not relabel the compiler's original workspace lineage.
- RustPython's initial required tranche intentionally exposes remaining
  unsupported semantics. It is not a blanket passing compatibility claim or
  an always-red routine CI gate. Verify the newly fixed callable case and
  preserve visible failures in the diagnostic report.
- Regenerate reference documentation from the integrated build, not either
  branch's stale generated catalog.

## Modular review findings to resolve before merge

- The cyclic newform representation must retain exact commutation with the
  primitive operator. Equality on one row alone is insufficient.
- Proper cuspidal constituents need their own star-sign intersection, not
  the ambient sign space. Retain the follow-up regression.
- Integral quotient surjectivity can use an identity Hermite row lattice;
  Smith transformation matrices are unnecessary and caused severe growth.
- **Serialization defect:** `ModularAbelianVarietyMap` accepts arbitrary
  integral matrices, but the proposed codec stores only endpoints and a
  quotient flag, then reconstructs a canonical inclusion/quotient. Reject
  unsupported maps or bind and reconstruct their actual matrix; add a
  noncanonical-map regression so loading cannot silently change the map.
- Composite-level full-Hecke isotypic decomposition is explicitly not Sage's
  finer degeneracy-labelled isogeny decomposition. Preserve this documented
  boundary and the exact oldspace comparison.

## Qualification approach

Run focused tooling tests before the expensive build; use one full build per
coherent integration group. Then run compiled behavioral regressions, strict
Python, architecture checks, relevant unit/portable tests, and browser/Wasm
checks for runtime changes. Use the persistent local machines for iteration.
Push each validated main integration promptly, and treat GitHub CI as
confirmation. Do not increase size or performance limits simply to turn a
check green.

Coordination is in [Discussion #104](https://github.com/sagemathinc/sagejs/discussions/104).
