# Exact primitive integer power

Base: `e3ecef868` (qualified exact subtraction/multiplication candidate).

## Change

Nonnegative primitive integer power previously entered rational-instance checks,
Python-level primitive classification, and general special-method dispatch on
every operation. A compact private boundary now classifies both operands once,
returns safe-number results directly, and recomputes overflow with `BigInt`.
Negative exponents deliberately return the missing sentinel so the
language-mode-specific path remains authoritative.

Power has a separate helper rather than extending the addition or
subtraction/multiplication helpers. This preserves their measured V8 shapes:
all six existing arithmetic controls remain within -1.29% to +1.17% in the
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
| `+` | 29.142 ms | 29.221 ms | flat (+0.27%) | 29.542 ms | 0.99x |
| `-` | 29.138 ms | 28.762 ms | flat (-1.29%) | 29.510 ms | 0.97x |
| `*` | 45.584 ms | 46.116 ms | flat (+1.17%) | 30.236 ms | 1.53x |
| `**` | 4,485.977 ms | 46.894 ms | 98.95% faster | 19.160 ms | 2.45x |
| `+=` | 48.361 ms | 47.844 ms | flat (-1.07%) | 34.584 ms | 1.38x |
| `-=` | 27.186 ms | 27.315 ms | flat (+0.47%) | 34.902 ms | 0.78x |
| `*=` | 44.767 ms | 44.624 ms | flat (-0.32%) | 35.245 ms | 1.27x |
| `**=` | 4,433.682 ms | 44.597 ms | 98.99% faster | 58.770 ms | 0.76x |

The identical-source standalone grows from 24,425,929 to 24,426,954 bytes
(+1,025 bytes, 0.0042%). Its previous and candidate SHA-256 digests are
respectively
`f5f45ca39547eaea711f453998ff00b296909b63f9b56aa7aca262af156b2293` and
`531abaa9e01772b81f4be72e51965dcc9fd5ebbd264ca2f258b9a9169710496a`.
The checked source is `bench/python-exact-arithmetic.py`, SHA-256
`793ff9396d5cde469085e2a8b46d38ed1d167835d3abc772b395a815dca20159`.
The retained raw receipt is
`bench-1:/home/user/python-exact-power-mainline.cF3vwl`.

This closes the demonstrated primitive power cliff. The remaining 2.45x
ordinary-power ratio is below the plan's default-cliff threshold, but it is
still reported rather than described as CPython parity.

## Qualification

- The final frozen source completed a full eight-stage build in approximately
  7m 50s.
- Seventy-two focused bootstrap, lowering, Python/Sage execution, overflow,
  float, negative-power, and object-dispatch checks pass.
- All 225 portable files pass. The differential corpus matches its baseline:
  505 passes and three reviewed intentional incompatibilities across 508 cases.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors.
- Pinned traitlets and pyparsing workflows, generated documentation, and merge
  invariants pass.
- Core runtime is 902,946 / 903,000 bytes; no budget changed.

Platform/browser qualification remains CI-owned. PR #314 is the prerequisite;
this follow-up must not be opened as independently merge-ready until #314 is
integrated into `origin/main`. No release is implied.
