# Releasing Sage.js

A stable Sage.js release publishes one tested set of native executables through
GitHub and npm. The npm platform packages contain the same signed/notarized
bytes as the direct archives; the public `@sagemath/sagejs` package is published
last so its exact optional dependencies are already available.

## Protected GitHub environments

Tagged releases use two protected environments whose deployment tag policy is
exactly `v*`:

- `sagejs-signing` holds Apple and Windows signing credentials. The unprivileged
  platform jobs build and test executables without these credentials. Separate
  tag-only signing jobs download checksummed tested inputs and receive the
  environment secrets only after maintainer approval.
- `sagejs-release` holds `NPM_TOKEN` and gates the final one-way GitHub/npm
  publication job after every signed platform artifact is available.

Both environments require a maintainer review. When the sole configured
reviewer may also initiate a release, self-review prevention must remain off;
add a second trusted reviewer before enabling it. Do not duplicate these values
as repository-wide secrets.

## Required environment secrets

- In `sagejs-release`, `NPM_TOKEN` is an automation token allowed to publish
  public packages in the `@sagemath` scope.
- The remaining values belong to `sagejs-signing`.
- The preferred Windows path is Azure Artifact Signing with the repository
  environment variable `SAGEJS_WINDOWS_SIGNING_MODE=azure`; secrets
  `SAGEJS_AZURE_CLIENT_ID`, `SAGEJS_AZURE_TENANT_ID`, and
  `SAGEJS_AZURE_SUBSCRIPTION_ID`; and environment variables
  `SAGEJS_ARTIFACT_SIGNING_ENDPOINT`, `SAGEJS_ARTIFACT_SIGNING_ACCOUNT`, and
  `SAGEJS_ARTIFACT_SIGNING_PROFILE`. The Entra identity uses GitHub OIDC and
  needs the Artifact Signing Certificate Profile Signer role.
- As a fallback, leave `SAGEJS_WINDOWS_SIGNING_MODE` unset and configure
  `SAGEJS_WINDOWS_CERTIFICATE_PFX_BASE64` and
  `SAGEJS_WINDOWS_CERTIFICATE_PASSWORD` with an exportable Authenticode code
  signing certificate.
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

### Configure Apple credentials from a trusted Mac

In Keychain Access, select the `login` keychain and **My Certificates**. Expand
the Developer ID Application and Developer ID Installer entries and confirm
that each has its private key underneath it. Command-select the two top-level
certificate entries, choose **File -> Export Items**, and export them together
as one password-protected `sagejs-developer-id.p12` file. A public certificate
without its private key is not a signing identity and is not sufficient.

Keychain Access can encode PKCS#12 files with legacy RC2 encryption. OpenSSL 3
disables that cipher by default, so validate the resulting container with:

```sh
openssl pkcs12 -legacy -in /path/to/sagejs-developer-id.p12 -info -noout
```

The output must contain two private-key bags, normally shown as two `Shrouded
Keybag` entries. macOS `security import`, which the release workflow uses,
accepts this Keychain-generated container directly.

In App Store Connect, create a dedicated **Team** API key for Sage.js
notarization and download its one-time `AuthKey_*.p8` file. Individual API keys
cannot authenticate `notarytool`. Record the App Store Connect Key ID and
Issuer ID; the Issuer ID is a UUID and is not the Apple developer Team ID.
Validate the new key locally without replacing an existing Keychain profile:

```sh
xcrun notarytool store-credentials sagejs-ci-test \
  --key /path/to/AuthKey_KEYID.p8 \
  --key-id KEYID \
  --issuer ISSUER_UUID
xcrun notarytool history --keychain-profile sagejs-ci-test \
  --output-format json >/dev/null
```

Upload both files directly from the trusted Mac; do not copy them into the
repository. Run these commands in Bash rather than sourcing a saved script, so
the entered values disappear with the process:

```bash
repo=sagemathinc/sagejs
environment=sagejs-signing
p12=/path/to/sagejs-developer-id.p12
api_key=/path/to/AuthKey_KEYID.p8

base64 < "$p12" | tr -d '\n' | \
  gh secret set SAGEJS_APPLE_CERTIFICATE_P12_BASE64 -R "$repo" -e "$environment"
base64 < "$api_key" | tr -d '\n' | \
  gh secret set SAGEJS_APPLE_NOTARY_KEY_BASE64 -R "$repo" -e "$environment"

read -r -s -p "P12 export password: " certificate_password
printf '\n'
read -r -p "App Store Connect Key ID: " notary_key_id
read -r -p "App Store Connect Issuer ID UUID: " notary_issuer_id

printf '%s' "$certificate_password" | \
  gh secret set SAGEJS_APPLE_CERTIFICATE_PASSWORD -R "$repo" -e "$environment"
printf '%s' "$notary_key_id" | \
  gh secret set SAGEJS_APPLE_NOTARY_KEY_ID -R "$repo" -e "$environment"
printf '%s' "$notary_issuer_id" | \
  gh secret set SAGEJS_APPLE_NOTARY_ISSUER_ID -R "$repo" -e "$environment"

unset certificate_password notary_key_id notary_issuer_id
```

The scalar values travel over standard input rather than appearing in shell
history or process arguments. Confirm the resulting names, never their values,
with
`gh secret list -R sagemathinc/sagejs -e sagejs-signing`.

## Release checklist

1. Update the root and four native package versions together, update release
   notes, and run `pnpm install --lockfile-only`.
2. Run `pnpm test:release`, the focused suites, and then wait for the complete
   `main` workflow to pass on Linux x64/arm64, Windows x64, and macOS arm64.
3. Create and push an annotated `vX.Y.Z` tag at that green commit.
4. The tag workflow rebuilds and tests every executable. It Authenticode-signs
   Windows, Developer ID-signs macOS, executes the signed binaries, notarizes
   the macOS ZIP and PKG, staples the PKG, and performs platform verification.
5. The publish job uploads the archives, checksums, PKG, and `install.sh` to the
   GitHub release. It then publishes all four native npm packages and finally
   publishes `@sagemath/sagejs` with the `latest` tag.
6. Test a clean `curl | sh` install, a clean global npm install, Jupyter kernel
   registration, and Gatekeeper/SmartScreen behavior on real target machines.

The tag workflow intentionally fails when any signing or registry credential
is absent. It never substitutes an unsigned desktop artifact.

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
