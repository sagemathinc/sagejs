# Exact primitive integer power

Base: `d317a30b7` (`origin/main` after exact binary and shift integration).

## Change

Nonnegative primitive integer power previously entered rational-instance checks,
Python-level primitive classification, and general special-method dispatch on
every operation. A compact private boundary now classifies both operands once,
returns safe-number results directly, and recomputes overflow with `BigInt`.
Negative exponents deliberately return the missing sentinel so the
language-mode-specific path remains authoritative.

Power has a separate helper rather than extending the addition or
subtraction/multiplication helpers. This preserves their measured V8 shapes:
all six existing arithmetic controls remain within -1.74% to +0.23% in the
source-current comparison.

Python source power checks the boundary before its negative-exponent logic.
Sage source retains exact rational results for negative integer powers. Exact
augmented power has a distinct Python fallback: `x = 2; x **= -1` produces the
CPython-compatible float `0.5`, while Sage mode still produces rational `1/2`.
Objects continue through `__ipow__`, then `__pow__`; integral-valued floats
and other nonprimitive operands never enter the shortcut.

## Controlled measurements

An idle `bench-1` host ran Node 26.5.1 and CPython 3.12.3 in ten alternating
fresh processes per exact artifact. Each process checked every result. Rounds
zero through two were predetermined warm-up exclusions; the table reports
medians of rounds three through nine for one million bounded operations.
Compilation and startup are outside the measured regions.

| Case | Previous | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| `+` | 30.110 ms | 29.625 ms | flat (-1.61%) | 32.451 ms | 0.91x |
| `-` | 29.772 ms | 29.396 ms | flat (-1.26%) | 32.383 ms | 0.91x |
| `*` | 46.152 ms | 46.258 ms | flat (+0.23%) | 32.891 ms | 1.41x |
| `**` | 4,549.589 ms | 47.164 ms | 98.96% faster | 20.300 ms | 2.32x |
| `+=` | 48.429 ms | 47.587 ms | flat (-1.74%) | 36.885 ms | 1.29x |
| `-=` | 27.890 ms | 27.594 ms | flat (-1.06%) | 36.627 ms | 0.75x |
| `*=` | 44.615 ms | 44.590 ms | flat (-0.06%) | 36.974 ms | 1.21x |
| `**=` | 4,495.682 ms | 45.131 ms | 99.00% faster | 61.113 ms | 0.74x |

The identical-source standalone grows from 24,425,944 to 24,426,969 bytes
(+1,025 bytes, 0.0042%). Its previous and candidate SHA-256 digests are
respectively
`53bba00b0e01a83513d1d5366f40a5553655ee3a8333c3a69505f10e38c6376e` and
`498e4e994b96911cb7962e43886c9c15c221700e6a90cd006d9f26186e643a8c`.
The checked source is `bench/python-exact-arithmetic.py`, SHA-256
`793ff9396d5cde469085e2a8b46d38ed1d167835d3abc772b395a815dca20159`.
The retained raw receipt is
`bench-1:/home/user/python-exact-power-current-main.mdB4rf`.

This closes the demonstrated primitive power cliff. The remaining 2.32x
ordinary-power ratio is below the plan's default-cliff threshold, but it is
still reported rather than described as CPython parity.

## Qualification

- The current-main candidate completed a full eight-stage build in 7m 39s;
  the detached exact-main baseline completed independently in 7m 42s.
- Seventy-two focused bootstrap, lowering, Python/Sage execution, overflow,
  float, negative-power, and object-dispatch checks pass.
- All 225 portable files pass. The differential corpus matches its baseline:
  505 passes and three reviewed intentional incompatibilities across 508 cases.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors.
- Pinned traitlets and pyparsing workflows, generated documentation, and merge
  invariants pass.
- Core runtime is 902,984 / 903,000 bytes; no budget changed.

Platform/browser qualification remains CI-owned. PR #314 and the exact-shift
lane are integrated into `origin/main`; this branch is replayed and measured
against that exact main. No release is implied.
