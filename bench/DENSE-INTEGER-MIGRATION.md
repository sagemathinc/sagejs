# Dense exact-integer matrix migration

Dense matrices over `ZZ` canonically own a generated `FmpzMatrix` resource.
The public Python object does not own an N-API matrix, a uniform-capacity
`IntegerBuffer`, or a JavaScript array of entries. FLINT therefore retains its
natural per-entry arbitrary-precision representation, including highly skewed
matrices where one entry is enormous and all other entries are small.

Generated declarations provide construction, checked entry access and
mutation, copy, arithmetic, linear algebra, formatting, and canonical
serialization. Expensive resource-to-resource operations remain entirely in
FLINT: they do not serialize, predict output limb sizes, or copy through a host
matrix. The public `Matrix` owns the generated wrapper, whose explicit
`close()` operation and garbage-collector finalizer both release the FLINT
object exactly once.

Typed Python still supplies the programmable compiled layer. The bulk importer,
random fillers, and nonzero traversal in
`src/lib/sagejs/kernels/matrix/dense_integer_flint.py` safely borrow the owned
resource. Their compiled cores contain no Node, JavaScript, Python, or N-API
calls. This proves that ordinary typed-Python algorithms can traverse and
mutate resource-owned exact objects without making the host or FLINT object
model part of their source.

## Representation boundaries

The older `IntegerBuffer` kernels remain compatibility and differential
oracles; they are not the production representation. A complete packed export
is permitted only at an explicit value boundary such as `.list()`, SagePack
serialization, or subdivided custom formatting. The stable `fmpz-le-v1`
SagePack entry stream is unchanged even though the in-memory owner changed.

The public implementation directly covers:

- zero, scalar, iterable, diagonal, identity, and random construction;
- checked entry mutation, copy, equality, and immutability;
- addition, subtraction, negation, scalar multiplication, multiplication,
  powers, transpose, stack, augment, and row/column selection;
- determinant, rank, trace, density, RREF over `QQ`, Hermite and Smith forms,
  exact right kernels, characteristic polynomials, and minimal polynomials;
- `ZZ`/`QQ` conversion, native default formatting, and stable serialization.

Legacy N-API integer matrices are accepted only at one audited compatibility
ingress and are immediately converted to the generated resource. Setting
`SAGEJS_FORBID_ZZ_MATRIX_NAPI=1` makes any accidental production use fail.

## Development-host evidence

The focused public-resource benchmark is:

```sh
node bench/dense-integer-public-resources.cjs
```

It measures list and random construction, addition, multiplication,
determinant, rank, formatting, SagePack round trips, row and column selection,
diagonal construction, and a 20,001-entry matrix whose final entry has 8,193
bits. It also asserts that every constructed or returned matrix owns a
generated resource and runs with legacy integer-matrix N-API access forbidden.

The first resource cutover deliberately exposes one remaining structural
performance cliff. Selecting 250 rows or columns from a 500 by 500 matrix takes
about 19--21 ms on the development host because the implementation crosses the
generated FFI twice per selected row or column. The previous canonical packed
representation took about 2.5--2.7 ms for the same operation. Restoring that
kernel after the resource cutover would require exporting and reimporting the
entire matrix, so it is not a sound compatibility path. The immediate follow-up
is a declared `FmpzMatrix` bulk row/column selector. By contrast, the generated
resource diagonal constructor takes about 9 ms at size 1000, versus about 333
ms for the previous entry-by-entry packed construction path.

The stricter warm-sample ratchet remains:

```sh
pnpm test:matrix:integer-performance
```

These are development-host regression measurements, not cross-machine speed
claims. The gate normalizes against a direct FLINT witness to distinguish a
real regression from host load while retaining hard raw-time ceilings.

## Correctness and isolation gates

`test/dense-integer-public-resource.cjs` exercises the public matrix lifecycle
with compiled native kernels required and again with native execution disabled.
It monkeypatches the source matrices' packed-export method to raise, then checks
that arithmetic, transforms, polynomial invariants, selection, conversion, and
kernel construction still succeed. This is a direct regression against hidden
full-matrix materialization.

`test/dense-integer-migration.cjs` preserves the packed-kernel differential
oracles and verifies stable `fmpz-le-v1` bytes, large entries, mutation,
immutability, resource ownership, and forbidden N-API access. The resource FFI
tests and sanitizer-backed lifecycle fuzzing separately cover deterministic
close, garbage-collected finalization, use-after-close rejection, and native
allocation accounting.

Run the focused gates with:

```sh
node test/dense-integer-public-resource.cjs
node test/dense-integer-migration.cjs
node test/fmpz-matrix-resource-kernels.cjs
pnpm test:matrix:integer-performance
pnpm test:matrix:corpus
pnpm ffi:lifecycle:fuzz
pnpm architecture:check
```

Set `SAGEJS_NATIVE_TRACE=1` in a Sage.js session to distinguish generated FLINT
resource operations from typed-Python isolated kernels. Missing compiled
artifacts are labeled explicitly; fallback execution is never reported as
native performance.
