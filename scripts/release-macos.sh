#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

TEAM_ID="${SAGEJS_APPLE_TEAM_ID:-BVF94G2MB4}"
APP_IDENTITY="${SAGEJS_MACOS_SIGN_ID:-Developer ID Application: William STEIN (${TEAM_ID})}"
INSTALLER_IDENTITY="${SAGEJS_MACOS_INSTALLER_ID:-Developer ID Installer: William STEIN (${TEAM_ID})}"
NOTARY_PROFILE="${SAGEJS_MACOS_NOTARY_PROFILE:-notary-profile}"
ENTITLEMENTS="${SAGEJS_MACOS_ENTITLEMENTS:-$ROOT/scripts/macos-entitlements.plist}"
SKIP_NOTARIZE=0
SKIP_BUILD=0
UNSIGNED=0
PUBLISH_TAG=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --unsigned) UNSIGNED=1; shift ;;
    --skip-notarize) SKIP_NOTARIZE=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --publish)
      [[ $# -ge 2 ]] || { echo "--publish requires a tag" >&2; exit 2; }
      PUBLISH_TAG="$2"; shift 2 ;;
    -h|--help)
      cat <<'EOF'
Usage: pnpm release:macos [-- --unsigned] [--skip-notarize] [--skip-build]
                           [--publish TAG]

Build and relocation-test both SEA executables, sign them with a Developer ID,
and create a signed ZIP archive and installer. By default both deliverables are
notarized and the installer ticket is stapled. --publish uploads the completed
assets to an existing GitHub release. --skip-build reuses CI-tested executables.

--unsigned creates and clean-room tests a ZIP release candidate without Apple
credentials. macOS SEA executables retain their required ad-hoc signatures,
but receive no Developer ID signature and are not notarized. The resulting ZIP
is deliberately not publishable.

Configuration:
  SAGEJS_APPLE_TEAM_ID
  SAGEJS_MACOS_SIGN_ID
  SAGEJS_MACOS_INSTALLER_ID
  SAGEJS_MACOS_NOTARY_PROFILE
  SAGEJS_MACOS_ENTITLEMENTS
EOF
      exit 0
      ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
done

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "The macOS release must be built on macOS." >&2
  exit 2
fi

ARCH="$(uname -m)"
case "$ARCH" in
  arm64) PLATFORM="macos-arm64" ;;
  x86_64) PLATFORM="macos-x64" ;;
  *) echo "Unsupported macOS architecture: $ARCH" >&2; exit 2 ;;
esac

if [[ $UNSIGNED -eq 1 && $SKIP_NOTARIZE -eq 1 ]]; then
  echo "--unsigned already excludes notarization; do not combine it with --skip-notarize" >&2
  exit 2
fi
if [[ $UNSIGNED -eq 1 && -n "$PUBLISH_TAG" ]]; then
  echo "Unsigned macOS release candidates cannot be published" >&2
  exit 2
fi

required_commands=(codesign ditto node shasum)
if [[ $SKIP_BUILD -eq 0 ]]; then
  required_commands+=(pnpm)
fi
if [[ $UNSIGNED -eq 0 ]]; then
  required_commands+=(pkgbuild pkgutil productsign spctl xcrun)
fi
for command in "${required_commands[@]}"; do
  command -v "$command" >/dev/null || {
    echo "Required command not found: $command" >&2
    exit 2
  }
done

BUILDER_NODE="${SAGEJS_RELEASE_BUILDER_NODE:-}"
if [[ $SKIP_BUILD -eq 0 ]]; then
  BUILDER_NODE="$(command -v node)"
  if command -v otool >/dev/null; then
    NON_SYSTEM_NODE_LIBRARIES="$(
      otool -L "$BUILDER_NODE" |
        tail -n +2 |
        awk '{print $1}' |
        grep -Ev '^(@|/usr/lib/|/System/Library/)' || true
    )"
    if [[ -n "$NON_SYSTEM_NODE_LIBRARIES" ]]; then
      echo "The SEA builder Node is not relocatable: $BUILDER_NODE" >&2
      echo "$NON_SYSTEM_NODE_LIBRARIES" >&2
      echo "Use the official macOS arm64 Node distribution, not Homebrew Node." >&2
      exit 2
    fi
  fi
  echo "Building and relocation-testing macOS SEA executables"
  pnpm test:sea
else
  [[ -x build/sea/sagejs && -x build/sea/sagepython ]] || {
    echo "--skip-build requires build/sea/sagejs and sagepython" >&2
    exit 2
  }
fi

RELEASE_ROOT="$ROOT/build/release"
DIST="$RELEASE_ROOT/sagejs-$PLATFORM"
PAYLOAD="$RELEASE_ROOT/.sagejs-$PLATFORM-payload"
UNSIGNED_PKG="$RELEASE_ROOT/.sagejs-$PLATFORM-unsigned.pkg"
ARCHIVE="$RELEASE_ROOT/sagejs-$PLATFORM.zip"
PACKAGE="$RELEASE_ROOT/sagejs-$PLATFORM.pkg"
ARCHIVE_CHECKSUM="$ARCHIVE.sha256"
PACKAGE_CHECKSUM="$PACKAGE.sha256"
BENCHMARK_REPORT="$RELEASE_ROOT/sagejs-$PLATFORM-benchmark.json"
rm -rf \
  "$DIST" "$PAYLOAD" "$UNSIGNED_PKG" "$ARCHIVE" "$PACKAGE" \
  "$ARCHIVE_CHECKSUM" "$PACKAGE_CHECKSUM" "$BENCHMARK_REPORT"
mkdir -p "$DIST/licenses"
if [[ $UNSIGNED -eq 0 ]]; then
  mkdir -p "$PAYLOAD/usr/local/bin"
fi
cp build/sea/sagejs build/sea/sagepython "$DIST/"
cp LICENSE README.md DISTRIBUTION.md "$DIST/"
cp licenses/* "$DIST/licenses/"

if [[ $UNSIGNED -eq 1 ]]; then
  for executable in "$DIST/sagejs" "$DIST/sagepython"; do
    signature="$(codesign --display --verbose=4 "$executable" 2>&1)"
    [[ "$signature" == *"Signature=adhoc"* ]] || {
      echo "Unsigned candidate contains a non-ad-hoc signature: $executable" >&2
      exit 1
    }
    [[ "$signature" == *"TeamIdentifier=not set"* ]] || {
      echo "Unsigned candidate unexpectedly has an Apple team identifier: $executable" >&2
      exit 1
    }
    codesign --verify --deep --strict --verbose=2 "$executable"
  done
else
  for executable in "$DIST/sagejs" "$DIST/sagepython"; do
    echo "Signing $(basename "$executable") with $APP_IDENTITY"
    codesign --force --timestamp --options runtime \
      --entitlements "$ENTITLEMENTS" --sign "$APP_IDENTITY" "$executable"
    codesign --verify --deep --strict --verbose=2 "$executable"
  done
fi

for executable in "$DIST/sagejs" "$DIST/sagepython"; do
  "$executable" --version
done
"$DIST/sagepython" --jupyter-kernel-self-test
FACTOR_OUTPUT="$(printf 'factor(2026)\n' | "$DIST/sagejs")"
[[ "$FACTOR_OUTPUT" == *"2 * 1013"* ]] || {
  echo "sagejs failed its native factorization smoke test" >&2
  exit 1
}

ditto -c -k --keepParent "$DIST" "$ARCHIVE"
(
  cd "$RELEASE_ROOT"
  shasum -a 256 "$(basename "$ARCHIVE")" > "$(basename "$ARCHIVE").sha256"
)

SAGEJS_RELEASE_MACOS_ARCHIVE="$ARCHIVE" \
SAGEJS_RELEASE_MACOS_SIGNATURE="$([[ $UNSIGNED -eq 1 ]] && echo adhoc || echo developer-id)" \
SAGEJS_RELEASE_SOURCE_ROOT="$ROOT" \
  node --test test/release-macos-arm64.cjs
if [[ "$ARCH" == "arm64" ]]; then
  SAGEJS_RELEASE_BUILDER_NODE="$BUILDER_NODE" \
    node bench/release-candidate-macos.cjs \
    --archive "$ARCHIVE" --output "$BENCHMARK_REPORT"
fi

if [[ $UNSIGNED -eq 0 ]]; then
  cp "$DIST/sagejs" "$DIST/sagepython" "$PAYLOAD/usr/local/bin/"
  VERSION="$(node -p "require('./package.json').version")"
  pkgbuild --root "$PAYLOAD" \
    --identifier org.sagemath.sagejs.cli \
    --version "$VERSION" \
    --install-location / \
    "$UNSIGNED_PKG"
  productsign --sign "$INSTALLER_IDENTITY" "$UNSIGNED_PKG" "$PACKAGE"
  pkgutil --check-signature "$PACKAGE"

  if [[ $SKIP_NOTARIZE -eq 0 ]]; then
    echo "Notarizing downloadable ZIP using Keychain profile $NOTARY_PROFILE"
    xcrun notarytool submit "$ARCHIVE" \
      --keychain-profile "$NOTARY_PROFILE" --wait --progress
    echo "Notarizing installer package using Keychain profile $NOTARY_PROFILE"
    xcrun notarytool submit "$PACKAGE" \
      --keychain-profile "$NOTARY_PROFILE" --wait --progress
    xcrun stapler staple "$PACKAGE"
    xcrun stapler validate "$PACKAGE"
    spctl --assess --type execute --verbose=4 "$DIST/sagejs"
    spctl --assess --type execute --verbose=4 "$DIST/sagepython"
    spctl --assess --type install --verbose=4 "$PACKAGE"
  else
    echo "Skipping notarization by request"
  fi

  rm -rf "$PAYLOAD" "$UNSIGNED_PKG"
  (
    cd "$RELEASE_ROOT"
    shasum -a 256 "$(basename "$PACKAGE")" > "$(basename "$PACKAGE").sha256"
  )
fi

if [[ -n "$PUBLISH_TAG" ]]; then
  command -v gh >/dev/null || { echo "gh is required for --publish" >&2; exit 2; }
  gh release upload "$PUBLISH_TAG" \
    "$ARCHIVE" "$ARCHIVE.sha256" "$PACKAGE" "$PACKAGE.sha256" --clobber
fi

echo
if [[ $UNSIGNED -eq 1 ]]; then
  echo "Unsigned macOS release candidate (ad-hoc signatures; do not publish):"
else
  echo "Signed macOS release assets:"
fi
echo "  $ARCHIVE"
echo "  $ARCHIVE_CHECKSUM"
if [[ "$ARCH" == "arm64" ]]; then
  echo "  $BENCHMARK_REPORT"
fi
if [[ $UNSIGNED -eq 0 ]]; then
  echo "  $PACKAGE"
  echo "  $PACKAGE_CHECKSUM"
fi
