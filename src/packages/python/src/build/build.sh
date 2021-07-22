#!/usr/bin/env bash
set -ev

. "$INIT_CWD"/src/build/build-env.sh

rm -rf $BUILD
mkdir $BUILD

"$INIT_CWD"/src/build/build-python.sh