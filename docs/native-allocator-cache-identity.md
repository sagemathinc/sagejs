# Native allocator cache identity

The native backend fingerprint includes `gmp-checkpoint-allocator.cjs`, whose
generated C is imported by `c-backend.cjs` and `production-pack.cjs`. Hashing
an importing generator does not authenticate the imported allocator body. Without
this dependency, changing the allocator alone can reuse an artifact compiled
with the old allocator.

This correction is extracted from the experimental arena-recycling work in
PR #204 and applied directly to main. It does **not** introduce block recycling,
change the allocator, raise resource limits, or change mathematical Python.
It preserves main's Windows digest-cache correction and integer-constant
fingerprint dependency. Existing kernels will acquire new cache identities and
may need rebuilding once; the executed algorithm is unchanged.

`test/native-allocator-cache-identity.cjs` evaluates the actual compiler
fingerprint function with only allocator reads substituted. It checks a
same-length byte change, stable repeated reads, restoration, and failure when
the allocator dependency cannot be read. Both regression tests fail on the
unchanged main baseline `d654e3d45` and pass with the dependency added. The tests
use Node alone and participate in the portable unit tier; they do not require
GMP, a native compiler, or edits to shared source files.

This is a cache-provenance correction, not qualification of experimental
allocator behavior or of the larger-cubic research certificates. Those retain
their separate platform, accounting, and mathematical review requirements.
