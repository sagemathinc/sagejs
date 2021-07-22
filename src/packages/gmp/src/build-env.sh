#!/usr/bin/env bash
set -ev

export GMP_VERSION=6.2.1
export BUILD="$INIT_CWD"/build
export DIST="$INIT_CWD"/dist
export PREFIX="$DIST"/local