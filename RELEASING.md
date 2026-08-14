# Releasing Sage.js

The Sage.js 0.2 release is a GitHub binary release for four targets:

| Target | Public artifact | Publisher identity |
| --- | --- | --- |
| Linux x64 | `sagejs-linux-x64.tar.xz` | GitHub release + SHA-256; glibc 2.28 floor |
| Linux arm64 | `sagejs-linux-arm64.tar.xz` | GitHub release + SHA-256; glibc 2.28 floor |
| Apple Silicon macOS | ZIP and PKG | Developer ID signed and Apple-notarized |
| Windows x64 | `sagejs-windows-x64-unsigned.zip` | **Unsigned**; GitHub release + SHA-256 only |

This release does not publish npm packages. Windows Authenticode signing is a
future release gate; the filename, archive notice, machine-readable manifest,
release notes, and provenance all state that the current executable is
unsigned.

Every platform builds and tests both `sagejs` and `sagepython` from the same
tag with Node.js 26.7.0. The publication job downloads only the exact
immutable artifact IDs produced by its four dependencies. It rejects missing,
unexpected, renamed, or checksum-mismatched files, emits `SHA256SUMS` and
`release-provenance.json`, creates a private draft, and makes the release public
only after the complete asset upload succeeds.

## Protected environments and tags

Configure two GitHub environments with deployment tag policy `v*`:

- `sagejs-signing` contains only Apple signing and notarization credentials.
  The unprivileged macOS job builds and tests with no secrets. A separate
  protected job downloads that exact tested input, verifies it, signs and
  notarizes it, and uploads the final artifact.
- `sagejs-release` gates the final one-way transition from a private draft to a
  public stable GitHub release. It currently needs no secret beyond GitHub's
  environment-scoped approval and job token.

Both environments require maintainer approval. If the only reviewer also
starts the release, self-review prevention must remain off; add another trusted
reviewer before enabling it. Administrator bypass is disabled, so the approval
gate also applies to repository administrators.

Protect `refs/tags/v*` against deletion and non-fast-forward changes. Do not
move or reuse a tag. The workflow accepts exactly:

- `vX.Y.Z-rc.N` (`N >= 1`): build all four targets and exercise protected Apple
  signing/notarization, but structurally skip public release creation;
- `vX.Y.Z`: require the tag to equal the source package version, run the same
  gates, then enter `sagejs-release` for stable publication.

Other `v*` spellings fail policy validation. Use `v0.2.0-rc.1` to prove the
real Apple credentials before creating the immutable `v0.2.0` tag.

## Apple credentials

Store these five values in `sagejs-signing`, never as repository-wide secrets:

- `SAGEJS_APPLE_CERTIFICATE_P12_BASE64`
- `SAGEJS_APPLE_CERTIFICATE_PASSWORD`
- `SAGEJS_APPLE_NOTARY_KEY_BASE64`
- `SAGEJS_APPLE_NOTARY_KEY_ID`
- `SAGEJS_APPLE_NOTARY_ISSUER_ID`

Optionally set `SAGEJS_MACOS_SIGN_ID` and `SAGEJS_MACOS_INSTALLER_ID` when the
certificate names differ from the defaults in `scripts/release-macos.sh`.

### Export the Developer ID identities

In Keychain Access, select the `login` keychain and **My Certificates**. Expand
the Developer ID Application and Developer ID Installer entries and confirm
that each has its private key underneath it. Command-select the two top-level
certificate entries, choose **File -> Export Items**, and export them together
as one password-protected `sagejs-developer-id.p12`. A public certificate
without its private key is not a signing identity.

Keychain Access may encode PKCS#12 with legacy RC2 encryption. OpenSSL 3
disables that cipher by default, so inspect it with:

```sh
openssl pkcs12 -legacy -in /path/to/sagejs-developer-id.p12 -info -noout
```

The output must contain two private-key bags, normally two `Shrouded Keybag`
entries. The workflow's macOS `security import` accepts this container.

### Create and validate the notarization key

In App Store Connect, create a dedicated **Team** API key and download its
one-time `AuthKey_*.p8`. Individual API keys do not authenticate `notarytool`.
Record the App Store Connect Key ID and Issuer ID. The Issuer ID is a UUID, not
the Apple developer Team ID.

```sh
xcrun notarytool store-credentials sagejs-ci-test \
  --key /path/to/AuthKey_KEYID.p8 \
  --key-id KEYID \
  --issuer ISSUER_UUID
xcrun notarytool history --keychain-profile sagejs-ci-test \
  --output-format json >/dev/null
```

### Upload from the trusted Mac

Run this in an interactive Bash process rather than saving or sourcing a file:

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

Confirm names, never values:

```sh
gh secret list -R sagemathinc/sagejs -e sagejs-signing
```

The signing job writes decoded credentials only under the ephemeral runner
temporary directory, imports the identities into a temporary Keychain, and
deletes both after use. It signs the two executables with the hardened runtime,
signs the PKG, notarizes the ZIP and PKG, staples the PKG, and performs
`codesign`, `pkgutil`, `stapler`, and `spctl` checks.

## Release procedure

1. Update the root and all four native package versions together, update the
   release notes, refresh `pnpm-lock.yaml`, and run:

   ```sh
   pnpm test:release -- --tag vX.Y.Z
   ```

2. Require the complete unprivileged CI matrix to pass at that exact commit.
   Review the Linux portability/readiness receipts, Windows unsigned manifest,
   Apple deployment-floor evidence, licenses, checksums, and runtime smokes.
3. Push an annotated `vX.Y.Z-rc.1` tag. Approve `sagejs-signing`; inspect the
   resulting signed/notarized macOS artifact and Apple submission result. No
   GitHub release is created for this tag.
4. After correcting any candidate issue at a new commit/version as appropriate,
   push the annotated stable `vX.Y.Z` tag. Approve `sagejs-signing`, then approve
   `sagejs-release` only after all four final artifacts are green.
5. The protected publication job verifies the stable tag/version agreement,
   source commit, upload-artifact IDs/digests, per-platform checksums, exact file
   sets, and explicit signature policies. It creates a new private draft and
   refuses to overwrite an existing release or asset. Its last operation makes
   the complete draft public and marks it latest.
6. Download every public asset on clean target machines. Recompute checksums,
   test normal browser-origin security metadata, and run `--version`, Jupyter
   self-test, and native factorization. Never instruct users to disable
   Gatekeeper, SmartScreen, antivirus, or checksum verification.

The workflow intentionally cannot publish a release candidate, cannot publish
without accepted Apple notarization, cannot consume unselected intermediate
artifacts, and cannot use `--clobber` to replace released bytes.

## Recovery

If publication fails before the final step, the GitHub release remains a
private draft. Inspect the failure and its assets. Delete that draft only when
the exact tagged workflow is going to be rerun; never replace bytes in a public
release. Once public, withdraw an unsafe version explicitly and publish a new
patch release instead of moving its tag.

If a signing credential may have leaked, stop publication and rotate or revoke
it through Apple and GitHub. Deleting a release is not credential revocation.

## Local macOS check

With the Developer ID identities and a working `notarytool` Keychain profile:

```sh
pnpm release:macos
```

This produces and verifies the signed/notarized ZIP and stapled PKG. Local
output is diagnostic evidence only; the public workflow consumes its own exact
tested CI inputs and never a maintainer's rebuild.
