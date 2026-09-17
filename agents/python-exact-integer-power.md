# Exact primitive integer power

Base: `cec3ac910` (queued exact addition/subtraction/multiplication stack).

## Change

Nonnegative primitive integer power previously entered rational-instance checks,
Python-level primitive classification, and general special-method dispatch on
every operation. The shared exact-integer boundary now accepts power as a fourth
operation. It returns safe number results directly and recomputes overflow with
`BigInt`; negative exponents deliberately return the missing sentinel so the
language-mode-specific path remains authoritative.

Python source power checks the boundary before its negative-exponent logic.
Sage source retains exact rational results for negative integer powers. Exact
augmented power now has a distinct Python fallback: `x = 2; x **= -1` produces
the CPython-compatible float `0.5`, while Sage mode still produces rational
`1/2`. Objects continue through `__ipow__`, then `__pow__`; integral-valued
floats and other nonprimitive operands never enter the shortcut.

## Controlled measurements

Node 26.8.1 and CPython 3.14.4 ran ten alternating fresh processes per exact
artifact. Each process checked its result. The first three sorted samples were
discarded. For one million `3 ** 7` operations, the previous artifact takes
4,562.224 ms, the candidate 59.791 ms, and CPython 15.405 ms. This is a 98.69%
reduction and a remaining 3.88x CPython ratio, below the plan's default-cliff
threshold. The identical-source artifacts grow only 346 bytes:

- previous: 24,348,346 bytes,
  `9f40574c659e0fc8c6fd7e5d3bcd21022921d672daff2adaa05fac8c4e3bca03`;
- candidate: 24,348,692 bytes,
  `0e2c96edbc5057204d737639dcfcfde83d10f5abd8bed52d423a857e73e592a6`.

A separate source-current checked row measures one million positive `**=`
operations at 51.549 ms versus CPython's 52.103 ms (0.99x). A direct alternating
overlap comparison keeps the already-optimized add/subtract/multiply paths
within -3.6% to +1.5%; no regression is claimed. The checked workload is
`bench/python-exact-arithmetic.py`.

## Qualification

- The final frozen source completed a full eight-stage build in 7m 51s.
- Focused bootstrap, lowering, Python/Sage execution, overflow, float,
  negative-power, and object-dispatch checks pass.
- All 225 portable files pass. The differential corpus matches its baseline:
  505 passes and three reviewed intentional incompatibilities across 508
  CPython 3.14.4 cases.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors. Generated documentation and merge invariants are
  current.
- Core runtime is 902,766 / 903,000 bytes; no budget changed.

Platform/browser qualification remains CI-owned, and missing optional native
addons are not counted as passes. No release is implied.
