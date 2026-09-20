# Exact primitive integer addition

Base: `ab77b0a0503946f960154f01bdff40c3fa897de5` (`origin/main` after PR #307).

## Change

The common exact-addition boundary used to rediscover JavaScript primitive
types through Python-level helpers and repeated fallback branches.  The shared
bootstrap now classifies booleans, safe-number integers, and bigints once.  It
returns a safe number when the result remains safe and promotes to `BigInt`
before precision can be lost.  Floats, unsafe foreign numbers, and objects use
the existing Python/Sage dispatch unchanged.

`builtins.py` invokes this small boundary with native `Reflect.apply`, avoiding
the generic callable resolver while keeping JavaScript confined to the shared
bootstrap boundary.  The superseded promotion branches in the slow path were
unreachable after this classification and are removed.  The helper is private:
it does not expand the public `sagejs.runtime` capability surface.

Focused tests cover booleans, mixed bigint addition, safe-number overflow,
canonical positive zero, floats, unsafe foreign numbers, and object fallback.
The existing Python integration regression continues to check values and
`int` identity through chained addition and `sum`.

## Controlled measurements

The idle `bench-1` host ran Node 26.5.1 and CPython 3.12.3.  Ten alternating
fresh processes executed each exact artifact; the first three rounds were
discarded and the table reports warm medians for 100,000 operations.  Every
process checked its result.  Compilation and startup are outside the regions.

| Case | Main | Candidate | CPython | Change | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| positional function | 82.046 ms | 21.583 ms | 9.632 ms | 73.7% faster | 2.24x |
| keyword function | 203.074 ms | 135.716 ms | 9.884 ms | 33.2% faster | 13.73x |
| immediate keyword method | 260.803 ms | 195.346 ms | 10.366 ms | 25.1% faster | 18.85x |
| empty construction | 17.869 ms | 16.857 ms | 7.892 ms | 5.7% faster | 2.14x |
| no-op initializer | 40.191 ms | 39.449 ms | 11.780 ms | 1.8% faster | 3.35x |
| positional construction and method | 305.410 ms | 257.916 ms | 22.781 ms | 15.6% faster | 11.32x |
| keyword construction and method | 550.504 ms | 510.310 ms | 37.336 ms | 7.3% faster | 13.67x |

The main artifact is
`968263eecddf3240d0d042284e3467cb4afaf2d54547dd624f7a01930a16d8e7`
(24,386,965 bytes).  The source-current candidate is
`99daf1fb6833c070b319d562b5622deac87c061fb0542c3ac55eb8e04a055899`
(24,387,358 bytes).  The raw paired receipt is
`63c83b7b2ef7806419fbac5366628237a353b50b860f7bc1408a5c0a410e24e5`.
The 393-byte standalone growth is 0.0016%; repository browser and source
budgets remain unchanged.

An additional alternating cold-process pair on the same host used one checked
operation per case to isolate load cost.  After three warmup pairs, the main
median was 1197.853 ms and the candidate median was 1211.961 ms, a 1.18%
difference.  Its raw receipt is
`9fcfd044cd9c8962dc90375e8551377e57527e80ad2b67f22109debed3412589`.
The shared development host's normalized startup gate was above its unchanged
400 ms threshold for two candidate-only runs (405.8 and 420.2 ms), so those are
recorded as non-qualifying host samples rather than passes.  Exact paired
artifacts show no material startup change; clean CI retains authority for the
hard startup gate.

These results remove a general arithmetic tax visible in every measured
call/constructor loop.  They do not close keyword binding or initialized
construction: those paths remain roughly 11–19x CPython in this workload.

## Qualification

- A source-current full build completed all eight stages in 7m 58s.
- All 225 portable test files pass.
- The differential corpus matches its baseline: 505 passes and three reviewed
  intentional incompatibilities across 508 CPython 3.14.4 cases.
- Strict CPython syntax, Ruff 0.16.0, and Pyright pass for all 404 strict
  modules with zero errors.
- All six pinned traitlets checks pass, including its import and
  notification/failure workflow.
- Focused shared-bootstrap, boolean arithmetic, and operator checks pass.
- The core-runtime budget is 902,922 / 903,000 bytes; no budget changed.
- The aggregate changed-file runner rebuilt successfully and its 17 portable
  compiler fixtures passed.  Fifteen native algebra fixtures could not start
  because this worktree lacks the optional `packages/flint` native addon; this
  is recorded as missing host capability rather than a pass.  Native CI owns
  that qualification.

The checked workload is `bench/python-call-construction.py`.  Platform and
browser CI remain merge-owned qualification; no release is implied.
