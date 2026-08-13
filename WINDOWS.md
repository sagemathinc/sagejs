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

## Release signing status

The native build, unsigned SEA relocation tests, packaging, checksum creation,
and Authenticode verification script are implemented. Branch and pull-request
CI archives are unsigned test artifacts. Only a `v*` workflow is intended to
produce downloadable signed Windows executables.

Two credential-gated signing paths exist:

1. **Azure Artifact Signing (preferred):** GitHub OIDC authenticates an Entra
   identity, `azure/artifact-signing-action` signs both `.exe` files with
   SHA-256 and an RFC 3161 timestamp, and `scripts/sign-windows.ps1 -VerifyOnly`
   verifies and executes them. This path is configured but was not proved with
   production credentials by the documentation audit. The Windows job already
   grants the required `id-token: write` permission; a credentialed dry run is
   the remaining evidence gate.
2. **Exportable PFX fallback:** `scripts/sign-windows.ps1` decodes the PFX into
   the ephemeral runner temporary directory, signs both SEAs with `signtool`,
   verifies them, exercises version/Jupyter/native factorization, and deletes
   the temporary file in `finally`. This is implemented but remains unproved
   with the production certificate. Azure is preferable because its private
   key does not enter a runner environment.

Neither path guarantees a warning-free first launch. Authenticode establishes
publisher identity and file integrity; Microsoft Defender SmartScreen also
uses reputation and policy signals which can initially warn for a legitimate
new publisher or uncommon download. Do not promise that signing instantly
creates reputation, and never tell users to disable SmartScreen or antivirus.

## Windows release checklist

### Before any credential is exposed

1. Select a clean, fully reviewed commit and make all package versions match.
   Run `pnpm test:release`, then require the complete Windows `test:portable`,
   `test:integration`, `test:native`, and `test:sea` jobs to pass at that exact
   commit.
2. Download the unsigned CI archive. Recompute its SHA-256 with
   `Get-FileHash`, extract to a fresh path, and run both relocated executables:

   ```powershell
   .\sagejs.exe --version
   .\sagepython.exe --jupyter-kernel-self-test
   "factor(2026)" | .\sagejs.exe
   ```

3. Inspect the archive's executables and licenses, and record the release
   commit and native mathematics profile from the workflow. The current ZIP
   has an adjacent checksum but no consolidated capability/provenance manifest;
   inspect one if the candidate adds it. Verify that no DLL,
   Node.js tree, compiler, PDB, certificate, key, token, or build directory was
   accidentally packaged.
4. Choose **one** signing mode. For Azure, verify the federated subject,
   Certificate Profile Signer role, endpoint/account/profile variables,
   `id-token: write` job permission, certificate publisher, and timestamp
   service. For PFX, verify certificate subject, Enhanced Key Usage for code
   signing, validity, chain, password secret, and timestamp service without
   printing or exporting private material unnecessarily.

### Sign and verify before packaging

1. Sign `build/sea/sagejs.exe` and `build/sea/sagepython.exe`, never a copy
   which differs from the SEA bytes that passed relocation tests. Require
   SHA-256 file digest and SHA-256 RFC 3161 timestamp digest.
2. Run the repository verifier:

   ```powershell
   pwsh -File scripts/sign-windows.ps1 -VerifyOnly
   ```

   It uses `signtool verify /pa /v` and then starts both signed executables,
   runs the Jupyter self-test, and evaluates native factorization. Also record:

   ```powershell
   Get-AuthenticodeSignature build/sea/sagejs.exe | Format-List *
   Get-AuthenticodeSignature build/sea/sagepython.exe | Format-List *
   signtool verify /pa /all /v build\sea\sagejs.exe
   signtool verify /pa /all /v build\sea\sagepython.exe
   ```

   Require `Status: Valid`, the expected publisher and chain, and a trusted RFC
   3161 timestamp. A timestamp allows a valid signature to survive routine
   certificate expiration; it is not a substitute for revocation after key
   compromise.
3. Package only those verified bytes. Recompute the ZIP checksum, extract the
   finished ZIP elsewhere, compare both extracted executable hashes with the
   signed inputs, rerun signature verification, and repeat the smoke tests.
   The neighboring checksum detects transport corruption but is not itself an
   Authenticode signature.

### Clean Windows 10/11 acceptance

1. Use an ordinary non-administrator account on a clean x64 machine with no
   Node.js, pnpm, Python, Visual Studio, WSL, MSYS2, or Sage.js checkout.
2. Download the ZIP through Edge or another normal browser so Mark of the Web
   is present. Verify the SHA-256 and inspect Properties → Digital Signatures
   before extraction. Confirm Windows displays the expected publisher.
3. Extract under paths containing spaces and non-ASCII characters. Launch
   `sagejs.exe` and `sagepython.exe` normally; record every SmartScreen,
   Defender, firewall, or publisher dialog rather than bypassing it. Repeat
   `--version`, factorization, Jupyter self-test and kernel registration.
4. Repeat after reboot and without network access. Signing verification may
   consult online revocation services, so record differences between online
   and offline behavior. Test removal by deleting the extracted directory and
   any explicitly installed Jupyter kernels or caches.
5. Test both direct GitHub ZIP installation and a clean global npm installation
   once published. Confirm the npm dispatcher selects
   `@sagemath/sagejs-win32-x64` and the installed executable bytes retain the
   same valid signatures.

### Publish, withdraw, and protect secrets

- The tag workflow publishes GitHub assets before npm, then the four native npm
  packages, then the public package. Do not manually publish in parallel. Test
  public downloads before linking them from the website.
- If a signed candidate has not been tagged or published, discard it and fix
  the source; its candidate version may be rebuilt, but the rejected hashes are
  not releases. If it is public, withdraw unsafe GitHub assets, deprecate
  immutable npm versions, move the npm `latest` tag back when compatible, and
  publish a fixed patch without moving the original Git tag.
- If a private key, PFX password, Azure identity, or token may have leaked,
  stop the workflow, rotate or revoke it at the issuer, remove it from GitHub,
  and audit its use. Certificate revocation can affect every binary signed by
  that certificate; coordinate with Microsoft/Azure or the issuing CA rather
  than assuming deletion of one ZIP revokes its executable signatures.
- Keep PFX/P12 bytes, passwords, OIDC configuration, access tokens, and
  unredacted signing logs out of source, artifacts, caches, issue comments, and
  release notes. Restrict credential environments to protected tag jobs and
  short-lived runners.

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
