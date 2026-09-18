# Exact primitive integer floor division and modulo

Base: `c6466e8e8` (`origin/main` after PR #309).

## Change

Binary floor division and modulo previously passed primitive exact integers
through Python-level type discovery, repeated safe-integer checks, and separate
number/`BigInt` implementations.  A shared bootstrap boundary now classifies
both operands once and computes Python's floor quotient or divisor-signed
remainder directly.  Safe results remain JavaScript numbers and wide results
remain `BigInt`.

The boundary deliberately declines zero divisors, including the exact-integer
value `False`, floats, unsafe foreign numbers, and objects. Those cases retain
the existing Python/Sage path, error
messages, reflected methods, and custom dispatch.  Augmented `//=` and `%=`
also retain the general in-place protocol; adding a second shortcut there was
not necessary for the measured binary cliff and exceeded the unchanged core
budget.  The helper is private and adds no public runtime capability.

Focused tests cover all four operand-sign combinations, booleans, wide
integers, canonical zero, number and BigInt numerators divided or reduced by
`False`, augmented `//=`/`%=`, exact zero-division exception types and messages,
custom modulo dispatch, and custom in-place floor division.

## Controlled measurements

Ten alternating fresh Node processes executed each exact standalone artifact.
The first three rounds were discarded and the table reports warm medians for
1,000,000 checked operations.  Compilation and startup are outside the timed
regions.  CPython was measured with the same values and iteration count.

| Case | Main | Candidate | CPython | Change | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| `12345 // 37` | 149.709 ms | 33.967 ms | 25.473 ms | 77.31% faster | 1.33x |
| `12345 % 37` | 124.483 ms | 42.399 ms | 22.268 ms | 65.94% faster | 1.90x |

The exact main artifact is
`028b08f732d77cb169c7a333662312f4f644b33db5e44ddce8cf9d0cb7d79572`
(24,349,529 bytes).  The source-current candidate is
`528fdb2f5733eef9ca2a5dc60afa9710e1aca9951cb338f56a23536919c8c026`
(24,349,011 bytes), 518 bytes smaller.

The same alternating process campaign checked neighboring operator rows.  The
candidate changed power by +0.03%, bitwise AND by -0.71%, bitwise OR by +0.08%,
bitwise XOR by +0.74%, left shift by +1.79%, and right shift by +0.20%.  These
are small overlap observations, not claims that the still-open power, bitwise,
or shift cliffs are closed.

## Qualification

- A source-current full build completed all eight stages in 7m 59s.
- All 225 portable test files pass.
- The differential corpus matches its baseline: 505 passes and three reviewed
  intentional incompatibilities across 508 CPython 3.14.4 cases.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors.
- The pinned traitlets and pyparsing package workflows pass.
- Focused shared-bootstrap and Python integration tests pass.
- Documentation generation and merge invariants pass.
- The core-runtime budget is 902,497 / 903,000 bytes, 305 bytes below the
  fresh-main build; no budget changed.

The representative checked workload is
`bench/python-exact-integer-dispatch.py`.  Platform and browser CI remain
merge-owned qualification; no release is implied.
