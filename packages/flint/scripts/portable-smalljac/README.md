# Portable smalljac development harness

Sage.js pins ffpoly 1.2.7 and smalljac 4.1.3 by archive checksum. The
dependency build copies `sagejs_ffpoly_word.h` into the ffpoly source tree and
applies the two patches in `packages/flint/patches`.

Set `SAGEJS_FORCE_PORTABLE_SMALLJAC=1` to compile the portable 64-bit
multiply/carry implementation even on x86-64. This is the differential oracle
mode used before enabling a new architecture. The original GNU x86-64 assembly
remains the default on x86-64; arm64 selects the portable implementation.

`smalljac_trace_harness.c` is intentionally a plain C consumer of the public
smalljac API. Build it once against the optimized dependency prefix and once
against a forced-portable prefix, then compare its complete output over the
same curve and prime interval. It prints the good/bad-reduction flag and every
returned L-polynomial coefficient, so comparison is exact rather than based on
a checksum.

Native Windows remains an explicit second stage. The arithmetic header already
contains clang-cl/MSVC x64 intrinsics, but upstream uses LP64 `long` and
`unsigned long` throughout public APIs, finite-field storage, GMP conversions,
prime sieves, and format strings. It must receive a coordinated fixed-width ABI
patch before the library is enabled in the Windows addon. Do not compile it by
silently reducing the supported prime range to 32 bits.
