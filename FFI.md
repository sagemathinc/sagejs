# Sage.js foreign-function interface

Sage.js FFI declarations are a checked allowlist between readable mathematical
Python and mature native libraries. They are not C header ingestion and they
do not expose arbitrary pointers. A declaration records the semantic
signature, concrete C ABI, ownership, effects, error policy, dynamic adapter,
native link requirements, and supported targets for each callable function.

The first declaration is [`ffi/flint.ffi.json`](ffi/flint.ffi.json). It
exports eight deliberately different witnesses:

- `dirichlet_group(uint64) -> DirichletGroup`, a generated opaque owned
  resource with explicit `close`, context-manager support, and finalization;
- `dirichlet_group_size(DirichletGroup) -> uint64` and
  `dirichlet_group_num_primitive(DirichletGroup) -> uint64`, two borrowed
  operations which cannot retain or close the resource;
- `n_is_prime(uint64) -> bool`, a direct C return with value semantics;
- `fmpz_gcd(Integer, Integer) -> Integer`, with borrowed exact inputs, an owned
  exact result, allocation, and FLINT's leading `fmpz_t` out-parameter.
- `nmod_mat_rank(UInt64Buffer, rows, columns, modulus) -> uint64`, whose
  borrowed packed entries become a lexical `nmod_mat_t` copy;
- `nmod_mat_inv(output, source, size, modulus) -> bool`, whose caller-owned
  output is copied back only after success and whose zero status becomes
  `ValueError("matrix is singular")`. Input and output may alias safely.
- `nmod_poly_mul(output, left, right, ...) -> bool`, a substantial mature
  FLINT algorithm reached through reusable packed-slice declarations.

[`ffi/igraph.ffi.json`](ffi/igraph.ffi.json) is the first independent library
adapter. It declares an owned `IGraph`, a borrowed `IGraphEdges` view, and an
acyclic ownership edge from the view to the graph. This is intentionally a
different native package and toolchain from FLINT. Its packed canonical
labeling operation uses the same slice adapter as FLINT polynomial
multiplication, proving that the adapter is an ABI facility rather than a
compiler branch keyed by library or symbol.

## One declaration, two execution paths

Ordinary code imports a generated, safe Python surface:

```python
from sagejs.ffi.flint import fmpz_gcd, n_is_prime

assert n_is_prime(101)
assert fmpz_gcd(18, 30) == 6
```

The generated functions use the checked `sagejs.runtime.ffi_call` boundary.
That boundary loads the declared package, performs semantic-type marshalling,
validates the return value, and invokes only the generated wrapper's declared
dynamic export. It contains no mathematical algorithm. The low-level runtime
intrinsic is privileged plumbing: architecture checks prohibit mathematical
modules from calling it directly.

The same import is valid inside source-transparent typed Python:

```python
from sagejs.ffi.flint import fmpz_gcd
from sagejs.native import native

@native
def gcd_kernel(a: Integer, b: Integer) -> Integer:
    return fmpz_gcd(a, b)
```

Here the native compiler resolves the import by module and declaration
identity. The optimized IR contains an `ffi.call` with the declaration's
content hash. The host-isolated C core calls FLINT directly; it never returns
to Node, JavaScript, or Python. For `fmpz_t`, the compiler generates scoped
initialization, GMP/FLINT conversion, and cleanup from the ABI types. This is
generic type-adapter lowering, not a special case for a function named `gcd`.

Every generated artifact includes the declaration and central ABI-catalog
hashes in its cache identity. Changing an ABI type, adapter, effect, ownership
rule, or link dependency invalidates it.

## Commands

```sh
sagejs ffi check
sagejs ffi audit
sagejs ffi explain flint
sagejs ffi explain flint --json
sagejs ffi generate flint
sagejs ffi explain igraph --json

sagejs native explain bench/native-ffi-flint.py
sagejs native ir bench/native-ffi-flint.py
sagejs native emit-core-c bench/native-ffi-flint.py
sagejs native compile bench/native-ffi-flint.py
pnpm bench:native:ffi
pnpm bench:native:ffi:matrix
pnpm bench:native:ffi:resource
```

`ffi check` validates the strict schema and rejects stale generated Python.
`architecture:check` runs the same registry and drift checks, so an agent
cannot quietly add an unchecked native call.

`ffi audit` also verifies
[`architecture/native-boundaries.json`](architecture/native-boundaries.json),
the exact reviewed inventory of classified native files, declared FFI calls,
N-API exports, runtime intrinsics, and visible Wasm exports. A new boundary
fails CI until `sagejs ffi audit --write` is run and its complete diff is
reviewed. Regeneration is an explicit acknowledgement, not an allowlist bypass.

## Version 5 declarative ABI and safety envelope

[`ffi/abi-types.json`](ffi/abi-types.json) is the checked catalog of semantic
types, C ABI representations, and reusable adapters. Declarations can add a
new function using cataloged representations without editing the compiler.
Every validated function receives a normalized `sagejs.ffi/call-plan-v1`,
visible in `sagejs ffi explain --json`, containing ordered ABI arguments,
lowering kinds, shape constraints, checked-result policy, and transactional
writes. Dynamic fallback generation and the isolated C core consume the same
plan.

Version 5 supports `uint64`, `bool`, exact `Integer`, and borrowed mutable or
immutable `UInt64Buffer` semantics. In addition to scalar `ulong`, `slong`,
`int`, and `fmpz_t` adapters, a reusable `packed_nmod_matrix` adapter declares
the data, shape, modulus, access, and aliasing used to initialize and clear a
FLINT matrix. A reusable `packed_slice` adapter relates typed storage to an
explicit length and stages mutable output in temporary native memory. The
generic `zero_is_error` policy checks C status before any output copyback, so
failure is transactional. Calls explicitly declare purity, writes,
determinism, thread-safety, allocation, and possible exceptions. Native and
dynamic implementations remain mandatory.

A generated opaque owned-resource declaration names
its semantic Python class, hidden ABI type, dynamic close export, native clear
symbol, ownership, and target availability. Ordinary Sage.js receives an
unforgeable generated wrapper:

```python
from sagejs.ffi.flint import dirichlet_group, dirichlet_group_size

with dirichlet_group(101) as group:
    assert dirichlet_group_size(group) == 100

assert group.closed
```

`close()` is idempotent and deterministic; use-after-close and cross-resource
borrows fail before entering the addon. `FinalizationRegistry` is a leak
safety net, not the primary lifetime protocol. The dynamic package adapter
performs the actual library-specific close exactly once.

Inside `@native`, owned resources are deliberately narrower. They are lexical
locals only: they cannot be public parameters or results, are currently
constructed only in the top-level function block, and cannot escape. The compiler emits the concrete ABI
storage plus an initialization flag, calls the declared initializer, and calls
the declared clear symbol on every success and failure exit. The JavaScript
same-source fallback uses a reverse-order `try/finally` resource stack. This is
resource-specific generated RAII, not a general borrow checker and not raw
pointer access.

Scalar constructor preconditions such as a positive modulus are declaration
data. They lower to both dynamic validation and isolated-core guards, so an
invalid value cannot reach a foreign routine that assumes its precondition.

This narrow surface gives useful safety without attempting to recreate Rust:

- no raw pointer is exposed to mathematical Python;
- ownership is declaration data and generated cleanup is lexical;
- unknown fields, types, directions, imports, functions, and error policies
  fail closed;
- native execution remains host-isolated;
- dynamic and native results are tested differentially;
- Windows and Wasm availability are explicit target properties.

Borrowed views and explicit ownership graphs remain part of the envelope. Each borrowed
view names one resource owner; schema validation rejects missing owners and
cycles and computes the owned root shown by `sagejs ffi explain`. Dynamic
views retain their owner strongly and consult root state on every borrow, so
closing the owner immediately invalidates all descendants. A view has no
`close()` because it owns nothing. In a host-isolated kernel, the compiler
emits view ABI storage without cleanup and keeps the lexical owned root live
until every exit has run its generated destructor.

Declarations also make native toolchain roots and source headers per-library data.
`SAGEJS_FLINT_PREFIX` and `SAGEJS_GRAPH_PREFIX` can independently select
installed artifacts; headers and archives are never accidentally resolved
through FLINT's prefix merely because FLINT was the first adapter.

Run `pnpm ffi:lifecycle:fuzz` to compile and execute a deterministic igraph
owner/view lifecycle corpus with ASan, UBSan, and leak detection on Unix. The
ordinary and generated-JavaScript paths separately test repeated close,
borrow, and use-after-close schedules. Windows reports this sanitizer job as
an explicit unavailable capability while retaining ordinary and native
lifecycle coverage.

Future revisions should add generated C++ exception shims, nullable results,
more element and record layouts, callbacks with a
clearly marked host-effect boundary, and richer status translation. Those
features extend the schema and adapter library; they must not become ad hoc
compiler branches for individual symbols.

## Adding a binding

1. Add or extend a `ffi/*.ffi.json` declaration.
2. Declare semantic and ABI types, argument direction/order, ownership,
   effects, error policy, targets, headers, and link dependencies.
3. Run `sagejs ffi generate <library>` and inspect the generated safe module.
4. Add dynamic and host-isolated native differential tests.
5. Inspect `native ir` and `native emit-core-c`; ensure the core has no host
   callbacks.
6. Add a representative benchmark when performance motivates the binding.
7. Run `pnpm ffi:check`, `pnpm architecture:check`, and relevant native tests.
