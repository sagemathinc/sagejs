#!/usr/bin/env bash
set -ev

. "$INIT_CWD"/src/build-env.sh

rm -rf "$BUILD" "$DIST"
mkdir "$BUILD" "$DIST"

"$INIT_CWD"/src/build-gmp.sh
