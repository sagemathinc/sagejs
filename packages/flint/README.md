# `@sagemath/sagejs-flint`

This experimental package binds native
[FLINT 3.5](https://flintlib.org/) exact arithmetic directly to Node through
the stable C Node-API. It is deliberately separate from `@sagemath/sagejs`:
loading the language must not initialize native mathematics libraries.

The first API exposes JavaScript `BigInt` round trips, GCD, factorial,
Fibonacci numbers, binomial coefficients, primorials, and integer
factorization. Conversion uses Node-API's little-endian 64-bit word arrays and
FLINT's `fmpz_set_ui_array` / `fmpz_get_ui_array` functions, so crossing the
boundary requires one linear copy in each direction and no decimal-string
conversion.

When this package is available to Sage.js, the language-level function loads
it only upon first use and caches it:

```text
sage: factor(2026)
[[2, 1], [1013, 1]]
```

The raw Node API remains available as
`require("@sagemath/sagejs-flint").factor(2026n)`. It returns an object with a
separate sign and canonical ascending prime factors; the Sage.js wrapper turns
a negative sign into the pair `[-1, 1]`.

## Build

The current prototype supports 64-bit Linux hosts with a C compiler, `make`,
and GMP development files. MPFR 4.2.2 and FLINT 3.5.0 are downloaded,
verified by SHA-256, and built statically. The prototype dynamically links the
host's GMP ABI; release prebuilds will need to bundle or otherwise provide a
compatible GMP runtime:

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
