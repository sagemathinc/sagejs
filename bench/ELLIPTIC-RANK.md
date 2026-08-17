# Elliptic-curve 2-descent

## Scope and provenance

Sage.js compiles the rank/descent source closure from John Cremona's eclib at
commit `8dca7f18acedf7c2283a5d0e689c269f8258c981`. The tracked patch replaces NTL
and PARI operations in that closure with FLINT-backed exact arithmetic and a
direct finite-field point count. No eclib, NTL, or PARI library is linked.

The focused package test imports all 21 distinct nonsingular curves from upstream
eclib's `tests/in_no_ntl/tmrank-short.in`, including ranks 2 through 15. It
checks both rank bounds, validates every returned projective point on the
input Weierstrass model, and records upstream eclib 20250122 results for:

- `[0,1,1,-2,0]`: bounds `(2,2)`, 2-Selmer rank 2, points
  `[0:-1:1]` and `[-1:1:1]`;
- `[0,0,1,-7,6]`: bounds `(3,3)`, 2-Selmer rank 3, points
  `[1:-1:1]`, `[-2:3:1]`, and `[-14:25:8]`;
- `[0,0,0,-1,0]`: bounds `(0,0)`, 2-Selmer rank 2, no nontorsion points;
- the corpus rank-15 curve: bounds `(15,15)`, 2-Selmer rank 16, and 15
  independent found points.

Four simultaneous Node workers alternate rank-2 and rank-3 calls to catch
leaked or shared modular state. The test is deterministic because each call
resets eclib's FLINT random state and restores its thread-local modulus.

The checked-in differential oracle adds the first 1,024 isogeny-class leaders
in conductor order from John Cremona's `ecdata` file
`allcurves/allcurves.00000-09999`. Its provenance records the exact ecdata
revision and file digest, plus the upstream eclib/mwrank version and command.
It records upstream's found projective points as well as rank and 2-Selmer
data. Since an unsaturated full-rank subgroup has no canonical basis, the test
compares point counts and verifies both implementations' points on the curve
rather than requiring identical coordinates.
Run it with:

```sh
pnpm --dir packages/flint test:eclib:corpus
```

Regenerate it only from an independent upstream executable, never from the
FLINT port under test:

```sh
ECLIB_MWRANK=/path/to/upstream/mwrank \
ECDATA_ALLCURVES=/path/to/allcurves.00000-09999 \
pnpm --dir packages/flint generate:eclib:corpus
```

The cheap `found_points()` path requests no saturation and makes no basis
claim. `gens()` requests eclib's automatic saturation and succeeds only when
both the rank and saturation are proven. `rank_data(saturate=True)` preserves
the initial points while reporting the resulting generators, saturation
index, and any unresolved primes.

## Clean cross-platform validation

From a fresh worktree with no `packages/flint/.native` or
`packages/flint/build` directory, run:

```sh
pnpm --dir packages/flint validate:eclib:clean
```

The command disables native dependency bundles and vcpkg's user-level binary
cache, downloads verified source archives into the new worktree, builds the
complete dependency prefix and addon, runs the focused eclib suite, and
inspects the addon's imported libraries for PARI or NTL. It supports Linux
x64/arm64, macOS arm64, and native Windows x64 using the same platform-specific
dependency paths as release builds.

## Benchmark

Run the in-process FLINT port with:

```sh
pnpm bench:elliptic-rank
```

For a comparison with an independently built upstream executable:

```sh
ECLIB_MWRANK=/path/to/mwrank pnpm bench:elliptic-rank
```

Set `ECLIB_LIBRARY_PATH` as well when that executable uses shared libraries
from a nonstandard directory.

The upstream column includes executable startup and formatting; the Sage.js
column measures an already loaded addon. Both use eclib's initial point search
and a saturation bound of zero. The cases deliberately cover ordinary
2-descent, a higher-rank curve, and the rank-15 2-isogeny path. Timings are
reported rather than enforced as a CI budget because hardware and the search
path materially affect them.
