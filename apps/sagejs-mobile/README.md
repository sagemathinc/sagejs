# Sage.js Mobile

This is the offline React Native host for Sage.js on iPhone and iPad. The same
shell remains buildable on Android. It uses React Native's new architecture and
hosts the production browser engine in `WKWebView`/Android WebView; it does not
embed Node.js or call a remote computation service.

## Security and offline contract

The application bundles one content-addressed
`@sagemath/sagejs-flint-wasm` production artifact. `assets:prepare` consumes
`packages/flint-wasm/dist/production-manifest.json` and its matching build
receipt, verifies every digest, copies the complete declared closure, hashes the
browser host and mobile shell, and writes a mobile asset manifest. Both Xcode
and Gradle run `assets:verify` before compiling. A missing, partial, stale, or
unattested runtime is a build failure. There is no remote-runtime fallback.

The Android application intentionally requests no Internet permission. The iOS
WebView permits navigation only inside its bundled runtime directory. The page
CSP has no remote origin. Evaluated code remains in a worker and has no native
object. A 256-bit per-WebView capability seals the page/native message protocol
against worker-forged messages. The allowlist contains only worksheet changes,
runtime status, bounded source/JSON sharing, lifecycle, reset, and interruption;
there is no generic native call, URL opener, filesystem path, or credential
operation.

## Prepare and build

Requirements are Node 22.22.2 or newer and pnpm. The mobile package has an
independent lockfile so it can be built without joining the root workspace.

```sh
cd apps/sagejs-mobile
pnpm install --ignore-workspace --frozen-lockfile

# First produce the exact Wasm artifact documented by packages/flint-wasm.
pnpm assets:prepare
pnpm assets:verify
pnpm test:all
```

On macOS with Xcode and CocoaPods:

```sh
bundle install
(cd ios && bundle exec pod install)
pnpm ios -- --simulator "iPhone 17 Pro"
pnpm ios -- --simulator "iPad Pro 13-inch (M5)"
```

On a configured Android SDK:

```sh
pnpm android
# or: (cd android && ./gradlew assembleDebug)
```

Release signing is deliberately not stored here. The Android release target
does not use the template debug keystore. iOS release archives require the
SageMath team identifier, App Store provisioning, and a reviewed version/build
number.

## Product behavior

- Versioned `.sagejs` worksheet documents are autosaved locally and shown in a
  recent-document browser.
- `.sage`, `.py`, and `.sagejs` documents can be imported from Files/iCloud and
  exported through the system document picker.
- Source and explicitly requested plot/data JSON can be shared through native
  share sheets.
- The iPad layout provides a persistent split document/editor view; compact
  widths use a sheet. The runtime editor handles Command/Control+Enter, labels
  execution controls, and exposes output/graphics as live regions.
- Timeout is enforced through worker replacement. Backgrounding optionally
  interrupts computation. A WebContent process crash reconstructs the runtime
  from the most recent autosaved worksheet.
- The mobile app uses the same single-threaded browser semantics. Memory target
  is recorded as a device/release constraint until the Wasm module itself
  publishes a hard maximum.

## Validation boundary

TypeScript, Jest, protocol, asset-integrity, and offline-denial tests run on any
development host. Xcode and iOS simulators require macOS. Signed physical-device
and TestFlight claims must be backed by two receipts—one current iPhone and one
current iPad—following [physical-device-feasibility.md](docs/physical-device-feasibility.md).
The committed receipt fixtures are explicitly `blocked`, not fabricated passes.

See [app-review-notes.md](docs/app-review-notes.md) for the proposed review
disclosure and [integration-handoff.md](docs/integration-handoff.md) for the
root-workspace steps deliberately left to the integration lane.
