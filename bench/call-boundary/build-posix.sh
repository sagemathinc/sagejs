#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
BUILD="${SAGEJS_BOUNDARY_BUILD:-$ROOT/build}"
NODE="${SAGEJS_BOUNDARY_NODE:-node}"
PYTHON="${SAGEJS_BOUNDARY_PYTHON:-python3}"
CC="${CC:-cc}"
NODE_VERSION="$($NODE -p 'process.versions.node')"
HEADERS="$BUILD/node-v$NODE_VERSION"

mkdir -p "$BUILD"
if [[ ! -f "$HEADERS/include/node/node_api.h" ]]; then
  ARCHIVE="$BUILD/node-v$NODE_VERSION-headers.tar.gz"
  curl --fail --location --silent --show-error \
    "https://nodejs.org/download/release/v$NODE_VERSION/node-v$NODE_VERSION-headers.tar.gz" \
    --output "$ARCHIVE"
  rm -rf "$HEADERS"
  tar -xzf "$ARCHIVE" -C "$BUILD"
fi

case "$(uname -s)" in
  Darwin)
    "$CC" -O3 -DNDEBUG -bundle -undefined dynamic_lookup \
      -I"$HEADERS/include/node" "$ROOT/napi_add.c" -o "$BUILD/add.node"
    ;;
  Linux)
    "$CC" -O3 -DNDEBUG -shared -fPIC \
      -I"$HEADERS/include/node" "$ROOT/napi_add.c" -o "$BUILD/add.node"
    ;;
  *)
    echo "build-posix.sh supports Linux and macOS" >&2
    exit 1
    ;;
esac

PYTHON_SUFFIX="$($PYTHON-config --extension-suffix)"
read -r -a PYTHON_INCLUDES <<<"$($PYTHON-config --includes)"
if [[ "$(uname -s)" == Darwin ]]; then
  "$CC" -O3 -DNDEBUG -bundle -undefined dynamic_lookup "${PYTHON_INCLUDES[@]}" \
    "$ROOT/python_add.c" -o "$BUILD/boundary_add$PYTHON_SUFFIX"
else
  "$CC" -O3 -DNDEBUG -shared -fPIC "${PYTHON_INCLUDES[@]}" \
    "$ROOT/python_add.c" -o "$BUILD/boundary_add$PYTHON_SUFFIX"
fi

printf 'Built %s and boundary_add%s\n' "$BUILD/add.node" "$PYTHON_SUFFIX"
