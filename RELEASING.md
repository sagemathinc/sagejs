# Releasing Sage.js

A Sage.js release publishes one tested set of native executables through
GitHub and npm. The npm platform packages contain the same signed/notarized
bytes as the direct archives; the public `@sagemath/sagejs` package is published
last so its exact optional dependencies are already available.

## Required release configuration

- Configure npm Trusted Publishing for `@sagemath/sagejs` and each of its four
  platform packages. Each package must trust GitHub organization `sagemathinc`,
  repository `sagejs`, workflow `ci.yml`, and environment `sagejs-release`,
  with `npm publish` permission. The publish job uses GitHub OIDC and never
  stores a reusable npm credential.
- The `sagejs-release` GitHub environment requires a maintainer approval before
  npm publication and before the draft GitHub release becomes immutable.
- The preferred Windows path is Azure Artifact Signing with the repository
  variable `SAGEJS_WINDOWS_SIGNING_MODE=azure`; secrets
  `SAGEJS_AZURE_CLIENT_ID`, `SAGEJS_AZURE_TENANT_ID`, and
  `SAGEJS_AZURE_SUBSCRIPTION_ID`; and variables
  `SAGEJS_ARTIFACT_SIGNING_ENDPOINT`, `SAGEJS_ARTIFACT_SIGNING_ACCOUNT`, and
  `SAGEJS_ARTIFACT_SIGNING_PROFILE`. The Entra identity uses GitHub OIDC and
  needs the Artifact Signing Certificate Profile Signer role.
- As a fallback, set `SAGEJS_WINDOWS_SIGNING_MODE=pfx` and configure
  `SAGEJS_WINDOWS_CERTIFICATE_PFX_BASE64` and
  `SAGEJS_WINDOWS_CERTIFICATE_PASSWORD` with an exportable Authenticode code
  signing certificate.
- During pre-1.0 early-alpha releases, leave
  `SAGEJS_WINDOWS_SIGNING_MODE` unset or set it to `unsigned` to publish an
  explicitly reported unsigned Windows artifact. This is not the production
  signing policy.
- `SAGEJS_APPLE_CERTIFICATE_P12_BASE64` and
  `SAGEJS_APPLE_CERTIFICATE_PASSWORD`: a base64-encoded PKCS#12 containing both
  the Developer ID Application and Developer ID Installer identities.
- `SAGEJS_APPLE_NOTARY_KEY_BASE64`, `SAGEJS_APPLE_NOTARY_KEY_ID`, and
  `SAGEJS_APPLE_NOTARY_ISSUER_ID`: an App Store Connect API key used by
  `notarytool`.
- Optionally `SAGEJS_MACOS_SIGN_ID` and `SAGEJS_MACOS_INSTALLER_ID` when the
  certificate names differ from the defaults in `scripts/release-macos.sh`.

Secret signing material is written only under the ephemeral Actions runner
temporary directory. The fallback Windows PFX is deleted immediately after
signing; Azure Artifact Signing keeps its private key in the service, and the
macOS runner itself is discarded after the job.

## Release checklist

1. Update the root and four native package versions together, update release
   notes, and run `pnpm install --lockfile-only`.
2. Run `pnpm test:release` and focused release tests. Review known failures in
   broad development suites, but do not let pre-existing diagnostics block an
   early-alpha release after the release-critical checks pass.
3. Create and push an annotated `vX.Y.Z` tag at that green commit.
4. The tag workflow rebuilds and relocation-tests every executable. It signs
   Windows when the selected Azure or PFX mode is configured, Developer ID-signs
   macOS, executes the signed binaries, notarizes
   the macOS ZIP and PKG, staples the PKG, and performs platform verification.
5. The publish job uploads the archives, checksums, PKG, and `install.sh` to the
   GitHub release. It then publishes all four native npm packages and finally
   publishes `@sagemath/sagejs` with the `latest` tag.
6. Test a clean `curl | sh` install, a clean global npm install, Jupyter kernel
   registration, and Gatekeeper/SmartScreen behavior on real target machines.

Browser performance shards always upload their reviewed-baseline and
browser/native comparison receipts. Relative timing regressions are reported as
warnings rather than release blockers because the browser and native timings
come from independent shared GitHub runners. Correctness, authenticated route
selection, workload timeouts, and the absolute interruption safety ceiling
remain blocking gates.

If validation of `vX.Y.Z` exposes a release-only defect before publication,
fix it in a new commit and use the append-only recovery tag
`vX.Y.Z+release.N`. Never move the original tag. Recovery tags publish the same
npm version, must use a positive monotonically increasing integer, and reruns
verify any package versions and dist-tags that are already public.

The tag workflow intentionally fails when macOS signing/notarization or the npm
Trusted Publisher relationship is absent. Windows unsigned mode is an explicit
early-alpha exception and is recorded in the Actions job summary; it is never
silently selected in place of a requested Azure or PFX mode.

## Local signing checks

On macOS, configure a `notarytool` Keychain profile and run:

```sh
pnpm release:macos
```

This produces and verifies `sagejs-macos-arm64.zip` and the stapled PKG. On
Windows, set the two PFX environment variables and run:

```powershell
pnpm release:windows:sign
```

Both scripts verify signatures and execute the signed Jupyter/native runtime
before packaging or publishing.
