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
  Integration fixes this by accepting canonical maps only, binding their
  endpoints and exact matrix at both encoding and decoding. Unknown variety
  construction tags are rejected. Focused tests cover changed matrices,
  endpoints, missing matrix data, and nonboolean map selectors.
- The combined modular-forms source exceeded its 350,000-byte budget.
  Move the abelian-variety codec implementation behind actual on-demand
  dispatch into its owning lazy package; retain small routes in the modular
  codec. The resulting modular-forms source is 348,679 bytes without changing
  its limit. A test verifies registration alone does not load the new module.
- Neither branch's earlier optimizer snapshot qualifies the integrated compiler.
  The architecture gate requires current inputs, so regenerate the entire
  census with the actual compiler: 16,502 functions, 14,446 loops, 270 near
  misses. The content-addressed infrastructure assets are published as a
  non-latest prerelease and cold-download integrity was checked. This is
  structural evidence, not a mathematical performance qualification.
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

## Integration discoveries

- Unit tests exposed benchmark history inside `dist/runtime-cache`, changing
  the authenticated build-output inventory. Move controlled history to
  `dist/benchmark-state`, continue binding it in the benchmark's own runtime
  closure, and bump that environment schema to v5. The output-inventory guard
  remains strict; no receipt is rewritten to conceal a mutation.
- Preserve main's native explicit-receiver descriptor fix (`93c80383c`) and
  Windows replay timeout adjustment (`4cf78fcf0`). Keep the source-level
  runtime `__dir__` instead of reinstalling the temporary generated JS hook.
- Browser testing found that the new abelian-variety package was missing from
  the explicit lazy import list. Register both package and implementation,
  and add a shared Node-Wasm/Chromium quotient/serialization regression.
- Add the missing executable `AbelianVariety` constructor example; keep the
  existing website coverage ceiling unchanged.

## Intermediate validation and comparative evidence

Before the final documentation/browser-import corrections, the combined
candidate passed all eight build stages, 95 focused integration tests, and
the 508-case CPython gate (506 exact passes, two reviewed GC outcomes).
Unlike the first diagnostic run, that conformance gate retained a valid
build receipt. Strict Python passes with 379 modules and zero errors.
These observations are not a substitute for the final corrected build.

Three fresh processes per system, on the shared Linux x64 host, compared
the actual Sage 10.9.post1 workload with Sage.js. Quotient dimensions, map
sizes, and full Hecke polynomials match exactly. Decomposition checks compare
all factor dimensions and force every factor lattice. Interpreter startup
is excluded; only unrelated `J0(11)` is warmed. The host's Sage Python was
launched through a small `-python` adapter because its installed modern CLI
does not implement the legacy launcher flag.

| Workload | Level | Sage.js median | Sage median |
| --- | ---: | ---: | ---: |
| Connected quotient | 389 | 0.786 s | 1.812 s |
| Connected quotient | 1009 | 3.327 s | 9.378 s |
| Decomposition + factor lattices | 389 | 0.405 s | 0.251 s |
| Decomposition + factor lattices | 1009 | 1.660 s | 1.428 s |
| Decomposition + factor lattices | 2003 | 6.491 s | 17.369 s |

Small-case counterexamples remain explicit. These are scoped observations,
not universal speed claims or timing guarantees. Raw reports retain source
hashes and all samples in [quotient evidence](validation/ready-wave-quotient-linux-x64.json)
and [decomposition evidence](validation/ready-wave-decomposition-linux-x64.json).
