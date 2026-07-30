# `@sagemath/sagejs-flint`

This experimental package binds native
[FLINT 3.5](https://flintlib.org/) exact arithmetic directly to Node through
the stable C Node-API. It is deliberately separate from `@sagemath/sagejs`:
loading the language must not initialize native mathematics libraries.

The API exposes JavaScript `BigInt` round trips, GCD, factorial,
Fibonacci numbers, binomial coefficients, primorials, integer factorization,
word-prime testing, opaque `fmpz_poly`/`fmpq_poly`/`nmod_poly` values, and
opaque `fmpz_mat`/`fmpq_mat`/`nmod_mat` matrices and MPFR/MPC real and
complex values.
Exact matrices support native addition, multiplication, determinant, rank,
rational and prime-field RREF, integer Hermite form, inverse, and linear
solving; integer systems canonically produce rational answers when division
is required.
Characteristic polynomials and canonical saturated integer or rational kernel
bases also execute in FLINT; Sage.js wraps each kernel basis as a genuine
free-submodule or vector-subspace parent.
Composite residue-ring matrices use distinct `Zmod` handles over the same
FLINT `nmod_mat` storage. They expose ring-correct determinant and
characteristic polynomial, Howell form and unit-pivot rank, inversion of
matrix units, and kernels that preserve zero-divisor torsion.
Integer conversion uses Node-API's
little-endian 64-bit word arrays and FLINT's `fmpz_set_ui_array` /
`fmpz_get_ui_array` functions, so crossing the integer boundary requires one
linear copy in each direction and no decimal-string conversion.

Finite extensions use FLINT's `fq_nmod` polynomial-basis backend for
word-sized characteristics and `fq` for larger characteristics. Their Conway
contexts and elements are opaque native objects; context construction rejects
pairs absent from FLINT's Conway database so that Sage.js does not silently
choose a modulus incompatible with Sage. Native reference counting lets every
element retain its context independently of JavaScript finalizer order, so the
context remains alive until its last element is finalized. Sage.js receives
coefficients only when it
explicitly requests the defining polynomial.

Polynomial constants and generators enter the addon once. Addition,
subtraction, multiplication, powers, and `fmpz_poly` to `fmpq_poly`
coercion operate directly on C-owned values. JavaScript receives only an
opaque object with a native finalizer; coefficients are converted back only
when formatting is explicitly requested.

Multivariate `fmpz_mpoly`, `fmpq_mpoly`, and `nmod_mpoly` values follow the
same ownership model. A retained native context records the number of
variables, term order, and modulus. The narrow API provides constants,
generators, arithmetic, powers, exact division, GCD, degrees, term counts,
and generator composition for Sage-compatible conversions between parents;
only pretty-printing crosses polynomial data back into JavaScript.

The `nmod_poly` API additionally provides GCD, irreducibility testing,
factorization, and roots over word-sized prime fields. Factorization returns
opaque native factors and a separate scalar unit. Sage.js wraps these as
ordinary polynomial elements and a Sage-compatible `Factorization`; it never
copies coefficient arrays through JavaScript.

MPFR and MPC values likewise stay behind opaque Node-API objects. Sage.js uses
them to implement Sage-compatible `RealField(p)` and `ComplexField(p)` parents,
with round-to-nearest arithmetic and exact conversion from `BigInt`
numerators and denominators.

The versioned header `include/sagejs/native.h` defines the initial shared
MPFR/MPC element ABI. Separately compiled Sage.js native kernels use its
stable Node-API type tags and ownership helpers, so their results can be
consumed directly by this addon and wrapped as ordinary Sage.js
`RealNumber`/`ComplexNumber` elements. `nativeAbiVersion()` reports the ABI
version implemented by the addon. `mpfrVersion()`, `mpcVersion()`, and
`gmpVersion()` expose the loaded mathematics-library versions for reproducible
benchmarks.

When this package is available to Sage.js, the language-level function loads
it only upon first use and caches it:

```text
sage: factor(2026)
2 * 1013
```

The raw Node API remains available as
`require("@sagemath/sagejs-flint").factor(2026n)`. It returns an object with a
separate sign and canonical ascending prime factors. The Sage.js wrapper turns
that result into an `IntegerFactorization`, retaining the sign as its unit
rather than adding it to the factor list.

## Build

The current prototype supports 64-bit Linux hosts with a C compiler, `make`,
and GMP development files. MPFR 4.2.2, MPC 1.4.1, and FLINT 3.5.0 are
downloaded, verified by SHA-256, and built statically. The prototype
dynamically links the host's GMP ABI; release prebuilds will need to bundle or
otherwise provide a compatible GMP runtime:

```sh
pnpm --dir packages/flint build
pnpm --dir packages/flint test
pnpm --dir packages/flint bench
```

For development, an existing compatible prefix can skip the dependency build:

```sh
SAGEJS_FLINT_PREFIX=/path/to/prefix \
  pnpm --dir packages/flint build:addon
```

This package is private while the API and prebuilt-binary distribution layout
are being established. It is not part of the Sage.js 0.1.0 npm package.
