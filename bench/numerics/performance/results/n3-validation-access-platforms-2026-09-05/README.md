# Four-host validation storage-access qualification

Linux x64, Linux ARM64, macOS ARM64 and native Windows x64 pass the storage
access and overflow regressions in CPython and dynamic Sage.js. Mathematical
source: `513996d0f`. All four runs retain identical unchanged selected
3,098-file snapshots:

`965954b1c7c80d854fd078818052789714aecaaa2380f927c7131269a0bc7319`

Run `node bench/numerics/performance/prepared-api-portable.cjs receipt.json
--access` in the isolated bundle. The collector refuses existing paths and
records its own digest. The exact-library load guard is enabled in Sage.js.

These are focused source witnesses, not full product, npm/SEA, browser or
performance qualification. Earlier bundles and receipts remain intact. The
paired local timing observations are [separate](../n3-validation-access-2026-09-05/README.md).

`browsers.json` separately retains the current source-browser witness: all twelve
Chromium/Firefox/WebKit routes (disabled/enabled/stale/missing floating packs)
passed the prepared APIs, validation-access and overflow fixtures. Its embedded
root samples are not LU timing evidence. Compiler, lazy-module, harness and
validation-source hashes are recorded. Existing exact Wasm assets are reused;
this is not a full release build.
