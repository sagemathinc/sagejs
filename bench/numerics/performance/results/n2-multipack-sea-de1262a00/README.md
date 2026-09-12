# Four-platform executable native-pack fixture evidence

Source: `de1262a00bbd6b0546c59ec69b8a4cdc5dc0724e`, draft PR #262.
These are **fixture passes, not full-product qualification or performance targets**.

| Platform | Node builder/runtime | Valid SEA bytes | Outcome |
| --- | --- | ---: | --- |
| Linux x64 | 26.8.1 | 157,220,036 | pass |
| Linux ARM64 | 26.5.1 | 155,012,144 | pass |
| macOS ARM64 | official 26.5.0 | 150,396,464 | pass |
| Windows x64 | 26.5.1 | 110,100,808 | pass |

Each host freshly compiled/published two source-transparent native families,
proved public numerical native autoload with the exact pack directory withheld,
exercised the real resource loader through controlled assets, then built and
relocated two actual executable SEA fixtures. The valid executable performs
the sum of `[1e100, 1, -1e100]` exactly as 1 through the generated kernel and leaves the exact
pack unextracted. The corrupted embedded digest is rejected before extraction.
Relocated execution has an empty compiler search path, no developer native cache,
and a nonexistent exact prefix. The restored exact pack checks `2**200 * 2`.

The executables embed both packs and use the actual compiled resource loader;
they do **not** contain the complete Sage.js Python/compiler/CLI application.
The reported sizes mainly reflect unstripped Node templates and are not an
optimized Sage.js payload measurement. No public operation latency, startup or
RSS target is qualified. Fixture executables are removed by their tests after
execution; recorded hashes identify tested files, not downloadable release assets.

Prepared dependencies and earlier compiler frontends were reused read-only.
The generic compiled resource loader, native-cache resolver and layout helper
were identical across hosts; frontend hashes differed and are explicitly listed.
The Windows fixture uses native Windows, not WSL/MSYS2/MinGW. macOS uses an
already cached official SEA-capable Node binary and ad-hoc fixture signing;
this is not product signing. No disk cleanup or live release-tree edit occurred.

Logs are retained with transport CRLF normalized to LF only. The verifier checks
their hashes, reported assertions, platform coverage and source input hashes
against the pinned Git commit. It does not transform these tests into a frozen
full-build receipt or reconstruct deleted executables.

```sh
node bench/numerics/performance/results/n2-multipack-sea-de1262a00/verify.cjs
# In a prepared checkout, using a Node builder supporting --build-sea:
node --test test/numerics/performance/multipack-sea.cjs
```

Full production-catalog tests, real Sage.js npm/SEA usage, startup/memory
measurements and the coordinated class-group runtime-closure format update
remain required. PR #262 stays draft until its integration gates are satisfied.
