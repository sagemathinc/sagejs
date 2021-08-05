#!/usr/bin/env bash


# See https://libntl.org/download.html
export VERSION=11.5.1

unset NODE
export BUILD="$INIT_CWD"/build
export DIST="$INIT_CWD"/dist
export PREFIX="$DIST"/local
export PACKAGES="$INIT_CWD"/..
export PATH="$PACKAGES"/../bin:"$PATH"