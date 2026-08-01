# `@sagemath/sagejs-flint`

This experimental package binds native
[FLINT 3.6](https://flintlib.org/) exact arithmetic directly to Node through
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

Dirichlet groups are retained opaque `dirichlet_group_t` contexts. FLINT
provides their finite abelian decomposition, Conrey data, conductors, orders,
parity, primitivity, and character evaluation. The bridge translates Sage's
historical first-component-fastest enumeration at its boundary. Character
values cross back as root-of-unity exponents; Sage.js presents those values
exactly in a cyclotomic basis and constructs `qqbar` roots only when algebraic
operations or approximations require them.

The analytic Dirichlet boundary uses `acb_dirichlet` directly for Gauss and
Jacobi sums, primitive-character root numbers, and arbitrary derivatives of
Dirichlet L-functions. Results cross the boundary once as precision-matched
MPC values. Exact Gauss and Jacobi sums use FLINT `qqbar`, so their algebraic
identity remains available independently of the requested numerical
precision. Generalized Bernoulli numbers combine FLINT's exact Bernoulli
polynomials with the same `qqbar` character values; this also supplies the
exact special-value input needed by Eisenstein series.

Level-one Eisenstein expansions are constructed as one native `fmpq_poly`.
FLINT supplies the exact Bernoulli constant, while a C divisor-sum sieve
computes every coefficient through the requested precision. The complete
polynomial crosses Node-API once instead of constructing coefficients through
repeated scalar calls. Native polynomial inflation implements substitution
`q -> q^d`, which the Sage.js modular-forms layer uses for degeneracy maps and
prime-level Eisenstein bases.

Integral elliptic curves use Andrew Sutherland's
[smalljac 4.1.3](https://math.mit.edu/~drew/smalljac.html) to compute traces
of Frobenius over a whole prime interval. Sage.js translates smalljac's
`1 - a_p*T + p*T^2` convention at the native boundary, then uses the usual
Euler recurrences to construct `anlist`. Bad-reduction primes, and models or
intervals rejected by smalljac, automatically use the earlier direct
point-counting backend, so the optimization does not narrow the supported
Sage semantics. This implementation
is based on Kiran Kedlaya and Andrew Sutherland, “Computing L-series of
hyperelliptic curves,” ANTS VIII (2008), 312–326. The pinned upstream release
is GPL-2.0-or-later and depends on Andrew Sutherland's `ffpoly` 1.2.7.

The `nmod_poly` API additionally provides GCD, irreducibility testing,
factorization, and roots over word-sized prime fields. Factorization returns
opaque native factors and a separate scalar unit. Sage.js wraps these as
ordinary polynomial elements and a Sage-compatible `Factorization`; it never
copies coefficient arrays through JavaScript.

Weight-2 modular-symbol foundations use a separate compact native `P1List`.
The implementation computes the exact cardinality of
`P^1(Z/NZ)` before allocating, fills a contiguous representative array once,
sorts it in Sage-compatible order, and builds a fixed-size open-addressed
index. Normalization and the `I`, `S`, order-three `R`, and translation `T`
actions therefore require no per-call allocation. The associated Manin
two-term and three-term relations are stored in pre-sized compressed-row
arrays over a word-sized prime field. FLINT `nmod_mat` supplies the initial
dense rank backend; relation storage itself is sparse so a scalable sparse
eliminator can replace that backend without changing the public boundary.

This code follows the representative conventions of William Stein's original
Sage Cython `P1List` (GPL-2.0-or-later) and incorporates the exact-allocation
strategy from his later JSage/Zig experiment. See
[`bench/MODULAR-SYMBOLS.md`](../../bench/MODULAR-SYMBOLS.md) for correctness
cross-checks and comparative timings against SageMath and, when installed,
PARI/GP.

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

The current prototype supports x86-64 Linux hosts with a C compiler and
`make`. GMP 6.3.0, MPFR 4.2.2, MPC 1.4.1, FLINT 3.6.0, `ffpoly` 1.2.7, and
smalljac 4.1.3 are downloaded, verified by SHA-256, and built as
position-independent static libraries. The x86-64 restriction comes from the
current `ffpoly` release's assembly implementation; a future portable backend
must be selected on other architectures:

```sh
pnpm --dir packages/flint build
pnpm --dir packages/flint test
pnpm --dir packages/flint bench
```

The dependency build uses up to eight parallel jobs by default. Set
`SAGEJS_BUILD_JOBS` to a positive integer to match the CPU and memory available
on the build host:

```sh
SAGEJS_BUILD_JOBS=16 pnpm --dir packages/flint build
```

For development, an existing compatible prefix can skip the dependency build:

```sh
SAGEJS_FLINT_PREFIX=/path/to/prefix \
  pnpm --dir packages/flint build:addon
```

This package is private while the API and prebuilt-binary distribution layout
are being established. It is not part of the Sage.js 0.1.0 npm package.
