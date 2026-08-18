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
Large machine-word finite-field and suitable integer matrix products dispatch
through FLINT to a statically linked OpenBLAS. Unix release builds contain a
small runtime-dispatched set of x86-64 or arm64 kernels; native Windows uses a
portable MSVC-compatible x86-64 kernel. `blasEnabled()` reports whether that
acceleration survived configuration and linking, and the native test suite
requires it on every supported platform.
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

Imaginary quadratic class groups use FLINT's `qfb` modular-root sieve,
NUCOMP/NUDUPL arithmetic, and binary powering. Reduced forms cross into
JavaScript only when the caller needs to enumerate a noncyclic group or asks
for its complete element list. For a cyclic group, the native boundary returns
the class number and one generator after verifying its exact order against
every prime divisor of the group order. The earlier readable rank-two ideal
lattice composition and elementary reduced-form enumeration remain in the
Sage.js mathematical layer as ordinary CPython-parseable reference fallbacks.
See [`bench/QUADRATIC-CLASS-GROUPS.md`](../../bench/QUADRATIC-CLASS-GROUPS.md)
for proof semantics and timings against PARI and Magma.

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

On every supported native platform, integral elliptic curves use Andrew
Sutherland's [smalljac 4.1.3](https://math.mit.edu/~drew/smalljac.html) to
compute traces of Frobenius over a whole prime interval. Sage.js translates smalljac's
`1 - a_p*T + p*T^2` convention at the native boundary, then uses the usual
Euler recurrences to construct `anlist`. Bad-reduction primes, and models or
intervals rejected by smalljac, automatically use the earlier direct
point-counting backend, so the optimization does not narrow the supported
Sage semantics. This implementation
is based on Kiran Kedlaya and Andrew Sutherland, “Computing L-series of
hyperelliptic curves,” ANTS VIII (2008), 312–326. The pinned upstream release
is GPL-2.0-or-later and depends on Andrew Sutherland's `ffpoly` 1.2.7.

The same dependency now has a packed, in-process genus-2 boundary for the
hyperelliptic layer. `smalljacLpolyBatch(curveText, start, stop, options)`
accepts a private checked integral smalljac model string, traverses the closed
prime interval once, and returns aligned typed arrays. `primes`, `good`,
`coefficientCounts`, and `rowStatus` have one entry per emitted callback;
`coefficients` stores row-major `(c1,c2)` for `det(1-T*Frob)`. Bad-reduction
rows remain present with count zero. A finite `options.maxRows` limits stored
rows while `requiredRows` reports the complete callback count and `truncated`
records the loss. The accepted upstream grammar used by this adapter is an
integral quintic or sextic `f(x)`, or the integral pair `[f(x),h(x)]` defining
`y^2+h(x)y=f(x)`. The public mathematical layer, not this private adapter,
owns model transformations and excluded denominator primes.

`smalljacGroupBatch` uses the same row alignment and returns invariant factors
as packed `BigUint64Array` storage with `invariantOffsets`. Upstream supports
this only for odd-degree genus-2 models over `QQ`; even-degree calls return the
explicit `UNSUPPORTED_CURVE` status. `smalljacCapabilities()` publishes the
backend version, normalization, exact numeric status table, supported genera,
and fixed-width prime limits. Full genus-2 coefficients are admitted only
through `p < 2^32`: the Weil bounds give `|c1| <= 4*sqrt(p)` and
`|c2| <= 6*p`, safely inside `int64`. Group invariants use the stricter
`p < 2^30` capability, where the genus-2 Jacobian order bound is below signed
64-bit upstream arithmetic; positivity, invariant-factor divisibility, and
product overflow are checked before conversion. These are capability limits,
not promises to coerce an unsupported result.

All elliptic and hyperelliptic calls share one native mutex because ffpoly's
finite-field context is process-global. Callback allocation/range failures
cancel the upstream traversal, clean up the curve, release the mutex, and
return a distinct batch status; mathematical parse, singularity, model, and
interval failures retain their own statuses.

Genus-2 and genus-3 hyperelliptic curves also have a private packed
Hasse--Witt batch boundary backed by Edgar Costa and Andrew Sutherland's
[`rforest`](https://github.com/edgarcosta/rforest), pinned at commit
`3103d396c67cb1685131b1f11e84975cca335bdf`.  The upstream library and its
bundled `zz` arithmetic layer are respectively MIT-licensed and BSD-licensed;
both checked license files are installed with the dependency.  The build uses
the exact 20-translation-unit closure of the pinned upstream makefile.  The
Windows build uses clang-cl, fixed-width carry arithmetic, and the same GMP
64-bit limb requirement as Unix; rforest's private `long` ABI never crosses
the Sage.js boundary.

`rforestHasseWittBatch(coefficients, genus, start, stop, options)` accepts a
`BigInt64Array` containing the ascending integral coefficients of the already
completed model `y^2 = F(x)`.  Genus must be 2 or 3, and `F` must have exact
degree `2*g+1` or `2*g+2`.  The closed prime interval starts at 2 and is capped
at `2^31-1`; `options.maxRows` may cap storage while retaining the full
`requiredRows` count.  Results are row-aligned typed arrays: `primes`, `good`,
`coefficientCounts`, `rowStatus`, and a stride-three `coefficients` array.  A
good row contains the coefficients `(c1,...,cg)` modulo `p` of
`det(I-T*W)`, where `W` is the Hasse--Witt matrix; unused stride entries are
zero.  These residues are not local L-polynomials.  The mathematical layer
owns model completion and uses the residues only as congruence input for exact
coefficient lifting.

The matrix-factorial forest handles ordinary rows in one batch.  Primes where
the chosen translations or transition normalizers degenerate use a direct
FLINT polynomial-power fallback through `p <= 100000`; larger exceptional
primes receive an explicit `RESOURCE_LIMIT` row rather than a guessed value.
Characteristic two and bad reduction likewise retain aligned rows with
explicit statuses.  `rforestCapabilities()` publishes the normalization,
limits, backend revision, and complete status table.  The rforest and
smalljac entry points share the same process-global native mutex.

Prime-field elliptic-curve scalar multiplication uses a portable native
Jacobian ladder over arbitrary-size FLINT integers. General Weierstrass models
are moved exactly to short form in characteristic greater than three, the
whole ladder stays projective, and a single modular inversion recovers the
affine result. Characteristics two and three and extension fields retain the
tested mathematical-library fallback. This boundary avoids hundreds of
Node-API crossings in cryptographic-size scalar multiplications and is built
on every supported native platform.

Rational points use a second single-boundary ladder with canonical FLINT
`fmpq` coordinates and the low-growth field addition formulas. Reduced native
coordinates are wrapped without repeating their potentially huge GCD. The
ordinary Python implementation remains the readable correctness fallback and
the differential-test oracle.

Elliptic curves over `QQ` also expose 2-descent rank bounds, the 2-Selmer rank,
and independent rational points found during descent and the initial search.
This code is the rank/descent source closure from John Cremona's
[eclib](https://github.com/JohnCremona/eclib), pinned at commit
`8dca7f18acedf7c2283a5d0e689c269f8258c981` and carried under
GPL-2.0-or-later. The dependency build verifies the upstream archive and
applies `patches/eclib-flint-rank.patch`. That patch replaces eclib's NTL
integer, modular-polynomial, and linear-algebra layer with FLINT, replaces its
PARI point-count call with direct finite-field counting, and makes modular
contexts and caches thread-local. Only the required eclib sources are compiled
into this addon; no eclib, NTL, or PARI library is linked.

The public `rank_data()` result distinguishes lower and upper bounds and marks
whether they coincide. `rank()` refuses to present an unresolved interval as
an exact rank. `found_points()` (and `gens(proof=False)`) returns the
independent points found by descent and search without claiming that their
subgroup is saturated. `gens()` and `saturated_gens()` request eclib's
automatic saturation, require coincident rank bounds, and return a proven
Mordell--Weil basis modulo torsion; failure to prove either fact raises an
`ArithmeticError`. `rank_data(saturate=True)` exposes the saturation index and
any unresolved primes explicitly. Exact descent and local solubility
arithmetic uses FLINT; eclib's `NO_MPFP` machine-floating path is used only for
height/search heuristics. Calls reset their deterministic random state and
restore their thread-local modulus before returning. See
[`bench/ELLIPTIC-RANK.md`](../../bench/ELLIPTIC-RANK.md) for oracle coverage,
limitations, and representative timings.

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

The versioned header `include/sagejs/native.h` defines the shared MPFR/MPC
element ABI and, in version 2, the dense matrix layout used by generated
prime-field kernels. Separately compiled Sage.js kernels use its stable
Node-API type tags and ownership helpers, so their results can be consumed
directly by this addon and wrapped as ordinary Sage.js elements without a
JavaScript copy. `nativeAbiVersion()` reports the ABI version implemented by
the addon. `mpfrVersion()`, `mpcVersion()`, and `gmpVersion()` expose the
loaded mathematics-library versions for reproducible benchmarks.

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

The native package is validated on x86-64 and arm64 Linux, Apple Silicon
macOS, and x86-64 Windows. Linux and macOS download SHA-256-verified GMP 6.3.0,
MPFR 4.2.2, MPC 1.4.1, OpenBLAS 0.3.33, and FLINT 3.6.0 and build
position-independent static libraries. The same build also downloads the
SHA-256-verified pinned eclib source archive and applies the FLINT-only rank
patch on every platform. The dependency build also builds `ffpoly` 1.2.7 and
smalljac 4.1.3. GNU x86-64 retains ffpoly's optimized assembly word
operations; Linux arm64 and macOS use exact `__uint128_t` operations, and
native Windows uses clang-cl carry/multiply intrinsics plus an exact
two-limb division implementation.
Windows uses a pinned vcpkg baseline to build static GMP 6.3.0, MPFR 4.2.2,
MPC 1.3.1, OpenBLAS 0.3.33, FLINT 3.6.0, and pthreads4w with the dynamic MSVC
runtime. The Node addon uses clang-cl because its machine-word kernels rely on
portable 128-bit integer operations. Windows does not require WSL, MSYS2, or
MinGW.

The pinned vcpkg GMP port needs autoconf 2.71 while compiling for MSVC. MSYS2
garbage-collects superseded package revisions, so Sage.js carries a provenance-
preserving GMP overlay whose only material change is to download the exact
SHA-512-verified autoconf archive from the immutable `native-sources-1` release.
This keeps a fresh Windows build reproducible even after the rolling MSYS2
mirrors discard that revision.

The upstream sources assume the LP64 ABI. During a native Windows build,
Sage.js prepares a fixed-width `uint64_t`/`int64_t` source tree and routes
GMP's C-`long` `_ui` and `_si` interfaces through exact 64-bit adapters. This
avoids silently truncating primes at the 32-bit LLP64 boundary. The Windows
library is the complete `smalljac_Lpolys` genus-one and genus-two link closure,
including the supported odd-degree group-structure path. It omits `STgroups.c`
and `smalljac_moments.c`, which implement a separate public
Sato--Tate statistics API and are unreachable from that entry point.

The portable word layer is differentially checked against an independent
exact oracle. Portable and optimized smalljac trace streams are also compared
over prime intervals that cross the point-count/finite-field algorithm
boundary. Set `SAGEJS_FORCE_PORTABLE_SMALLJAC=1` on a GNU x86-64 build to test
the portable implementation in place of upstream assembly:

```sh
pnpm --dir packages/flint build
pnpm --dir packages/flint test
pnpm --dir packages/flint bench
```

`pnpm --dir packages/flint build` is the supported composite package build.
From a fresh installed checkout it first builds the Sage.js compiler frontend
needed by native FFI generation, then builds the native dependencies, the
direct Node addon, and finally the generated FFI adapter. The last two stages
must stay in that order: `node-gyp rebuild` replaces `packages/flint/build`, so
running it after `build:ffi` would delete the generated adapter. The repository
bootstrap uses the same composite after establishing the compiler once for all
native packages, and publishes production kernels only after every generated
adapter exists.

The portable boundary is intentional: an arm64 ffpoly/smalljac port can be
developed, benchmarked against the fallback, and proposed upstream without
changing the public elliptic-curve API or blocking core Apple Silicon support.

The dependency build uses up to eight parallel jobs by default. Set
`SAGEJS_BUILD_JOBS` to a positive integer to match the CPU and memory available
on the build host:

```sh
SAGEJS_BUILD_JOBS=16 pnpm --dir packages/flint build
```

OpenBLAS is threaded independently of the dependency build. Its usual
`OPENBLAS_NUM_THREADS` environment variable controls the maximum number of
threads used by a running Sage.js process; setting it to `1` is useful for
worker-thread workloads that already parallelize across many independent
matrix products.

For development, an existing compatible prefix can skip the dependency build:

```sh
pnpm run build
SAGEJS_FLINT_PREFIX=/path/to/prefix \
  pnpm --dir packages/flint build:addon
SAGEJS_FLINT_PREFIX=/path/to/prefix \
  pnpm --dir packages/flint build:ffi
```

Those are low-level stages for an already initialized compiler. Use the
composite `pnpm --dir packages/flint build` for ordinary source builds.

This package is private while the API and prebuilt-binary distribution layout
are being established. It is not part of the Sage.js 0.2.0 npm package.
