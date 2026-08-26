# Combined higher-genus quality freeze

Date: 2026-08-26

The combined mathematical/runtime source is frozen at `d255b35f`. This record
is a documentation-only descendant of that source. At freeze time,
`origin/main` was an ancestor with no unseen upstream commits; the candidate
contained 27 additional higher-genus commits.

This is a local Linux x64 quality freeze. It complements, but does not replace,
the exact four-platform performance freeze at `a9d83f82` and its normalized
receipt set.

## Quality evidence

- `pnpm build`: all seven stages passed in 5m18s; five native adapters were
  current and all 34 production kernel families were published in one
  25.18 MiB pack.
- `pnpm test:integration`: 315/315 files passed in 34m58s.
- `pnpm test:unit`: 76/76 files passed in 1m41s.
- `pnpm test:portable`: 65/65 files passed in 1m19s.
- `pnpm architecture:check`: passed, including 1,134 classified native
  boundaries, 1,007 reviewed Wasm capabilities, and the WebAssembly resource
  lifetime audit.
- `pnpm test:baselib:strict`: 242 modules, zero errors.
- `pnpm --dir packages/flint-wasm build`: 273 registered functions compiled,
  zero unsupported; production artifact SHA-256
  `3de92fdadf843feb35a4df1a27158e96b4a9f2acfcedd6f9809cf3a8cef2e7d4`.
- Focused public analytic and multivariate Wasm tests passed in Node and
  Chromium, including numeric handle eviction and rehydration.
- The enabled automatic Cantor policy verifies three bounded domain entries
  against 12 normalized receipts spanning Linux x64, Linux ARM64, macOS ARM64,
  and Windows x64.

## Honest open gates

- The source-current Phase-9 analytic receipt remains a formal failure: fresh
  genus-2 `L`-function initialization timed out after 600 seconds. This quality
  freeze does not relabel that PARI comparison as a pass.
- The small-coefficient ordinary rational-addition row remains 7.81x Magma.
- Object-cold authenticated rank-2/rank-4 genus-2 height proof assembly remains
  17.1x/12.4x Magma, despite the accepted warm/reuse paths.

The candidate is therefore defensible as a correctness, lifecycle, packaging,
and bounded-fast-path release candidate. It is not a claim that every original
competitive-performance target has been met.
