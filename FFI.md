# Sage.js foreign-function interface

Sage.js FFI declarations are a checked allowlist between readable mathematical
Python and mature native libraries. They are not C header ingestion and they
do not expose arbitrary pointers. A declaration records the semantic
signature, concrete C ABI, ownership, effects, error policy, dynamic adapter,
native link requirements, and supported targets for each callable function.

The first declaration is [`ffi/flint.ffi.json`](ffi/flint.ffi.json). It
exports two deliberately different witnesses:

- `n_is_prime(uint64) -> bool`, a direct C return with value semantics;
- `fmpz_gcd(Integer, Integer) -> Integer`, with borrowed exact inputs, an owned
  exact result, allocation, and FLINT's leading `fmpz_t` out-parameter.

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

Every generated artifact includes the declaration hash in its cache identity.
Changing an ABI, effect, ownership rule, or link dependency invalidates it.

## Commands

```sh
sagejs ffi check
sagejs ffi explain flint
sagejs ffi explain flint --json
sagejs ffi generate flint

sagejs native explain bench/native-ffi-flint.py
sagejs native ir bench/native-ffi-flint.py
sagejs native emit-core-c bench/native-ffi-flint.py
sagejs native compile bench/native-ffi-flint.py
pnpm bench:native:ffi
```

`ffi check` validates the strict schema and rejects stale generated Python.
`architecture:check` runs the same registry and drift checks, so an agent
cannot quietly add an unchecked native call.

## Version 1 safety envelope

Version 1 intentionally supports only `uint64`, `bool`, and exact `Integer`
semantics, with `ulong`, `int`, and `fmpz_t` ABI adapters. Error policy is
currently `none`; calls must explicitly declare purity, determinism,
thread-safety, allocation, and possible exceptions. Native and dynamic
implementations are both mandatory.

This narrow surface gives useful safety without attempting to recreate Rust:

- no raw pointer is exposed to mathematical Python;
- ownership is declaration data and generated cleanup is lexical;
- unknown fields, types, directions, imports, functions, and error policies
  fail closed;
- native execution remains host-isolated;
- dynamic and native results are tested differentially;
- Windows and Wasm availability are explicit target properties.

Future revisions should add opaque owned/borrowed handles, generated C++
exception shims, slices and packed buffers, nullable results, callbacks with a
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
