# Public quadratic qualification

This standalone crate answers the degree-2 public-route question without
editing the active Rust core. It depends on the root experiment crate and uses
only public polynomial coefficients at runtime.

## Complete imaginary-quadratic engine

The coefficient-only entry point
`compute_imaginary_class_group_from_coefficients` returns an exact,
unconditionally complete class group for this fail-closed domain:

- integral monic quadratics with negative fundamental discriminant;
- absolute discriminant at most 10,000,000; and
- at most 20,000 reduced forms, an explicit memory/work resource cap.

The engine completely enumerates primitive reduced positive-definite binary
quadratic forms through the exact reduction bound `a <= sqrt(|D|/3)`. The
classical reduced-form theorem proves that this is one representative per
proper ideal class. Enumeration factors the exact identity
`a*c = (b^2-D)/4` for each parity-admissible bounded `b`, avoiding a quadratic
scan without changing the canonical reduced-form predicate. Exact Gauss
composition multiplies the forms' rank-two
integer ideal lattices, normalizes their lattice index with extended gcds and
2-by-2 minors, and reduces the resulting form canonically. The engine computes
orders, primary components, independent generators, normalized invariant
factors, and every class coordinate from this actual group law.

The public result includes normalized invariant factors, form generators with
exact orders, integral ideal bases in `(1, alpha)`, a coordinate map for every
canonical reduced-form class, the complete reduced-form enumeration, the
fundamental-discriminant factorization, and `unconditional-complete` proof
status. `verify_imaginary_class_group` replays the enumeration, fundamental
discriminant proof, ideal closure and norms, inverses, generator orders,
generation, and result shape using only coefficients and the emitted
certificate. It verifies every generator translation in the coordinate map;
given the associative class-group law supplied by exact ideal-lattice
multiplication, these checks authenticate that the published coordinates are
a homomorphism and that the published generators span every class. It rejects
modified composition maps and certificates.

The exhaustive authenticated differential campaign is available as the
ignored `pari_broad_differential` test. It covers every 3,043 negative
fundamental discriminant through absolute discriminant 10,000 and a frozen
314-case deterministic/random sample through 9,999,991.

The current map domain is the complete set of canonical reduced-form
representatives. Reduction of an arbitrary caller-supplied ideal into that map
is not implemented. Inputs with nonfundamental discriminant, excessive
discriminant, or more than 20,000 reduced forms fail closed.

The qualification examples cover trivial, cyclic groups through class number
1,715, and noncyclic `C2 x C2`, `C2 x C4`, `C2 x C6`, and
`C2 x C2 x C2` groups. Their PARI comparison lives only in the integration
test and receipts; the runtime has no PARI dependency and does not read
expected answers.

Run a public coefficient-only call, here for `x^2 - x + 10`, with:

```sh
cargo run --release --manifest-path \
  bench/pari-class-group-rust/qualification/public-quadratic-boundary/Cargo.toml \
  --bin sagejs-public-quadratic-boundary-qualification \
  -- 10 -1 1
```

## Real-quadratic boundary evidence

For four real monic quadratics, including PARI class numbers 3 and 5, it:

1. computes the exact polynomial discriminant;
2. finds a finite-field irreducibility witness;
3. completely factors the admitted discriminant and proves it squarefree;
4. uses squarefreeness to prove that the power-basis order is maximal;
5. constructs its exact multiplication table; and
6. passes all data through the root crate's `ValidatedPreparedNumberField`.

The route then stops honestly. The first existing engine entry point is
`prepared_maximal_cubic_factor_base(&ValidatedPreparedCubic)`. There is no
degree-generic or quadratic factor-base entry point, and the following ideal
arithmetic and relation collector are also cubic-shaped. Consequently this
crate does not publish a class number, invariant factors, generators, or a
`complete` public result. Its executable reports
`unsupported-before-class-group-engine` and names the exact type boundary.
The library doctest additionally proves that passing the validated degree-2
value to the existing engine does not compile.

PARI 2.17.4 is used only by `tests/pari_differential.rs`. The checked receipt
contains PARI's exact answers so that nontrivial expected groups are visible,
but neither the library nor executable reads that receipt or invokes PARI.

Run the product-path evidence and all tests with:

```sh
cargo run --release --manifest-path \
  bench/pari-class-group-rust/qualification/public-quadratic-boundary/Cargo.toml \
  --bin sagejs-public-quadratic-boundary-qualification

cargo test --release --all-targets --manifest-path \
  bench/pari-class-group-rust/qualification/public-quadratic-boundary/Cargo.toml

cargo test --release --doc --manifest-path \
  bench/pari-class-group-rust/qualification/public-quadratic-boundary/Cargo.toml
```

The differential test expects the authenticated control binary produced by
`../pari-control/build.py`.

## Native performance qualification

The frozen alternating Rust/PARI 2.17.4 harness records all raw samples,
medians, ratios, toolchain identity, and the deterministic replacement for the
unavailable class-number-4,352 input as documented in
[`benchmark/README.md`](benchmark/README.md). Run it with
`python3 benchmark/run.py` from this crate.
