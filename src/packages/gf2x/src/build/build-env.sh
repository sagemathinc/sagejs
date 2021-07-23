#!/usr/bin/env bash


# See https://gitlab.inria.fr/gf2x/gf2x/-/releases and copy the link under "other"
# for "gf2x-xxxx.tar.gz (source tarball, ready to `./configure ; make`)"
# It has a sha1 so we can't just set the env var to a version.
export GF2X=https://gitlab.inria.fr/gf2x/gf2x/uploads/c46b1047ba841c20d1225ae73ad6e4cd/gf2x-1.3.0.tar.gz
export VERSION=1.3.0

export BUILD="$INIT_CWD"/build
export DIST="$INIT_CWD"/dist
export PREFIX="$DIST"/local
export PACKAGES="$INIT_CWD"/..