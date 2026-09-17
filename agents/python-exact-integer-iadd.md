# Exact primitive integer in-place addition

Base: `ed035d2e3e46b17dba1577e89f41b8bb32cd4abc` (PR #309 candidate).

## Change and semantic boundary

Exact integer `+=` previously repeated JavaScript type queries and Python
boolean conditions before calling the exact addition path.  It now reuses PR
#309's shared primitive classifier first.  Booleans, safe-number integers, and
bigints therefore produce the exact immutable integer result directly,
promoting before precision loss.

The shortcut is deliberately narrower than generic in-place addition.  Objects
still enter `_builtins_inplace`, so `__iadd__` retains precedence and
`NotImplemented`/missing `__iadd__` still falls back to `__add__`.  Floats and
strings retain their existing primitive route.  A focused Python integration
test covers both object paths, strings, floats, boolean overflow, bigint
promotion, and resulting Python types.

## Controlled measurements

The idle `bench-1` host ran Node 26.5.1 and CPython 3.12.3.  Ten alternating
fresh processes compared the exact PR #309 artifact with this candidate; the
first three rounds were discarded.  Times are warm medians in milliseconds for
100,000 checked operations.

| Case | PR #309 | Candidate | CPython | Change | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 19.431 | 17.584 | 9.236 | 9.5% faster | 1.90x |
| keyword function | 135.663 | 130.019 | 9.998 | 4.2% faster | 13.00x |
| immediate keyword method | 194.837 | 189.152 | 10.360 | 2.9% faster | 18.26x |
| empty construction | 16.529 | 15.986 | 7.561 | control, 3.3% lower | 2.11x |
| no-op initializer | 37.743 | 38.600 | 11.856 | control, 2.3% higher | 3.26x |
| positional construction and method | 245.808 | 242.097 | 23.606 | 1.5% faster | 10.26x |
| keyword construction and method | 490.911 | 489.436 | 36.955 | 0.3% lower | 13.24x |

The source-current candidate artifact is
`ed4599fbf059550ef68ce36a52498b52531cc1ddd4428104269c350df743cd56`
(24,387,455 bytes), 97 bytes larger than PR #309.  The raw paired receipt is
`e3ed36a4726a68275956c7481928c0c887b65044e05f2f7b8f514a998bbfd834`.
The unrelated construction-only movements are not claimed as improvements.
Keyword calls and initialized construction remain open cliffs.

## Rejected classifier-inline probe

A five-million-iteration CPU profile still attributed samples to the helper's
local primitive predicate.  An exact generated-artifact probe duplicated those
checks inline, then ran ten alternating processes against the source-current
candidate with the same three-round discard.  Positional calls regressed 3.3%
(16.025 to 16.549 ms); all other movements were between -0.9% and +2.8%.
The rewrite is therefore rejected rather than spending scarce source budget on
an allocation-free shape that V8 already optimizes effectively.  The paired
receipt is
`cf64cf3fd11ee610ad3e7dd4da48526c3c4b239bf7efe0a92c03594b6f44c1b9`.

## Qualification

- A source-current eight-stage build passed in 7m 59s.
- All 225 portable test files pass.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for 404 modules.
- All six pinned traitlets workflow checks pass.
- Focused in-place dispatch, shared-bootstrap, boolean arithmetic, and operator
  checks pass.
- Core runtime remains within the unchanged budget at 902,918 / 903,000 bytes.

This branch is intentionally held behind PR #309.  It must be rebased onto
fresh main after that prerequisite integrates before a non-draft PR is opened.
No release is implied.
