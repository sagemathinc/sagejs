#!/usr/bin/env bash
set -ev

cd $BUILD

# See http://www.multiprecision.org/mpc/download.html for versions:
export VERSION=1.2.1
curl https://ftp.gnu.org/gnu/mpc/mpc-$VERSION.tar.gz -o mpc-$VERSION.tar.gz
tar xvf mpc-$VERSION.tar.gz
rm mpc-$VERSION.tar.gz
cd mpc-$VERSION

CC_FOR_BUILD=gcc ABI=long emconfigure ./configure --build i686-pc-linux-gnu --host=none --with-gmp="$PACKAGES"/gmp/dist/local/ --with-mpfr="$PACKAGES"/mpfr/dist/local/ --prefix=$PREFIX CFLAGS="-O3 -Wall"

emmake make -j 4

emmake make install
