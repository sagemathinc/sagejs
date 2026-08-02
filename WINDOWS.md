# Native Windows Support

Native Windows is a first-class Sage.js target, not an eventual best-effort
port. The initial target is 64-bit Windows 11 for users and Windows Server 2022
for continuous integration and development. WSL must not be required to run,
build, test, or package Sage.js.

## Support contract

The completed Windows distribution will provide:

- `sagejs.exe` and `sagepython.exe` built by Node's SEA toolchain;
- a native Node-API mathematics addon built with clang-cl and linked against
  MSVC-runtime-compatible libraries;
- GMP, MPFR, MPC, OpenBLAS, and FLINT built from pinned source releases;
- ordinary `pnpm bootstrap` support from a contributor checkout;
- a downloadable release requiring no Node.js, pnpm, Python, compiler, WSL, or
  package manager on the user's computer;
- the same mathematical answers and documented feature availability as Linux.

Every new native dependency must either pass required Windows CI or be isolated
behind an explicit capability with a tested correct fallback. A platform guard
around an otherwise mandatory subsystem is not an acceptable long-term fix.

## Primary toolchain

The supported contributor toolchain is:

- Git;
- Node.js 25.5 or newer for SEA creation;
- pnpm 11.9.0;
- Python 3 for `node-gyp`;
- Visual Studio 2022 Build Tools with the Desktop development with C++ workload;
- the MSVC x64 linker, MSBuild, Windows SDK, clang-cl compiler, and ClangCL
  MSBuild toolset;
- CMake 3.22 or newer and Ninja;
- PowerShell.

GitHub CLI is useful for agent-driven pull requests, and `signtool` will be
needed for signed releases. The C kernels use clang-cl because they rely on
`__int128` and `__builtin_*` operations that MSVC's C compiler does not
provide. GCC, MinGW, MSYS2, and WSL are not part of the primary build contract.

## Current implementation

The compiler, baselib, JavaScript runtime, FLINT-free SEA, pinned vcpkg
dependency stack, native FLINT addon, and mathematics SEA all build on native
Windows. The addon passes its exact-arithmetic, finite-field, Dirichlet/Arb,
modular-symbol, lifecycle, and lazy-loading suites. Windows uses FLINT's own
word bounds throughout rather than assuming the Unix LP64 data model.

The addon retains node-gyp's `node.exe` delay-load hook. This is essential for
the SEA: a native addon normally imports Node-API symbols from `node.exe`, but
the distributed executable is named `sagejs.exe`. The hook resolves them from
the running executable instead. clang-cl/lld does not preserve the floating
argument to the first lazily resolved `napi_create_double` call, so addon
initialization resolves that import once with an intentionally discarded
value. The full native suite runs both under ordinary Node and from a relocated
SEA to guard this subtle ABI boundary.

The main exceptional dependency is ffpoly/smalljac. Its finite-field code uses
GNU x86-64 inline assembly and assumes that C `unsigned long` is 64 bits.
64-bit Windows uses the LLP64 data model, where `unsigned long` is 32 bits.
The portable implementation must therefore use explicit-width types and
compiler intrinsics or C—not merely translate assembler syntax.

Smalljac is an optional acceleration backend, not the owner of the elliptic
curve API. During bring-up, Windows may use the existing correct point-counting
fallback while the native smalljac port proceeds. The capability and chosen
backend must be observable and tested; Sage.js must never silently return a
different mathematical result.

## CI stages

`.github/workflows/ci.yml` runs a blocking Windows job on every pull request.
It covers all of these promotion criteria:

1. pinned dependency installation;
2. compiler and standard-library build;
3. portable unit tests;
4. native GMP/MPFR/MPC/OpenBLAS/FLINT addon build and tests;
5. `sagepython.exe` and `sagejs.exe` construction;
6. relocation tests from a clean temporary directory;
7. release archive construction with licenses and SHA-256 checksum.

Windows failures block merging exactly like Linux failures.

## Implementation sequence

1. Keep the blocking clean-room Windows build, native tests, and relocated SEA
   smoke test green.
2. Package `sagejs.exe` and `sagepython.exe` with licenses and checksums in
   tagged releases.
3. Port ffpoly/smalljac using `uint64_t` and portable compiler intrinsics, with
   cross-platform correctness and performance benchmarks.
4. Test the released archive on a normal Windows 11 laptop with no development
   software installed.

The Windows 11 laptop is the final consumer test, not the primary development
host. Interactive porting should happen on a reproducible Windows Server VM;
GitHub-hosted Windows runners provide the permanent clean-room check.
