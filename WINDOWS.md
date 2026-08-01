# Native Windows Support

Native Windows is a first-class Sage.js target, not an eventual best-effort
port. The initial target is 64-bit Windows 11 for users and Windows Server 2022
for continuous integration and development. WSL must not be required to run,
build, test, or package Sage.js.

## Support contract

The completed Windows distribution will provide:

- `sagejs.exe` and `sagepython.exe` built by Node's SEA toolchain;
- a native Node-API mathematics addon built with MSVC;
- GMP, MPFR, MPC, and FLINT built from pinned source releases;
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
- the MSVC x64 compiler, linker, MSBuild, and Windows SDK;
- CMake 3.22 or newer and Ninja;
- PowerShell.

GitHub CLI is useful for agent-driven pull requests, and `signtool` will be
needed for signed releases. `clang-cl` is a valuable secondary compiler after
the MSVC build works. GCC, MinGW, MSYS2, and WSL are not part of the primary
build contract.

## Current boundary

The compiler, baselib, JavaScript runtime, and FLINT-free SEA should be portable
without algorithmic changes. The native dependency build is currently rejected
on non-Linux hosts, and the addon unconditionally links Unix archives and
`pthread`.

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

`.github/workflows/ci.yml` runs the Windows job on every pull request. During
initial bring-up the job is marked as an expected failure so it records all
portable and native layer outcomes without making unrelated changes
unmergeable. It must not be deleted, skipped, or weakened to hide a regression.

Promote the Windows job to a required, blocking job when all of these pass:

1. pinned dependency installation;
2. compiler and standard-library build;
3. portable unit tests;
4. native GMP/MPFR/MPC/FLINT addon build and tests;
5. `sagepython.exe` and `sagejs.exe` construction;
6. relocation tests from a clean temporary directory;
7. release archive construction with licenses and SHA-256 checksum.

After that point, Windows failures block merging exactly like Linux failures.

## Implementation sequence

1. Make path, executable-name, temporary-directory, and process handling work
   under native PowerShell and Win32.
2. Build and test the FLINT-free `sagepython.exe`.
3. Split optional smalljac code from the core addon and make `binding.gyp`
   platform-aware.
4. Build pinned GMP, MPFR, MPC, and FLINT through the upstream-supported Windows
   CMake/MSVC path.
5. Build and test the native addon without smalljac.
6. Produce and relocation-test `sagejs.exe`.
7. Port ffpoly/smalljac using `uint64_t` and portable MSVC/GNU intrinsics, with
   cross-platform correctness and performance benchmarks.
8. Test the released archive on a normal Windows 11 laptop with no development
   software installed.

The Windows 11 laptop is the final consumer test, not the primary development
host. Interactive porting should happen on a reproducible Windows Server VM;
GitHub-hosted Windows runners provide the permanent clean-room check.
