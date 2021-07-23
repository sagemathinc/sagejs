#!/usr/bin/env bash
set -ev

cd $BUILD

### Download and build MPFR
curl https://www.mpfr.org/mpfr-current/mpfr-$MPFR_VERSION.tar.xz -o mpfr-$MPFR_VERSION.tar.xz
tar xvf mpfr-$MPFR_VERSION.tar.xz
rm mpfr-$MPFR_VERSION.tar.xz
cd mpfr-$MPFR_VERSION

time CC_FOR_BUILD=gcc ABI=long emconfigure ./configure --build i686-pc-linux-gnu --host=none --with-gmp="$PACKAGES"/gmp/dist/local/ --prefix=$PREFIX CFLAGS="-O3 -Wall"

time emmake make -j 4

emmake make install

