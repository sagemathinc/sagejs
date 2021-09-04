#!/usr/bin/env bash

# This should get sourced from the directory that contains src (i.e. the build.sh script).

# See https://www.python.org/downloads/source/
export PYTHON_VERSION=3.9.7

export BUILD="$INIT_CWD"/build
export SRC="$INIT_CWD"/src
export DIST="$INIT_CWD"/dist
export PREFIX="$DIST"/local
export PREFIX_NATIVE=$BUILD/local-native