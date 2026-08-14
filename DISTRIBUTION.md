# Distributing Sage.js

Sage.js has two distinct portability layers:

1. the language runtime, compiler, baselib, and JavaScript-backed standard
   library; and
2. native mathematical kernels such as GMP, MPFR, MPC, OpenBLAS, and FLINT.

Keeping that boundary explicit gives us useful distributions before the full
mathematical library exists. It also prevents browser portability from
dictating the architecture of the native research system.

## Single executable applications

[Node.js single executable applications](https://nodejs.org/api/single-executable-applications.html)
retain V8, including its optimizing JIT, while packaging the JavaScript
runtime and assets into one platform-specific executable. Sage.js builds two
variants:

| Artifact | Contents | Intended use |
|---|---|---|
| `build/sea/sagepython` | Python/Sage.js compiler, baselib, standard library, and Jupyter kernel; no FLINT addon | The small language runtime, compatibility testing, and portable demos |
| `build/sea/sagejs` | Everything above plus native FLINT and igraph addons and their statically linked libraries | Self-contained native research mathematics |

Build both with:

```sh
pnpm build:sea
```

Or build one variant:

```sh
pnpm build:sea:python
pnpm build:sea:math
```

The direct `node --build-sea` builder requires Node 25.5 or newer. The
resulting executable does not require Node, pnpm, the Sage.js checkout, or
separately installed mathematical libraries on the target computer. It is
still specific to an operating system and CPU architecture. Normal Sage.js
development and npm use continue to support Node 22.22.2 or newer.
The standard-library sources and their validated precompiled module caches are
embedded as SEA assets. Selected substantial pure-Python packages also ship
portable, compiler-versioned JavaScript templates. A target installation
materializes its real source filenames and creates V8 bytecode locally, so a
first `import mpmath` does not run the Sage.js compiler. Packages selected for
this treatment are declared in
`scripts/precompiled-python-packages.json`; the mechanism is not specific to
mpmath. The bundled `numpy-ts` backend is part of the JavaScript payload, so
`import numpy` does not require an adjacent `node_modules` tree.
Linux artifacts also inherit the libc and compiler-runtime baseline of the
Node executable used to build them; release binaries should therefore be
built in the oldest Linux environment which Sage.js intends to support.

The native build downloads checksum-pinned releases of GMP, MPFR, MPC, FLINT,
and igraph; Linux x64 also downloads ffpoly and smalljac. Fragile upstream
archives are mirrored according to [VENDORED-SOURCES.md](VENDORED-SOURCES.md). It builds
position-independent static libraries, tests GMP, and links those libraries
into the addon. Other platforms retain the same elliptic-curve API using the
portable point-counting fallback. At runtime the SEA asset API writes native
addons and evaluator workers to a private temporary directory because Node
loads both through filesystem paths. The embedded ZeroMQ Node-API addon
provides a real Jupyter wire protocol without requiring Node or `node_modules`
beside the executable. The directory is removed when the process exits.

### Native mathematics build profiles

Release artifacts and ordinary source builds use the `portable` mathematics
profile. On x86-64 it builds GMP's runtime-dispatched fat binary, uses the
explicit x86-64-v1 compiler baseline, and builds runtime-dispatched OpenBLAS
kernels. Linux arm64 uses the Armv8-A baseline. Apple Silicon uses the macOS
deployment target rather than `-mcpu`; GMP's configure result must select its
`arm64 generic` MPN path rather than `applem1`. Givaro and FFLAS disable their
own host-native probes, while M4RI uses a fixed portable cache model. These
choices prevent an artifact from being silently tied to the CPU which happened
to compile it.

Controlled benchmarks and local source installations may explicitly select a
CPU-specific stack:

```sh
SAGEJS_NATIVE_MATH_PROFILE=cpu-native pnpm --dir packages/flint build
SAGEJS_NATIVE_MATH_PROFILE=cpu-native pnpm --dir packages/fflas build
```

The `cpu-native` profile omits GMP's `--enable-fat`, compiles GMP, FLINT, and
the FFLAS stack with the compiler's native CPU flag when supported, and lets
FLINT detect `fft_small` from the resulting instruction set. It is intentionally
opt-in: moving one of these binaries to a different CPU may execute unsupported
instructions. Native Windows x64 always falls back visibly to the portable
profile and remains correct.

The shared native-artifact cache fingerprints the effective profile, CPU model
and feature set for CPU-native builds, target C ABI, compiler identity and
target, exact dependency versions, and build options. Portable entries omit
the particular CPU identity so compatible hosts can still share them. Inspect
the selected profile, the installed dependency stamp, and observed FLINT
capabilities without rebuilding anything:

```sh
sagejs native profile
sagejs native profile --json
```

Record the JSON output with performance results. It distinguishes a selected
profile from a differently built prefix and makes accidental portable/native
benchmark comparisons apparent.

Before packaging a native artifact, validate the installed dependency receipts:

```sh
node scripts/release-cpu-profile.cjs --json
```

This fails closed if any installed FLINT, FFLAS, M4RI, or igraph profile is
host-tuned, target-mismatched, missing its required dispatch policy, or lacks
observed GMP configure evidence. The precise contract and current limitations
are in [`docs/native-release-cpu-profile.md`](docs/native-release-cpu-profile.md).

If `jupyter` is available on `PATH`, either executable can register itself as
a kernel with no additional Sage.js files:

```sh
sagejs --install-jupyter-kernel
```

Run the end-to-end build and relocation smoke test with:

```sh
pnpm test:sea
```

On one x86-64 Linux development host the uncompressed mathematics executable
was about 164 MB. Compressing it with:

```sh
xz -T0 -9 -k build/sea/sagejs
```

produced a 34 MB file. These figures are examples rather than size promises;
the Node executable used to build the artifact accounts for most of the
uncompressed size. For comparison with SageMath's multi-package
distribution, a single file comfortably below 200 MB is already a successful
proof of concept.

The Python-only executable intentionally keeps the ordinary mathematical API
surface visible. Calling a FLINT-backed operation produces a clear
“built without the optional FLINT mathematics backend” error rather than
silently changing its semantics.

## Release candidate and credential gate

The release process has four deliberately distinct states. Do not describe an
artifact as a Sage.js release merely because it was built successfully.

- **Implemented and credential-free:** `pnpm test:sea` builds both executables
  and checks relocation, startup, Jupyter, and representative native
  mathematics. CI packages unsigned Linux archives, checksums, and npm
  tarballs. Branch and pull-request Windows artifacts are also unsigned test
  artifacts.
- **Implemented but credential-gated:** a `v*` workflow signs Windows
  executables, signs Apple Silicon macOS executables, notarizes their ZIP and
  PKG distributions, and refuses to publish if those jobs fail. The scripts are
  [`scripts/sign-windows.ps1`](scripts/sign-windows.ps1) and
  [`scripts/release-macos.sh`](scripts/release-macos.sh).
- **Manual acceptance:** a maintainer must inspect the workflow, signatures,
  checksums, and clean-machine behavior. CI cannot establish Gatekeeper or
  SmartScreen behavior for every end-user download path.
- **Not yet proved by this documentation audit:** a production tag using the
  real Apple, Windows, npm, and GitHub credentials. Source-controlled release
  automation is not evidence that the credentialed path has run successfully.

The authoritative secret names and tag procedure are in
[`RELEASING.md`](RELEASING.md). The following is the human approval checklist,
not a second automation implementation.

### 1. Freeze and verify unsigned inputs

1. Choose one clean commit. Update the root package and all four native package
   versions together, update release notes, refresh `pnpm-lock.yaml`, and run
   `pnpm test:release -- --tag vX.Y.Z`. This checks that the intended tag and
   every package version agree before the tag exists.
2. Before the first production tag, protect `v*` tags with a repository
   ruleset. Confirm that the tag-only signing job uses the protected
   `sagejs-signing` environment, that final publication uses the separate
   `sagejs-release` environment, and that both accept only `v*` tags and require
   maintainer approval. Review and preferably pin every action used by a
   secret-bearing job to an immutable commit rather than relying only on a
   moving version tag.
   Limit the npm token to the required `@sagemath` packages and keep GitHub,
   Azure, and Apple identities least-privileged.
3. Require the complete unprivileged CI matrix to pass at that exact commit,
   including each platform's blocking portable/unit, integration, native, and
   `pnpm test:sea` stages. The exact tier names differ slightly by job; review
   the workflow rather than inferring coverage from one green status icon.
4. Download every available CI artifact before creating a tag. Record its
   workflow run, commit, platform, architecture, Node version, and native
   mathematics profile. The current archives have adjacent checksums but do not
   yet include one consolidated, machine-readable release manifest; retain the
   workflow evidence until that manifest exists. Treat any generated capability
   or provenance manifest as evidence to review, not as a substitute for tests.
5. Verify each adjacent `.sha256` file using a second tool, inspect every
   archive's file list and licenses, extract it into a new directory, and run:

   ```sh
   ./sagejs --version
   ./sagepython --jupyter-kernel-self-test
   printf 'factor(2026)\n' | ./sagejs
   ```

   Use the `.exe` names and PowerShell equivalents on Windows. A checksum
   detects accidental corruption; because the checksum is distributed beside
   the archive, platform signatures and the authenticated GitHub/npm channels
   provide publisher identity.
6. Review all generated manifests and checksums as release records. No secret,
   private key, PFX/P12 file, notary API key, Keychain password, or unredacted
   signing log belongs in an artifact, repository, shell history, or release
   note.

### 2. Approve the desktop signatures

On macOS, confirm the Developer ID Application and Installer identities and the
`notarytool` profile before running `pnpm release:macos`. The script applies the
hardened runtime with [`scripts/macos-entitlements.plist`](scripts/macos-entitlements.plist),
signs and executes both SEAs, signs the PKG, submits the ZIP and PKG to Apple,
staples the PKG, and runs `codesign`, `pkgutil`, `stapler`, and `spctl` checks.
The current release grants JIT, unsigned-executable-memory, and
disabled-library-validation entitlements for V8 and extracted Node-API addons;
inspect and justify the embedded entitlements on every release rather than
copying them forward without review. A ZIP cannot itself carry a stapled
ticket, so test it online after a normal browser download. Test the stapled PKG
both online and offline. Full commands and clean-machine checks are in the
macOS checklist below.

On Windows, choose exactly one Authenticode path: Azure Artifact Signing or the
temporary-PFX fallback. Both must use SHA-256 file and RFC 3161 timestamp
digests, and both must pass
`pwsh -File scripts/sign-windows.ps1 -VerifyOnly` before packaging. A trusted
timestamp preserves the validity of a signature after ordinary certificate
expiration; it does not rescue a signature made after compromise or revocation.
Detailed verification and SmartScreen limitations are documented in
[`WINDOWS.md`](WINDOWS.md).

### 3. Publish in one direction

1. Push an annotated `vX.Y.Z` tag only after the unsigned commit and signing
   configuration are approved. The tag is the credentialed release trigger.
   Do not move or overwrite a tag which users may already have consumed.
2. Let all four platform jobs finish. The publish job must consume only their
   downloaded artifacts, never a maintainer's local rebuild.
3. The current workflow creates or updates the GitHub release and uploads the
   direct archives, checksums, macOS PKG, and installer first. It then publishes
   the four platform npm packages and finally `@sagemath/sagejs` under `latest`.
   The public package is last because its exact optional dependencies must
   already exist.
4. Do not run a competing local `gh release upload` or `pnpm publish` while the
   tag workflow is active. npm versions are immutable; a partially published
   version cannot safely be rerun as though nothing happened.
5. After publication, download from GitHub and install from the public npm
   registry into clean directories. Compare checksums and executable hashes
   with the workflow artifacts, repeat the mathematical/Jupyter smoke tests,
   and inspect npm provenance.
6. Only then update the website or announcement links. Check both pinned URLs
   and `/releases/latest`, and test `install.sh` against the public assets on
   Linux x64, Linux arm64, and Apple Silicon. Windows remains a manual archive
   install until a Windows installer is implemented.

### 4. Clean-machine acceptance

Use ordinary, non-administrator accounts with no Node.js, pnpm, compiler, or
Sage.js checkout. Download through the platform's normal browser so quarantine
or Mark-of-the-Web metadata is present. Test first launch, second launch,
`--version`, native factorization, Jupyter self-test and registration, paths
containing spaces and non-ASCII characters, and uninstall/removal. Record the
OS build and every security dialog. Never tell users to disable Gatekeeper,
SmartScreen, antivirus, or signature checks to make a release work.

### 5. Roll back without rewriting history

- For an unpublished candidate, delete only the candidate artifacts and fix the
  source before tagging.
- For a published GitHub release, mark it clearly as withdrawn, remove unsafe
  downloadable assets if necessary, and publish a new patch version. Do not
  silently replace bytes behind an existing checksum or retarget its tag.
- npm does not permit replacing a published version. Deprecate the affected
  root and platform versions, move `latest` back to the last known-good root
  version when compatible, and publish a fixed patch. Remember that deleting a
  GitHub asset does not retract an npm tarball.
- If a signing secret may have leaked, stop publication, revoke or rotate the
  credential at Apple, the certificate authority, Azure, npm, and/or GitHub as
  applicable, remove it from repository settings, and audit use. Revoking a
  certificate or notarization credential has consequences beyond one file;
  coordinate with the issuer instead of guessing that deleting a release is
  equivalent to revocation.
- Remove or redirect website download links only after the authoritative
  GitHub/npm state is explicit. Preserve a short incident record containing
  versions, hashes, affected channels, actions, and the replacement release.

### macOS credentialed checklist

This checklist is implemented for **macOS arm64** in CI. Although the local
script recognizes x86-64, no macOS x64 CI job or npm platform package currently
makes x86-64 a release target.

1. On the signing machine, inspect identities with `security find-identity -v`
   and verify the intended Team ID. Configure the notary profile with
   `xcrun notarytool store-credentials`; never pass the private key or password
   on a shared command line.
2. Run `pnpm test:sea`, then `pnpm release:macos` without `--publish`. Use
   `--skip-build` only for executables already produced and tested in the same
   trusted workspace. `--skip-notarize` creates signed but unnotarized
   developer artifacts and is never a public-release option.
3. Save the `notarytool --wait` acceptance output or submission IDs. Inspect
   Apple's status, and use `xcrun notarytool log SUBMISSION_ID` to investigate
   any rejection instead of publishing around it. Inspect both executables with:

   ```sh
   codesign --verify --deep --strict --verbose=4 PATH
   codesign --display --verbose=4 PATH
   codesign --display --entitlements :- PATH
   spctl --assess --type execute --verbose=4 PATH
   ```

4. Verify the installer with `pkgutil --check-signature`,
   `xcrun stapler validate`, and `spctl --assess --type install --verbose=4`.
   Confirm its identifier, version, install location, and payload before
   allowing an administrator installation. The current PKG contains the two
   executables under `/usr/local/bin`; licenses are in the ZIP distribution and
   removal is currently manual, so release notes must say that plainly.
5. Recompute SHA-256 for the ZIP and PKG. Download both from the eventual
   GitHub release on a different clean Apple Silicon Mac. Open the quarantined
   ZIP while online and launch both executables without a security bypass.
   Install the stapled PKG once offline and once online, then run the same
   native and Jupyter smoke tests from `/usr/local/bin`.
6. Delete temporary Keychains, decoded P12/API-key files, and local notary
   profiles that were created solely for the release. CI already uses an
   ephemeral Keychain and runner, but maintainers must clean local state.

## Browser and WebAssembly

The browser proof of concept executes the mathematics runtime inside a Web
Worker. A nested worker runs the self-hosted compiler in a separate realm,
matching the VM isolation used by the Node REPL. Long computations cannot
freeze the page, and the first reliable interruption mechanism simply
terminates and recreates the outer worker. WebAssembly mathematical objects
remain opaque handles owned by that worker.

There is strong evidence that the native library stack is portable:

- the earlier CoWasm SageMath work builds GMP, MPFR, and FLINT for WASI and
  exercises integer, rational, finite-field, polynomial, matrix, Arb, ACB,
  algebraic-number, and Calcium operations;
- [python-flint](https://github.com/flintlib/python-flint) supports an
  Emscripten/Pyodide build; and
- [napi-wasm](https://github.com/devongovett/napi-wasm) offers a possible
  compatibility layer for compiling a Node-API-shaped addon to WebAssembly.

The implemented direct C ABI links the CoWasm FLINT, MPFR, and GMP archives
into a 4.7 MiB stripped module, about 2 MiB with gzip. The compiler and baselib
add about 0.45 MiB with gzip. CoWasm's `wasi-js` and `@cowasm/memfs` provide a
browser-safe temporary filesystem for FLINT algorithms such as quadratic
sieve, without granting access to a host filesystem. A real Chromium smoke
test evaluates
`factor(2026)` through the Sage parser, generated JavaScript, ordinary
`IntegerFactorization`, and FLINT WASM layers. It also verifies persistent
definitions across evaluations and factors every `n^22 - 1` for
`2025 <= n <= 2050`.

This establishes a worker-hosted WASM backend without making the browser the
primary high-performance research target or forcing native deployment through
WebAssembly. The current evaluator uses dynamic JavaScript evaluation inside
the isolated worker, so restrictive Content Security Policies remain a
separate deployment issue.

Synchronous `time.sleep()` follows the same architecture. It uses
`Atomics.wait` in Node and can block an isolated worker, but it refuses to
busy-wait on a browser main thread.

## Hosted services

Ordinary edge-worker isolates are a poor match for a large optimizing runtime,
native libraries, long computations, and interruptible state. A
[Cloudflare Container](https://developers.cloudflare.com/containers/) or
ordinary OCI container is a much cleaner hosted target: it can run the native
SEA artifact while the surrounding service owns scheduling, persistence,
resource limits, and termination.

## TypeScript-to-native compilers

[Porffor](https://github.com/CanadaHonk/porffor) is an interesting
experimental JavaScript/TypeScript ahead-of-time compiler, but it is not
currently a distribution route for the general Sage.js runtime:

- Sage.js depends on dynamic language machinery which an optimizing
  JavaScript runtime already implements;
- replacing V8 gives up the JIT rather than merely removing Node APIs; and
- a measured experiment on a 118-byte Python loop produced 1.25 MB of
  generated Sage.js runtime JavaScript. Porffor parsed and lowered it to C,
  but first exposed an unmangled C-reserved identifier and, after that
  experimental rename, its default native/LTO build did not finish within
  180 seconds.

Porffor may eventually be useful for small, isolated kernels. Sage.js already
has a more direct route for those kernels: typed Sage.js IR lowered to compact
C against the native mathematical ABI. The two approaches should not be
confused with packaging the complete dynamic runtime.

## Current matrix

| Target | Status | Runtime strategy |
|---|---|---|
| npm package | Working | Small Node dispatcher + platform-native optional package; source/embedding APIs retained |
| Native single file | Working proof of concept | Node SEA + embedded static-math addon |
| FLINT-free single file | Working proof of concept | Node SEA, JavaScript language runtime only |
| Browser demo | Working proof of concept | Web Worker + WASM mathematical backend |
| Hosted service | Straightforward later | SEA in an OCI/Cloudflare Container |
| General Porffor binary | Not currently viable | Loses V8 and expands the whole dynamic runtime |

The strategic default remains simple: use V8 for dynamic code, native
libraries for mathematical objects, and typed native lowering for hot library
kernels.
