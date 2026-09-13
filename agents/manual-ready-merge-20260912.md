# Manual ready-PR integration, 2026-09-12

The candidate starts from main `2564190042e003176ada3a71700f946ae992f973`
and integrates PR251 at `316a6f1b7cd129f217e2e5621a94201421d730c0`
and PR271 at `90fdfb9a6521b21bd4c5a87411430dcee9eb157b`.

Review preserves exact JSON scalar validation, detached container ownership,
subclass/custom-path fallback and diagnostic ordering. Rectangular coordinate
solves bulk-export the same exact RREF entries; transfer multiplicities are
accumulated as integers before constructing the rational matrix. There are no
mathematical algorithm, backend-default, budget, or native dependency changes.

Only optimizer reports conflicted. They were regenerated from the combined
source. The first combined CI run `34709205952` passed its fresh build but
rejected stale generated reference source locations. Commit `b71f57b75`
regenerates those locations and the rendered page without changing executable
source. The earlier browser run was superseded by the corrected-head run.

Local qualification:

- Complete eight-stage build passed in 9m55s, Node26.8.1, Linux x64.
- Two current FLINT adapters; 41 production kernel families built. Three other
  optional host adapters remain absent; this is not full product qualification.
- Final focused JSON/contract/modular-abelian tests: 20 passed, zero skipped.
- Strict Python: 403 modules, zero errors, CPython syntax and Ruff current.
- Full architecture checks, merge inventories and generated documentation pass.
- Retained JSON experiment source hashes and sample invariants verify.
- Optimizer snapshot `ff08d8976b1859c1d8138791e87815302b04cf645b5fbf6faf259bb9084e0924`
  assets were published as infrastructure with Latest disabled, then downloaded
  independently; all sizes and SHA-256 digests and the manifest match.

Fresh-worktree setup initially lacked pinned submodules and the FLINT dependency
prefix. Those failures were resolved before the successful complete build;
no source or check was changed to bypass them. The direct addon was validated
against candidate source, runtime, environment and binary hash before reuse;
the generated FFI adapter was rebuilt through its normal reconciliation path.

The original PR evidence retains its limits: local startup misses are historical
observations, internal JSON materialization timings are not public latency
claims, and the large-level Wasm decomposition timeout remains open.

PR244 remains held: its current head `9c46612c` includes the current head of
open draft PR260, `ce2aedd1`. The existing ready-only integration contract
requires resolution of that draft dependency before promotion. Neither draft
readiness nor the held runtime code was changed during this manual run.

## Promotion evidence

Exact candidate `b71f57b75025ad5cd042dde7b7f0fa46545f84a6` passed
[CI run 34709678281](https://github.com/sagemathinc/sagejs/actions/runs/34709678281):
Linux x64 routine validation, including portable tests and the unchanged startup
budget, plus Linux ARM64, macOS ARM64 and Windows x64 smoke checks.
[Wasm run 34709679386](https://github.com/sagemathinc/sagejs/actions/runs/34709679386)
passed artifact validation, exact-mathematics tests and Chromium worker parity.
Core runtime remains 900,269 / 903,000 bytes. The final follow-up adds this audit
only; it does not change the validated executable source or generated evidence.
