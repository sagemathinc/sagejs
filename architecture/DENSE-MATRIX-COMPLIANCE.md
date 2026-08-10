# Dense-matrix native compliance

This is the focused compliance result for the 49 Node-API exports implemented
in `packages/flint/src/matrix.c`. The normative, machine-checked assignment is
`matrix_remediation` in [`native-export-policy.json`](native-export-policy.json);
the generated export-to-definition evidence is
[`native-exports.json`](native-exports.json).

## Result

The old translation unit mixed three genuinely different layers. They are now
separated in policy even where physical source migration is not complete:

| Layer | Exports | Current rule |
|---|---:|---|
| Representation and packed-storage primitives | 16 | Retain as replaceable host adapters. Do not add mathematics. |
| Mature-library and thin storage operations | 21 | Move their stable ABI into CPython-parseable FFI declarations. Keep N-API only as a compatibility adapter while callers migrate. |
| Sage.js-owned algorithmic control flow | 12 | Freeze the C implementation as an explicit exception/oracle and migrate the actual algorithm body to source-transparent typed Python. |

“Compliant” here has a precise meaning: there is no unclassified matrix export,
no export silently treated as generic legacy code, and no way to add or remove a
registered matrix callback without failing `pnpm architecture:check`. It does
**not** mean that all 5,803 lines have already been rewritten. The remaining
physical migrations are visible work, rather than architecture hidden inside a
large addon.

The first declared matrix contracts are already real: FLINT `nmod_mat_rank`,
`nmod_mat_inv`, `nmod_mat_rref`, `nmod_mat_nullspace`, and `nmod_mat_solve`
use packed matrices, generated dynamic wrappers, isolated
native lowering, checked dimensions and status results, all-exit cleanup, and
transactional output. They establish the reusable route for the 21 foreign and
thin operations without adding function-name substitutions to the compiler.

Dense rank, RREF, right-kernel, and solve algorithms over primes at most 32
bits now exist as real typed-Python packed kernels, with declaration-driven
FLINT using the same kernel ABI. They are compiler witnesses and differential
oracles, not yet the default `Matrix` representation. Production `Matrix`
still canonically owns an opaque FLINT object; exporting all of its residues
before a packed call overwhelms the fast kernel. Production therefore retains
the existing FLINT N-API operations until caller-owned row-major packed storage
is canonical from matrix construction onward. The corrected scope and both
kernel-level and public-operation evidence are recorded in
[`../bench/DENSE-PRIME-MIGRATION.md`](../bench/DENSE-PRIME-MIGRATION.md).
This is a bounded migration state, not an accepted permanent architecture.
Completion requires deleting the small-prime N-API matrix representation and
callbacks after packed construction, mutation, algorithms, FFI adaptation,
serialization, and result materialization form one verified vertical slice.

## Retained representation primitives

`acbMatrix`, `matrixExportPacked`, `nmodMatrix`, `nmodMatrixPacked`,
`nmodMatrixRandom`, `qqbarMatrix`, `qqMatrix`, `qqMatrixExportPacked`,
`qqMatrixPacked`, `zmodMatrix`, `zmodMatrixPacked`, `zmodMatrixRandom`,
`zzMatrix`, `zzMatrixExportPacked`, `zzMatrixPacked`, and `zzMatrixToQQ`.

These functions currently own opaque Node-facing matrix storage or conversion.
They are legitimate native primitives, but they are not the portable public
mathematical ABI. New hosts should use packed storage contracts and their own
thin adapters rather than emulate JavaScript object lifetimes.

## Declaration migrations

`acbMatrixScalarMul`, `matrixAdd`, `matrixAugment`, `matrixDet`,
`matrixEntry`, `matrixEqual`, `matrixHermite`, `matrixHermiteTransform`,
`matrixHowell`, `matrixIsZero`, `matrixMul`, `matrixMulBlas`, `matrixNeg`,
`matrixScalarMul`, `matrixSelectColumns`, `matrixSelectRows`, `matrixSmith`,
`matrixStack`, `matrixSub`, `matrixTranspose`, and `qqbarMatrixScalarMul`.

Most mathematical work in this set is already performed by FLINT. The
remediation is therefore not to rewrite FLINT in Python. It is to express
dimensions, packed storage, ownership, effects, status translation, and the C
symbol in an FFI declaration shared by dynamic, native, WebAssembly, and future
CPython hosts.

## Typed-Python migration exceptions

`cyclotomicMatrixPolyEvaluate`, `cyclotomicMatrixRightKernel`,
`matrixApproxEigensystem`, `matrixCharpoly`, `matrixExactEigenvalues`,
`matrixInverse`, `matrixPivots`, `matrixRank`, `matrixRightKernel`,
`matrixRref`, `matrixSolve`, and `matrixSparseLeftMul`.

These callbacks do more than marshal one established library operation. Across
the supported base rings they contain Sage.js-owned sparse traversal,
multimodular reconstruction, pivot selection, ordering and normalization,
residue-ring policy, or mixed-ring dispatch. Calling the whole callback a
“FLINT binding” would lose that distinction. The existing C is frozen and
remains useful as an oracle; production migration requires ordinary Python
bodies plus the packed numeric domains needed to compile those bodies well.

The dense prime-field typed-Python kernels show that nested matrix loops can
reach native performance and can share one storage contract with mature
FLINT. They do not by themselves prove the
cyclotomic, algebraic, approximate, rational, and residue-ring algorithms above
are migrated, so this document does not claim that.

## Enforcement

The architecture gate independently checks:

1. the exact set of 291 registered N-API exports;
2. the unique C/C++ definition, line, size, source hash, and direct calls for every callback;
3. the exact 49-export `matrix.c` set;
4. membership of every matrix export in exactly one remediation group;
5. agreement between each group's rule and the symbol's policy decision; and
6. the reviewed byte and line count of the complete mixed translation unit.

Run:

```sh
pnpm architecture:exports
pnpm architecture:check
```

Regenerating an inventory can expose a change, but cannot authorize it. The
source policy must be deliberately updated and reviewed.

## Host portability

This split is what preserves a future `sage.py` option. Typed Python algorithms
and FFI declarations are host-neutral sources. Packed matrix ABIs can receive a
Node adapter today and a CPython extension adapter later. Only the retained
representation primitives are intrinsically Node-facing, and their role is
explicitly limited. If mathematical control flow were allowed to accumulate in
those callbacks, a CPython host would first have to recover the algorithm from
N-API-specific C.
