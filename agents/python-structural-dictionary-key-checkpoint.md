# Structural dictionary-key performance checkpoint

Local Linux x64 qualification on 2026-09-15 for the dictionary-key change
based on `b24189b376e60b8f243e15e1ec4cb98ac3b091a7`. Measurements used Node
26.8.1 and CPython 3.14.4. This is focused local evidence, not four-platform or
release qualification.

## Root cause and design

`FiniteFieldElement.__sagejs_dict_key__` already provides one stable native
identity per parent and residue. Nevertheless, every identity miss scanned all
stored object keys and called Python equality. Building the baby-step table in
`discrete_log` therefore made `n(n-1)/2` equality calls: 512 distinct entries
made 130,816 calls, and 2,048 entries made 2,096,128 calls.

The dictionary now keeps lazy indexes only after it first stores an internal
structural key. Structural keys use native identity and compare only with the
noncanonical keys needed for cross-type equality. Arbitrary object keys retain
the correctness-first equality scan. The mixed index preserves both insertion
orders for equal modular/integer keys, original-key identity, different-parent
inequality, and copy/removal/clear behavior. Ordinary dictionaries allocate no
auxiliary `Set` until a structural key appears.

## Scaling

The workload inserts successive powers of `3` in
`Zmod(2 * 22974332779312916308087541215025543130953873335484909873 + 1)`
and then looks up the final power. Times are warm in-runtime seconds. Baseline
medians use three samples; candidate medians use seven.

| entries | baseline | candidate | speedup |
| ---: | ---: | ---: | ---: |
| 250 | 0.1649 | 0.00812 | 20.3x |
| 500 | 0.6152 | 0.01179 | 52.2x |
| 1,000 | 2.4604 | 0.01822 | 135.1x |
| 2,000 | 9.4793 | 0.03569 | 265.6x |
| 4,000 | not run | 0.08389 | — |
| 8,000 | not run | 0.15871 | — |

The candidate grows approximately linearly through 8,000 entries. The focused
regression additionally patches `FiniteFieldElement.__eq__` and requires zero
equality calls for 2,048 distinct insertions and a fresh-key lookup.

## Practical result and remaining cliff

The unchanged 60-second compiler fixture timeout previously expired in the
book-sized discrete logarithm. The complete `compiler/algebra.py` fixture now
passes in 3.06 seconds. Five direct discrete-log samples were 0.573, 0.369,
0.369, 0.372, and 0.367 seconds (0.369-second median), returning
`764093480249851` each time.

This does not close general Python dictionary or loop overhead. For an
end-to-end loop that inserts 100,000 integer pairs and then sums 100,000
lookups, candidate medians were 0.124/0.784 seconds. The identical pre-change
runtime was 0.118/0.791 seconds, so insertion was 4.9% slower and lookup 0.9%
faster in this noisy local test. CPython medians were 0.00973/0.0115 seconds,
about 12.8x/68.0x faster end to end. Those ratios include loop, integer,
dispatch, and summation costs and must not be interpreted as isolated `dict`
operation ratios.

## Validation

- full self-hosted build converged;
- `test/modular-dictionary-key.cjs`;
- native dictionary fast paths and dictionary reinitialization;
- tuple structural keys and cross-type custom object equality;
- finite-extension canonical enumeration;
- `compiler/algebra.py` under its unchanged timeout;
- strict baselib CPython syntax, Ruff, and Pyright checks;
- package graph under its unchanged bootstrap budgets.

The complete compiler corpus improved from eight known failures to seven:
`algebra.py` now passes, while the documented standalone lazy-module closure
failures remain. The integration tier passed its first 16 longest-scheduled
files, then stopped in `test/ffi.cjs` because this worktree lacks optional
FFLAS and igraph build artifacts. None of those failures touched dictionary
behavior; this checkpoint does not claim a complete integration-tier pass.

`test/algebra.py` also had a stale GF(9) ordering assertion from before the
intentional canonical-coordinate iterator change in `6d8da5e17`. Its expected
value now agrees with that existing implementation and its dedicated
enumeration regression; no assertion was removed or weakened.
