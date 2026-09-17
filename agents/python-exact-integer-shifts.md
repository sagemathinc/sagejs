# Exact primitive integer shifts

Base: `c6466e8e8` (`origin/main` after PR #309).

## Change

Exact integer shifts previously rediscovered both JavaScript primitive types
through Python-level helpers before reaching separate safe-number and `BigInt`
implementations. A shared bootstrap boundary now classifies booleans, safe
integer numbers, and `BigInt` values once. Small results remain numbers, wide
results retain exact `BigInt` storage, and right shifts with counts beyond the
safe-number width return the correct sign extension directly.

The boundary declines negative counts, floats, unsafe foreign numbers, and
objects. Those cases retain the existing `ValueError`, special-method,
reflected-method, and Python/Sage dispatch. Augmented `<<=` and `>>=` retain the
general in-place protocol, including saved/custom methods. Huge counts retain
native exact behavior: right shifts sign-extend and shifting zero left remains
zero without allocating an enormous integer. The helper is private and does
not expand the public runtime surface.

Focused tests cover positive and negative operands, booleans, wide integers,
huge counts, negative-count messages, floats, reflected methods, and custom
in-place methods.

## Controlled measurements

Ten alternating fresh processes executed each exact standalone artifact. The
first three rounds were discarded and the table reports warm medians for
1,000,000 checked operations. Compilation and startup are outside the timed
regions. CPython used identical values and iteration counts.

| Case | Main | Candidate | CPython | Change | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| `12345 << 3` | 295.952 ms | 57.707 ms | 31.134 ms | 80.50% faster | 1.85x |
| `12345 >> 3` | 72.031 ms | 53.248 ms | 31.486 ms | 26.08% faster | 1.69x |

The exact main artifact is
`028b08f732d77cb169c7a333662312f4f644b33db5e44ddce8cf9d0cb7d79572`
(24,349,529 bytes). The source-current candidate is
`4f69d25872bbda66750ecdfbddcf179949e5903e03e935fbaa72ecf56823ed39`
(24,349,544 bytes), an increase of 15 bytes (0.00006%).

The same alternating campaign measured neighboring rows. Floor division moved
-4.42%, modulo +0.01%, power -0.79%, bitwise AND +1.98%, bitwise OR +1.88%,
and bitwise XOR +0.31%. These are overlap observations, not claims that any of
the still-open main-branch cliffs are closed.

## Qualification

- A source-current full build completed all eight stages in 7m 49s.
- All 225 portable test files pass.
- The differential corpus matches its baseline: 505 passes and three reviewed
  intentional incompatibilities across 508 CPython 3.14.4 cases.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors.
- Focused bootstrap and Python integration tests cover the semantic boundary.
- The pinned traitlets and pyparsing package workflows pass.
- Documentation generation/checking and merge invariants pass.
- The core-runtime source budget is 902,918 / 903,000 bytes; no budget changed.

The broader polynomial structural fixture could not start because this
worktree lacks the optional `packages/flint` native addon; that is recorded as
a missing host capability rather than a pass. Native and four-platform CI own
that qualification. The checked workload is
`bench/python-exact-integer-shifts.py`; its wide and small signed cases run
successfully under both CPython and Sage.js. No release is implied.
