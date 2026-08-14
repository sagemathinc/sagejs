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

## Initial release status: deliberately unsigned

The initial public Windows artifact is
`sagejs-windows-x64-unsigned.zip`. Its executables are **not
Authenticode-signed**. GitHub Actions requires
`Get-AuthenticodeSignature` to report `NotSigned` before packaging and includes:

- `UNSIGNED-WINDOWS.txt`, telling users to verify SHA-256;
- `release.json`, binding the version, full source commit, target, and explicit
  `{ "scheme": "authenticode", "status": "unsigned" }` policy;
- both executables, the source license, distribution/readme files, and the
  exact third-party license inventory—no DLL, PDB, debug file, compiler output,
  certificate, token, or build directory;
- an adjacent `.sha256` receipt and an entry in the release-wide
  `SHA256SUMS`/`release-provenance.json` records.

The publication gate rejects duplicate ZIP entries, absolute or traversal
paths, extra members, a mismatched version/commit, and any archive which does
not state the unsigned policy. Checksums authenticate bytes received through
the GitHub release; they do not establish a Windows publisher identity.
SmartScreen may therefore warn. Never tell users to disable SmartScreen,
antivirus, or checksum verification.

Authenticode via Azure Artifact Signing remains planned for a later release.
When enabled, it will be a separate protected, tested release gate rather than
a silent change to the unsigned artifact contract. The existing local
`scripts/sign-windows.ps1` is development groundwork, not evidence that the
published binary is signed.

## Clean Windows 10/11 acceptance

On an ordinary non-administrator Windows 10/11 x64 account with no Node.js,
pnpm, Python, compiler, WSL, MSYS2, or Sage.js checkout:

1. Download the ZIP through the normal browser path so Mark-of-the-Web and
   SmartScreen behavior are real.
2. Verify the published checksum independently:

   ```powershell
   Get-FileHash .\sagejs-windows-x64-unsigned.zip -Algorithm SHA256
   ```

3. Confirm the archive name and notices say unsigned. Extract into a new
   directory and run:

   ```powershell
   Get-AuthenticodeSignature .\sagejs.exe | Format-List Status
   .\sagejs.exe --version
   .\sagepython.exe --jupyter-kernel-self-test
   "factor(2026)" | .\sagejs.exe
   ```

4. Test first and second launch, paths containing spaces and non-ASCII
   characters, and Jupyter registration/removal. Record the OS build and every
   security dialog as acceptance evidence.

## CI stages

`.github/workflows/ci.yml` runs a blocking Windows job on every pull request.
It covers all of these promotion criteria:

1. pinned dependency installation;
2. compiler and standard-library build;
3. portable unit tests;
4. native GMP/MPFR/MPC/OpenBLAS/FLINT addon build and tests;
5. `sagepython.exe` and `sagejs.exe` construction;
6. relocation tests from a clean temporary directory;
7. release archive construction with licenses, manifest, unsigned assertion,
   and SHA-256 checksum.

Windows failures block merging exactly like Linux failures.

## Implementation sequence

1. Keep the blocking clean-room Windows build, native tests, and relocated SEA
   smoke test green.
2. Publish the explicit unsigned archive, licenses, provenance, and checksums.
3. Complete Microsoft publisher validation, then add Authenticode as a new
   protected gate with real clean-machine verification.
4. Port ffpoly/smalljac using `uint64_t` and portable compiler intrinsics, with
   cross-platform correctness and performance benchmarks.

The Windows 11 laptop is the final consumer test, not the primary development
host. Interactive porting should happen on a reproducible Windows Server VM;
GitHub-hosted Windows runners provide the permanent clean-room check.
