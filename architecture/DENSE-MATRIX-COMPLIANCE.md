# Dense-matrix native compliance

This is the focused compliance result for the 50 Node-API exports implemented
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
| Mature-library and thin storage operations | 22 | Move their stable ABI into CPython-parseable FFI declarations. Keep N-API only as a compatibility adapter while callers migrate. |
| Sage.js-owned algorithmic control flow | 12 | Freeze the C implementation as an explicit exception/oracle and migrate the actual algorithm body to source-transparent typed Python. |

“Compliant” here has a precise meaning: there is no unclassified matrix export,
no export silently treated as generic legacy code, and no way to add or remove a
registered matrix callback without failing `pnpm architecture:check`. It does
**not** mean that all 5,803 lines have already been rewritten. The remaining
physical migrations are visible work, rather than architecture hidden inside a
large addon.

The declared matrix contracts are real: FLINT `nmod_mat_rank`, `nmod_mat_inv`,
`nmod_mat_mul`, `nmod_mat_rref`, `nmod_mat_nullspace`, `nmod_mat_solve`,
`nmod_mat_det`, `nmod_mat_charpoly`, and `nmod_mat_minpoly` use packed matrices,
generated dynamic wrappers, isolated native lowering, checked dimensions and
status results, all-exit cleanup, and transactional output. They establish the
reusable route for foreign and thin operations without adding function-name
substitutions to the compiler.

Dense matrices over prime fields of characteristic at most 32 bits now
canonically own caller-visible row-major `BigUint64Array` storage. Construction,
random fill, indexing, mutation, copying, packed serialization, arithmetic,
scalar multiplication, equality, transpose, stacking, augmentation, row and
column selection, density, trace, multiplication, rank, RREF, right kernel,
square solve, inverse, determinant, characteristic polynomial, minimal
polynomial, and result construction preserve that representation.
The default elimination route is declaration-driven FLINT over the same packed
kernel ABI; the readable typed-Python algorithms remain executable compiler
witnesses, small-size candidates, and differential oracles. Neither source nor
result must own an N-API matrix object.

The old N-API representation is an explicit differential oracle in tests and
benchmarks. It is no longer the canonical small-prime matrix representation,
and the packed public path has no conversion escape hatch. Generated dynamic
FFI adapters may construct a temporary host-library value from packed input;
that is a replaceable declared boundary, not public object ownership. A hard
integration test forbids every legacy matrix N-API property while exercising
the complete packed lifecycle with compiled artifacts. Advanced decompositions
and the larger collection of non-prime-field rings still expose the remaining
physical migration work. The kernel-level and public-operation evidence is
recorded in
[`../bench/DENSE-PRIME-MIGRATION.md`](../bench/DENSE-PRIME-MIGRATION.md).

Dense matrices over `ZZ` now follow the same ownership rule. Their canonical
representation is an `IntegerBuffer`: one signed limb count per entry and a
fixed-capacity row-major limb region. Loads in structural typed-Python kernels
use tagged signed-64-bit values and promote the individual value to GMP at the
overflowing instruction. Construction, random fill, indexing, mutation,
copying, serialization, addition, subtraction, negation, scalar multiplication,
equality, transpose, stacking, augmentation, selection, density, and trace do
not construct an N-API matrix. Spare output limbs are compacted at the
representation boundary when growth would otherwise compound; the scan is a
tight host primitive over typed metadata, not interpreted mathematical code.

Multiplication, rank, determinant, characteristic polynomial, Hermite form,
Smith form, and exact right kernels cross declared `packed_fmpz_matrix` FFI
contracts. Generated isolated C initializes lexical FLINT matrices, copies
packed inputs, invokes FLINT, preflights every result's capacity, copies back
transactionally, and clears every temporary on all exits. The public `Matrix`
still owns only its packed storage. The generated dynamic adapter may construct
a temporary legacy matrix as a differential oracle; `SAGEJS_FORBID_ZZ_MATRIX_NAPI=1`
proves that no production object obtains or uses such a handle. The focused
correctness gate is `test/dense-integer-migration.cjs`, and
`pnpm test:matrix:integer-performance` ratchets the warm public surface.

## Retained representation primitives

`acbMatrix`, `matrixExportPacked`, `nmodMatrix`, `nmodMatrixPacked`,
`nmodMatrixRandom`, `qqbarMatrix`, `qqMatrix`, `qqMatrixExportPacked`,
`qqMatrixPacked`, `zmodMatrix`, `zmodMatrixPacked`, `zmodMatrixRandom`,
`zzMatrix`, `zzMatrixExportPacked`, `zzMatrixPacked`, and `zzMatrixToQQ`.

These functions own opaque Node-facing matrix storage or conversion. The `ZZ`
variants are now retained only for differential tests and generated dynamic
adapters; they are no longer production representation primitives. The
remaining functions are legitimate native primitives during their migrations,
but they are not the portable public mathematical ABI. New hosts should use
packed storage contracts and their own thin adapters rather than emulate
JavaScript object lifetimes.

## Declaration migrations

`acbMatrixScalarMul`, `matrixAdd`, `matrixAugment`, `matrixDet`,
`matrixEntry`, `matrixEqual`, `matrixHermite`, `matrixHermiteTransform`,
`matrixHowell`, `matrixIsZero`, `matrixMul`, `matrixMulBlas`, `matrixNeg`,
`matrixMinpoly`, `matrixScalarMul`, `matrixSelectColumns`, `matrixSelectRows`, `matrixSmith`,
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

1. the exact set of 292 registered N-API exports;
2. the unique C/C++ definition, line, size, source hash, and direct calls for every callback;
3. the exact 50-export `matrix.c` set;
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
