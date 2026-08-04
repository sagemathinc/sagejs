#!/bin/sh
set -eu

repository="sagemathinc/sagejs"
install_directory="${SAGEJS_INSTALL_DIR:-${HOME}/.local/bin}"
requested_version="${SAGEJS_VERSION:-latest}"

fail() {
  echo "sagejs installer: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"

if [ -n "${SAGEJS_INSTALL_PLATFORM:-}" ]; then
  platform="$SAGEJS_INSTALL_PLATFORM"
else
  system=$(uname -s)
  machine=$(uname -m)
  case "$system:$machine" in
    Linux:x86_64|Linux:amd64) platform="linux-x64" ;;
    Linux:aarch64|Linux:arm64) platform="linux-arm64" ;;
    Darwin:arm64|Darwin:aarch64) platform="macos-arm64" ;;
    *) fail "unsupported platform $system/$machine" ;;
  esac
fi

case "$platform" in
  linux-x64|linux-arm64) archive="sagejs-$platform.tar.xz" ;;
  macos-arm64) archive="sagejs-$platform.zip" ;;
  *) fail "unsupported platform override $platform" ;;
esac

if [ -n "${SAGEJS_DOWNLOAD_BASE_URL:-}" ]; then
  download_base=${SAGEJS_DOWNLOAD_BASE_URL%/}
elif [ "$requested_version" = "latest" ]; then
  download_base="https://github.com/$repository/releases/latest/download"
else
  case "$requested_version" in
    v*) release_tag="$requested_version" ;;
    *) release_tag="v$requested_version" ;;
  esac
  download_base="https://github.com/$repository/releases/download/$release_tag"
fi

temporary_directory=$(mktemp -d 2>/dev/null || mktemp -d -t sagejs-install)
trap 'rm -rf "$temporary_directory"' EXIT HUP INT TERM
archive_path="$temporary_directory/$archive"
checksum_path="$archive_path.sha256"

echo "Downloading $archive"
curl --fail --location --silent --show-error \
  --output "$archive_path" "$download_base/$archive"
curl --fail --location --silent --show-error \
  --output "$checksum_path" "$download_base/$archive.sha256"

expected=$(awk 'NR == 1 { print $1 }' "$checksum_path")
case "$expected" in
  *[!0-9A-Fa-f]*|'') fail "invalid SHA-256 file for $archive" ;;
esac
[ "${#expected}" -eq 64 ] || fail "invalid SHA-256 length for $archive"
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$archive_path" | awk '{ print $1 }')
elif command -v shasum >/dev/null 2>&1; then
  actual=$(shasum -a 256 "$archive_path" | awk '{ print $1 }')
else
  fail "sha256sum or shasum is required"
fi
[ "$actual" = "$expected" ] || fail "SHA-256 verification failed for $archive"

case "$platform" in
  linux-*) tar -xJf "$archive_path" -C "$temporary_directory" ;;
  macos-*)
    command -v unzip >/dev/null 2>&1 || fail "unzip is required"
    unzip -q "$archive_path" -d "$temporary_directory"
    ;;
esac

distribution="$temporary_directory/sagejs-$platform"
[ -x "$distribution/sagejs" ] || fail "archive does not contain sagejs"
[ -x "$distribution/sagepython" ] || fail "archive does not contain sagepython"
mkdir -p "$install_directory"
for executable in sagejs sagepython; do
  temporary_target="$install_directory/.$executable.tmp.$$"
  install -m 755 "$distribution/$executable" "$temporary_target"
  mv -f "$temporary_target" "$install_directory/$executable"
done

installed_version=$($install_directory/sagejs --version)
echo "Installed $installed_version in $install_directory"
case ":${PATH}:" in
  *:"$install_directory":*) ;;
  *) echo "Add $install_directory to PATH to run sagejs." ;;
esac
echo "To use Jupyter, run: sagejs --install-jupyter-kernel"
