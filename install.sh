#!/bin/sh
set -eu

repository="sagemathinc/sagejs"
requested_version="${SAGEJS_VERSION:-latest}"

fail() {
  echo "sagejs installer: $*" >&2
  exit 1
}

command -v curl >/dev/null 2>&1 || fail "curl is required"

install_directory_was_default=0
if [ -n "${SAGEJS_INSTALL_DIR:-}" ]; then
  install_directory=$SAGEJS_INSTALL_DIR
elif [ "$(id -u)" -eq 0 ]; then
  install_directory=/usr/local/bin
  install_directory_was_default=1
else
  [ -n "${HOME:-}" ] || fail "HOME is not set; set SAGEJS_INSTALL_DIR explicitly"
  install_directory="$HOME/.local/bin"
  install_directory_was_default=1
fi

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
  linux-x64|linux-arm64)
    command -v tar >/dev/null 2>&1 || fail "tar is required"
    command -v xz >/dev/null 2>&1 || fail "xz is required (the Debian/Ubuntu package is xz-utils)"
    archive="sagejs-$platform.tar.xz"
    ;;
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
if ! installed_version=$("$distribution/sagejs" --version 2>&1); then
  case "$installed_version" in
    *libatomic.so.1*)
      fail "the Linux runtime needs libatomic.so.1; on Debian/Ubuntu run: sudo apt-get install libatomic1"
      ;;
    *) fail "the downloaded sagejs executable could not run: $installed_version" ;;
  esac
fi
if [ ! -d "$install_directory" ]; then
  install -d -m 755 "$install_directory"
fi
for executable in sagejs sagepython; do
  temporary_target="$install_directory/.$executable.tmp.$$"
  install -m 755 "$distribution/$executable" "$temporary_target"
  mv -f "$temporary_target" "$install_directory/$executable"
done

echo "Installed $installed_version in $install_directory"
case ":${PATH}:" in
  *:"$install_directory":*) ;;
  *)
    if [ "$install_directory_was_default" -eq 1 ] &&
       [ "$(id -u)" -ne 0 ] &&
       [ "$install_directory" = "$HOME/.local/bin" ]; then
      shell_name=${SHELL##*/}
      case "$shell_name" in
        bash) profile="$HOME/.bashrc" ;;
        zsh) profile="$HOME/.zshrc" ;;
        fish) profile="$HOME/.config/fish/config.fish" ;;
        *) profile="$HOME/.profile" ;;
      esac
      mkdir -p "$(dirname "$profile")"
      touch "$profile"
      if [ "$shell_name" = fish ]; then
        # shellcheck disable=SC2016
        path_line='fish_add_path "$HOME/.local/bin"'
      else
        # shellcheck disable=SC2016
        path_line='export PATH="$HOME/.local/bin:$PATH"'
      fi
      if ! grep -Fqx "$path_line" "$profile"; then
        {
          echo
          echo "# Added by the Sage.js installer"
          echo "$path_line"
        } >> "$profile"
      fi
      echo "Added $install_directory to PATH in $profile."
      echo "Restart your shell or run: . $profile"
    else
      echo "Add $install_directory to PATH to run sagejs."
    fi
    ;;
esac
echo "To use Jupyter, run: sagejs --install-jupyter-kernel"
