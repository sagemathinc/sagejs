# Release-process preparation campaign: 4eb17222

This is preparation evidence, not a published release or complete product qualification.

Source: `4eb172220532b7ded167abce85cbc57fc9b0135f`.

## Completed

- The real `preparation` runner completed numerical production, public runtime,
  browser build/size validation, and canonical npm packing/comparison.
- Stage durations were 4.549, 766.954, 679.704, and 552.434 seconds respectively.
- An unchanged rerun verified and reused **all four checkpoints in 3.353 seconds**.
  It did not rebuild, recompile, repack, or recompress products.
- Browser artifact: `sha256:f8be73f49dbe4808dc8477ca77d9b70b9bca4647de2a1955c8523eb01cd60361`;
  96 files, 178,332,575 raw bytes, 23,753,024 gzip bytes, 15,351,019 Brotli bytes.
  Existing baseline and topology budget checks passed unchanged.
- Strict Python passed: 798 formatting/docstring files and 382 strict modules,
  with zero errors/warnings. Release metadata and installer checks passed.
- Fresh NLopt receipts authenticated the same canonical 72,592-byte reactor on
  Linux x64, Linux ARM64, macOS ARM64, and Windows x64. This is portable execution,
  not four independent reactor rebuilds.
- All seven supplemental NLopt kinds passed: sanitizer, destructive Wasm,
  browser lifecycle, public integration, resource corruption, npm relocation,
  and Python SEA relocation. Their signed evidence is embedded in
  `src/lib/sagejs/numerics/optimization/backends/nlopt/release/qualification-v1.json`.
  The production manifest was promoted only after full qualification validation;
  `verify-release.cjs --require-qualified` passed.

## Operational findings

- Missing pinned `tree-sitter-cli` was repaired with `pnpm rebuild tree-sitter-cli`;
  the retry reused the completed numerical checkpoint.
- Browser evidence pins Chromium 149.0.7827.196. A host's cached 151 was rejected.
  The component harness uses `CHROMIUM_PATH`, while public browser tests use
  `SAGEJS_CHROMIUM`; both must point to the selected browser. Skips are failures.
- Browser assembly repeats lazy-cache generation already done by preparation.
  The resulting runtime bytes were identical, so reuse still works, but about
  five minutes of initial work is redundant.
- Package comparison recompresses both trees. A future improvement should reuse
  measurements from the authenticated producer while checking exact bytes;
  never accept unauthenticated claimed compressed sizes.
- Pinned dependencies and parser submodules were prepared on all four hosts.
  Native cache restore succeeded for dependency prefixes on Linux x64/macOS;
  ARM64 reported misses. Windows restore failed with ENOSPC (about 188 MiB free).
  Its failed restore cleaned its scratch directory. No old worktrees were deleted;
  a cache-cleanup dry run could recover only about 1 GiB. Disk expansion requested.

## Still required

Full exact-candidate native/browser product acceptance, startup qualification,
authenticated frozen transport, real interrupted publication/recovery, and public
GitHub/npm/app/installer verification. No tag or publication is authorized by
the scheduling checkpoints alone. This campaign does not claim those steps passed.
