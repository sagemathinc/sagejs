#!/usr/bin/env bash


# See https://www.mpfr.org/mpfr-current/#download
export MPFR_VERSION=4.1.0

export BUILD="$INIT_CWD"/build
export DIST="$INIT_CWD"/dist
export PREFIX="$DIST"/local
export PACKAGES="$INIT_CWD"/..