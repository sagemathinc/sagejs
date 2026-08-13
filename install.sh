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
temporary_link=""
temporary_launcher=""
generation=""
cleanup() {
  rm -rf "$temporary_directory"
  [ -z "$temporary_link" ] || rm -f "$temporary_link"
  [ -z "$temporary_launcher" ] || rm -f "$temporary_launcher"
  [ -z "$generation" ] || rm -rf "$generation"
}
trap cleanup EXIT HUP INT TERM
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
  sha256_file() { sha256sum "$1" | awk '{ print $1 }'; }
elif command -v shasum >/dev/null 2>&1; then
  sha256_file() { shasum -a 256 "$1" | awk '{ print $1 }'; }
else
  fail "sha256sum or shasum is required"
fi
actual=$(sha256_file "$archive_path")
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
# Install both programs into one immutable, versioned directory, validate that
# complete generation, and then atomically switch a single symlink. This makes
# an interrupted upgrade leave either the old pair or the new pair active.
install_root="$install_directory/.sagejs-installations"
mkdir -p "$install_root"
generation="$install_root/.staging.$$"
rm -rf "$generation"
mkdir "$generation"
for executable in sagejs sagepython; do
  install -m 755 "$distribution/$executable" "$generation/$executable"
done
installed_version=$($generation/sagejs --version) || fail "installed sagejs failed its version probe"
generation_name=$(printf '%s' "$installed_version" | sed 's/[^A-Za-z0-9._-]/-/g')
[ -n "$generation_name" ] || fail "installed sagejs returned an invalid version"
generation_name="$generation_name-$actual"
generation_target="$install_root/$generation_name"
if [ -e "$generation_target" ]; then
  generation_matches=1
  for executable in sagejs sagepython; do
    existing="$generation_target/$executable"
    if [ ! -f "$existing" ] || [ -L "$existing" ] || [ ! -x "$existing" ] || \
      [ "$(sha256_file "$existing")" != "$(sha256_file "$distribution/$executable")" ]; then
      generation_matches=0
      break
    fi
  done
  if [ "$generation_matches" -eq 1 ]; then
    rm -rf "$generation"
  else
    # Never reuse or replace a damaged immutable generation. Publish the newly
    # validated staging tree under a distinct repair name, then point current
    # at it atomically. Existing processes keep their old directory identity.
    generation_name="$generation_name-repair-$$"
    generation_target="$install_root/$generation_name"
    [ ! -e "$generation_target" ] || fail "repair generation already exists"
    mv "$generation" "$generation_target"
  fi
else
  mv "$generation" "$generation_target"
fi
generation=""
link_target=".sagejs-installations/$generation_name"
for executable in sagejs sagepython; do
  launcher="$install_directory/$executable"
  if [ -e "$launcher" ] || [ -L "$launcher" ]; then
    [ -L "$launcher" ] || fail "$launcher is not managed by the Sage.js installer"
    [ "$(readlink "$launcher")" = ".sagejs-current/$executable" ] || \
      fail "$launcher has an unexpected link target"
  fi
done
temporary_link="$install_directory/.sagejs-current.$$"
ln -s "$link_target" "$temporary_link"
if [ "${SAGEJS_INSTALL_FAIL_BEFORE_SWITCH:-0}" = "1" ]; then
  fail "injected failure before atomic installation switch"
fi
if mv -fT "$temporary_link" "$install_directory/.sagejs-current" 2>/dev/null; then
  : # GNU mv: -T prevents following the existing directory symlink.
else
  # BSD/macOS mv uses -h for the same symlink-safe replacement semantics.
  mv -fh "$temporary_link" "$install_directory/.sagejs-current"
fi
temporary_link=""
for executable in sagejs sagepython; do
  launcher="$install_directory/$executable"
  if [ ! -e "$launcher" ] && [ ! -L "$launcher" ]; then
    temporary_launcher="$install_directory/.$executable.link.$$"
    ln -s ".sagejs-current/$executable" "$temporary_launcher"
    mv -f "$temporary_launcher" "$launcher"
    temporary_launcher=""
  fi
done

echo "Installed $installed_version in $install_directory"
case ":${PATH}:" in
  *:"$install_directory":*) ;;
  *) echo "Add $install_directory to PATH to run sagejs." ;;
esac
echo "To use Jupyter, run: sagejs --install-jupyter-kernel"
