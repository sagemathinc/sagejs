# PR101/123 integration safety checkpoint

This branch combines PR101 at `f7f00552d` and the explicitly approved PR123 at
`b7139cea3`, with integration corrections. It is not yet a main integration
or a four-platform qualification receipt.

- Reject foreign resources retained across an exact-arena checkpoint unless
  they are constructed and destroyed as that arena's children. Transitive
  nested arena calls also fail before native code generation. Arena-free
  borrowed helpers and the actual single-root cubic program remain admitted.
- Initialize unsigned packed-buffer positions in the fmpz backend. The
  sanitizer witness exercises that supported IR variant explicitly, rather
  than assuming source lowering happens to select it.
- Include transitive inline headers from external reused dependency prefixes
  in native cache identities. Mutating an included leaf header changes the
  fingerprint even when the directly declared header and libraries do not.

Validation on Linux x64: 11 focused arena/fmpz tests pass, including generated
native execution, the standalone ASan/UBSan witness, and actual cubic IR
qualification. Four focused FFI configuration/cache-identity tests pass.
The tests use the already prepared integration FLINT prefix read-only through
`SAGEJS_FLINT_PREFIX`; no dependency source rebuild is needed.

Remaining: integrate the reconstructed-regulator rejection from PR127, then
qualify the combined main-based tree with architecture, strict Python, native,
portable, and browser checks. Historical task-manifest receipts remain
historical and must not be represented as current combined-tree evidence.
