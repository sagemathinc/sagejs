#!/usr/bin/env bash
set -ev

. "$INIT_CWD"/src/build/build-env.sh

rm -rf "$BUILD" "$DIST"
mkdir "$BUILD" "$DIST"

"$INIT_CWD"/src/build/build-package.sh

cd "$INIT_CWD"/src/example
make install
make clean
