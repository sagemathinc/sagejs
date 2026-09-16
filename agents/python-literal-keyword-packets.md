# Direct literal keyword packets

Base: `654d150363da1936ecbadc72fee17f49868aadfc` (merged PR #295).

## Change

Calls containing only explicit `name=value` arguments now emit their marked
keyword packet directly. Previously they built an ordinary object, wrapped it
in a one-element source array, and passed both through `ρσ_desugar_kwargs`,
which enumerated and copied every property into a second object. Calls that
contain any `**mapping` retain the general merger and all of its duplicate-key,
string-key, mapping-protocol, and evaluation-order checks.

Static keyword names are quoted object keys. `__proto__` alone uses a computed
key so that it creates an ordinary own data property instead of invoking the
object-literal prototype special case. The binder continues to use own-property
tests; inherited JavaScript names therefore cannot become Python keywords.
The packet is still constructed after target lookup and values remain evaluated
left-to-right.

## Controlled measurements

On idle `bench-1` (Node 26.5.1 and CPython 3.12.3), the merged-#295 and
candidate artifacts were alternated for ten process samples; the first three
samples were discarded. Each isolated row performs 100,000 checked operations,
excluding compilation and startup.

| Case | Main | Candidate | Change | CPython | Candidate / CPython |
| --- | ---: | ---: | ---: | ---: | ---: |
| keyword function | 338.40 ms | 312.80 ms | 7.6% faster | 8.02 ms | 39.0x |
| immediate keyword method | 402.30 ms | 374.71 ms | 6.9% faster | 8.24 ms | 45.5x |
| keyword construction and method | 1117.26 ms | 1087.43 ms | 2.7% faster | 29.59 ms | 36.8x |

The complete seven-case sequence showed a 7.1% keyword-function improvement,
but later rows were perturbed by earlier allocation and JIT activity. Isolating
each affected operation recovered consistent improvements and is the basis for
the claims above. These remain large performance cliffs; this change removes
one redundant merge and does not claim that argument binding or construction is
close to CPython.

The main artifact SHA-256 is
`4d8d67a541b1d176f155d9e0a4b3ad85e8da5fbd5c521221df8ce078ad363cde`.
The final source-current candidate artifact is
`4d14a79d3ec37759c4ec16149e0a4678a78baf3ac5f8f3f4b103f63f3a610ce5`.
It is 298 bytes larger than the checked 24,516,520-byte main benchmark artifact;
the shared runtime is unchanged.

## Qualification

- The source build and 92 focused lowering, binding, construction, and
  Python/Sage runtime checks pass.
- The regression covers the JavaScript-sensitive `__proto__` keyword and
  asserts that explicit-only Python and Sage calls do not emit the general
  merger.
- Strict Python, the portable tier, package workflows, package budgets, and
  generated documentation are requalified on the final source revision before
  handoff.

Browser/platform CI remains merge-owned qualification; no release is implied.
