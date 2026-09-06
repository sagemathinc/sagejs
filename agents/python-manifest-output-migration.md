# Manifest-driven MicroPython output qualification

This slice combines the original 508-case MicroPython output contract with the
28 required assertion programs. The original baseline, reviews, source bytes,
license and exclusion inventory remain unchanged. The standalone CLI delegates
to the same execution helpers as the generic engine; it remains available.

The manifest pins original source/baseline/review hashes, requires a closed
`upstream-tests/python-compat` sibling anchor, and rejects linked or changed
corpus inputs. The legacy profile retains original filenames, corpus working
directory, ambient environment overrides, timeouts, raw interleaved streams,
and uncapped output. Assertion staging, clean environments and resource bounds
are unchanged. This does not claim sandbox isolation for the legacy profile.

The generic adapter additionally resolves and hashes the oracle in the actual
legacy environment, then launches the verified absolute executable. This is
deliberately not exact wrapper-invocation parity. Reports preserve the original
output report, source/artifact/workspace guards, and explicit unmeasured
performance status. Complete output-suite coverage is required to qualify;
partial selection is diagnostic-only. A passing selected suite never implies
that the full manifest passed.

The three new validation helpers join an exact build-input exclusion list;
unknown neighbors and production-manifest reviewed-input overrides remain
conservative. This preserves artifact reuse after future harness-only edits,
not package tarball byte identity. Changing the partition implementation itself
requires a fresh build; no previous receipt is rewritten.

Integration checks: 65 focused synthetic tests, architecture checks, and
`pnpm test` pass (routine: 10m 59s, including rebuild and unchanged startup
budget). Paired source-current standalone/generic MicroPython runs both pass
505 exact plus three reviewed outcomes on Linux x64, Node 26.8.1 and pinned
CPython 3.14.4. All source/artifact/workspace identities match across the pair:
507 per-case evidence records are identical, and the weakref-finalization case
uses two already-pinned reviewed alternatives. No baseline was regenerated.

The full 536-case gate records 522 exact passes, three reviewed differences,
and the same 11 required assertion failures as the preceding 28-case run;
`fullManifest` is true, `qualified` is false, and input identities are unchanged.
A live single-case artifact diagnostic also remains explicitly unqualified and
incomplete. Package checks remain 8/11 passing plus all seven selected Tomli
upstream tests, with the existing pyparsing failure, IDNA stderr, and mpmath
cold timeout. Four-platform/browser qualification and these required repairs
remain open; this migration does not close any performance cliff.
