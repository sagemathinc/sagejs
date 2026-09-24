# Sage.js class-group core

This package contains the production Rust mathematical core for bounded cubic
class and unit groups and unconditional imaginary-quadratic class groups. The
cubic core is extracted from the qualified Sage.js/PARI 2.17.4 campaign and
preserves the source provenance and GPL notices of that work.

The current supported mathematical boundary is deliberately narrow:

- monic irreducible cubic polynomials with coefficients admitted by explicit
  preparation limits;
- exact maximal-order preparation and replayable certificates;
- bounded relation collection and authenticated class-group presentations;
- GRH-conditional analytic completion, exact compact units, and regulator
  enclosures;
- bounded class coordinates for arbitrary integral ideals against a retained
  completed result.
- negative fundamental quadratic discriminants with `|D| <= 10^7` and at most
  20,000 reduced classes; exact reduced forms, invariant factors, generators,
  representative ideals, and a complete coordinate map for every class.

FLINT 3.6, its integrated Arb implementation, GMP, and MPFR are required
capabilities. The mathematical API is host-independent and contains no Node,
Python, or filesystem dependency. `service.rs` adds the shared bounded product
protocol; the `class-group-service` binary provides newline-delimited native
transport, and `reactor.rs` exposes the same protocol to a checked Wasm host.
Artifact authentication, cancellation by worker termination, and public Sage
objects remain host responsibilities. A private legacy qualification parser is
temporarily retained for source identity; it is not exported by this package.

This extraction does not promote benchmark fixtures, PARI controls, corpus
receipts, experiment CLIs, brute-force contrast collectors, or prototype Wasm
crates. Those remain qualification consumers. A small private prepared-input
module is temporarily retained because historical Row-6 qualification helpers
are interleaved with the production arbitrary-ideal reducer; it is not exposed
as a production input.

The package is `GPL-2.0-or-later`. Some collector components are translations
or behavioral reimplementations of PARI 2.17.4 and retain PARI attribution.
The linked arithmetic libraries retain their own licenses and distribution
obligations.

For a repository-native Unix build, first build `@sagemath/sagejs-flint`, or
set `SAGEJS_FLINT_PREFIX` to the authenticated installation, then run:

```bash
packages/class-groups/scripts/cargo-native.sh test --locked \
  --manifest-path packages/class-groups/Cargo.toml
```

The wrapper deliberately places that installation's headers and libraries on
the GMP/MPFR system-library probe path. This makes Rug and FLINT resolve to the
same allocator domain; direct Cargo builds that accidentally select another
GMP are not a supported product build. `scripts/build-native.sh` additionally
performs a link-closure sentinel check.

`scripts/build-wasm.sh` resolves and authenticates the host-specific Sage.js
WASI toolchain through `packages/wasm-toolchain`; it does not duplicate a
host-specific cache identity. Set the shared `SAGEJS_WASM_TOOLCHAIN_ROOT`
override when an explicit prepared root is required. The script emits
`dist/class-group-core.wasm`. Its link flags enforce one non-shared memory with
an initial 16 MiB and maximum 256 MiB; the product loader independently
revalidates those limits before instantiation.

The service protocol is ABI 1 and uses one JSON document per native line or
Wasm call. Requests and responses carry bounded caller IDs. Cubic operations
are `capability`, `open`, `summary`, `query`, `publication`, and `close`; all
operations after `open` bind both its generation and opaque decimal handle.
The independent one-shot operations `imaginary-class-number` and
`imaginary-class-group` take `polynomialAscending` as three decimal coefficient
strings of a monic polynomial defining a negative fundamental discriminant.
They return unconditional results without allocating a resident handle. The
full-group result includes the exact representative-ideal map and a detached
reduced-form completeness certificate. Inputs outside the stated domain fail
with a typed error rather than silently changing proof mode.

The public Sage.js interface currently selects this backend explicitly:

```python
R.<x> = QQ[]
K.<a> = NumberField(x^2 + 23)
G = K.class_group(algorithm="rust")
G.invariants()                         # (3,)
G.gen().coordinates()                  # (1,)
G(G.gen().ideal()).coordinates()       # (1,)
K.class_number(algorithm="rust")      # 3
```

`QuadraticField(-23)` and its maximal order accept the same `algorithm="rust"`
selection. The Rust route uses the maximal-order field discriminant, even
when the defining polynomial has a nonfundamental discriminant. It is
unconditional on its admitted `|D| <= 10^7` domain. The existing automatic
quadratic route remains in place until the full public performance panel and
Wasm integration are qualified.

`summary` returns only the sealed field/class-group binding, invariants, and
canonical exact generator-ideal lattices, avoiding the detached relation graph
carried by `publication`. An invalid, closed, or stale handle fails with the
typed `unknown-handle` category.
