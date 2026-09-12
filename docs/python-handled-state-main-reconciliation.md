# Handled-state reconciliation with current main

This separate worktree combines frozen candidate
`ad529d2d9a2b74bd82482acf383108f9531abb9d` with freshly fetched main
`02a683d213072c3129da1f71e2aa47de447cfc4a`. The assembled import is
`6b286a713bda3c115c32e8bdd0c6e28141a47a2e`, not a main adoption or a
qualified full build. The original candidate worktree is detached at its exact
commit; its source, task, build receipt, and artifacts remain unchanged.

## Source review and conflict resolution

Main adds finite-extension polynomial geometry, integral oldform decomposition,
and their native, FFI, browser, and generated inventories. It is not exclusively
a mathematical implementation delta: `tools/python/module-resolver.ts` now
keeps explicitly listed `runtime_module_names` dynamic even when package-shell
source metadata exists, preserving authenticated lazy-loader ownership.

All runtime source merges intact. Only the optimizer artifact manifest and
dashboard conflict. Current-main inventories were retained as the regeneration
starting point; the optimizer generator is then run against the complete
merged source with the actual TypeScript-refreshed frontend. No runtime source
or test assertions are edited to resolve this merge.

Dependencies/artifacts were copied as private seeds without hardlinks. Only
TypeScript outputs were refreshed; no full local build, compiler self-build,
module-cache rebuild, or native build was requested. Compiler/baselib seeds
retain their frozen hashes, while the module-resolver output reflects new main.
Consequently **there is no full merged-source qualification or current build
receipt**. Focused execution is partial diagnostic evidence; CI must build and
qualify the final head before adoption.

Diagnostic SHA-256 identities:

- resolver source: `296ee3c2f607a65b66b0c165a8dbe283c9d5d90a421e0c035067b6993d3de64e`
- refreshed resolver output: `2f7577b80bc413c042f563e1a8b134727e61c07aee2805744418ce11e7cd4bb5`
- retained compiler: `0d4357ac1943d95c12d1330b5b522cde8766c0ab52bec3ef3c5f3abc83f0df59`
- retained baselib: `f9d21b02865b854b6b6e911803689b543bed8e3af372c8ce5c5a177c23bae4a9`

## Partial integration checks

TypeScript compilation succeeds. All 54 focused diagnostics pass: the actual
browser frontend/lazy module cache tests, generator scope and selective emission,
and combined/default/handled-state behavior. Full architecture checking,
generated optimizer verification, merge inventories, generated docs, q-exp
source freeze, and parallel scope checks pass. These checks do not replace the
unperformed full merged-source build, portable/native/product qualification.
The combined core-runtime budget remains **902,078 / 903,000 bytes**.

Regenerated optimizer inventory contains 16,873 functions and 14,657 loops:

- compiler identity: `sha256:93dcc270a8f431dfee93852fc2a51b6475304f136e9399b91b3d2e0d4efd8940`
- source bundle: `sha256:21b046658a51f8a190992f3fb57da1a273631f1f69ddac2430999df53388294b`
- canonical snapshot: `sha256:91f02417dc3780b147301aca292d285dadea400b8076f49f5dcdf45b68a348ef`

Local logs use `/home/user/handled-state-main-*.log`. The old receipt remains
byte-identical in both worktrees (SHA-256
`18ebe597044d73497a084bdcab9fc19326ed53ead855411f0fadb502a5015345`),
and is not rewritten or represented as current for this source.

## Additional diagnostics on the original frozen artifacts

Root ran the full 536-case adopted upstream corpus against the unchanged
original candidate artifacts: **533 pass**, with the same three reviewed
intentional incompatibilities (`sys1.py`, `weakref_finalize_collect.py`, and
`weakref_ref_collect.py`) and zero required failures. The gate explicitly says
`qualified: false`, `fullManifest: true`, `artifactOnly: true`,
`unchanged: true`, `passed: true`.

Root also ran the pinned pyparsing 3.3.2 public parsing/validation workflow,
not an import-only smoke. It passes against those unchanged original artifacts
and CPython. Its gate explicitly says `qualified: false`, `artifactOnly: true`,
`unchanged: true`, `passed: true`. This does not convert the earlier standalone
compound-candidate pyparsing failure into a pass or establish source/package
closure for this later main merge. It is new evidence on a different combined
artifact; performance remains unmeasured.

The two reports bind the retained compiler/baselib hashes above. Report and log
SHA-256 provenance:

- `/home/user/handled-state-integration-upstream-artifacts.json`:
  `68815460e0c1f2c4f364f24ccd2ed8ab2ead1e6dae1766dfd27fb25916efdfe0`
- matching `.log`:
  `891ace13c301420ee948f780cacaaf88ba17fd1f5ae067cf5cfc393202dbcd8f`
- `/home/user/handled-state-integration-pyparsing-artifacts.json`:
  `fc15fcd185c75003f853ab84ec3c4cb6f9f2d9b206002ef7e00dc1d52eecaffe`
- matching `.log`:
  `a363b1df63b5ca716faa853fd82bcdd159b52e0024af1a8570a066726cd267ae`

The pyparsing source tree SHA-256 is
`c7397854c6cd65d5a27350da9826feded2aabfba73c5a75bd7d3e256af0416a8`
and remains unchanged before/after both executions. CPython is 3.14.4 and Node
is 26.8.1. These are historical-artifact diagnostics, not final-head CI receipts.

No release, tag, new PR, readiness change, or main merge is performed.
Regenerated optimizer assets remain local; manifest identities do not imply
remote asset availability. Root retains review and PR #244 head-advance control.
