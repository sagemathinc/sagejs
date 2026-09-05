# Four-host bounded LU source qualification

Linux x64, Linux ARM64, macOS ARM64 and native Windows x64 pass the same
41-case LU corpus through freshly compiled native code and generated JavaScript,
against CPython ordinary factorization and independent reconstruction. The
mathematical subject is `3311fd402`; the follow-up test transport uses stdin
instead of a command-line JSON argument, which exceeded Windows' argument limit.

All four receipts authenticate the same unchanged selected source/runtime/
dependency snapshot:

`285612be4dcf98b4d27bf70ef4212ad2b58d0c558d52d11387c9a6de1f5f0dbe`

The collector records its own digest, host versions, exit status and before/after
hashes. It refuses existing receipt paths. Qualification used fresh copies of
the earlier isolated tool/runtime bundle with the current source and compiler
overlay; this is **not a full candidate build**. Windows uses its native toolchain,
not WSL or MinGW. The three Unix hosts and Windows passed without mathematical
changes. Initial local bundle attempts omitted build-recipe inputs and assumed
a Git checkout; the complete recipe inputs and explicit absent Wasm root fix
the isolated harness, not the kernel.

Run in the isolated bundle:

```sh
node bench/numerics/performance/prepared-api-portable.cjs receipt.json --lu
```

The `--lu` run explicitly qualifies native and generated JavaScript only. Wasm
and Chromium/Firefox/WebKit have separate local source witnesses in the
[development evidence](../n3-packed-lu-development-2026-09-05/README.md).
No public API, npm/SEA, performance, memory or full-product qualification is
implied. All host jobs are finished; existing older receipts were not overwritten.
