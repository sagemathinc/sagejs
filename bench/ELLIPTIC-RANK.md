# Elliptic-curve 2-descent

## Scope and provenance

Sage.js compiles the rank/descent source closure from John Cremona's eclib at
commit `8dca7f18acedf7c2283a5d0e689c269f8258c981`. The tracked patch replaces NTL
and PARI operations in that closure with FLINT-backed exact arithmetic and a
direct finite-field point count. No eclib, NTL, or PARI library is linked.

The package test imports all 21 distinct nonsingular curves from upstream
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

The point list is not advertised as a saturated Mordell--Weil basis. The
adapter processes descent and initial-search points but calls eclib with a
saturation bound of zero. A later saturation API can extend this boundary
without weakening what `rank_data()` currently promises.

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
