#!/usr/bin/env bash
set -ev

cd $BUILD

### Download and build GMP
curl https://gmplib.org/download/gmp/gmp-$GMP_VERSION.tar.lz -o gmp-$GMP_VERSION.tar.lz
tar xf gmp-$GMP_VERSION.tar.lz
rm gmp-$GMP_VERSION.tar.lz

cd gmp-$GMP_VERSION

CC_FOR_BUILD=gcc ABI=standard emconfigure ./configure --build i686-pc-linux-gnu --host=none --disable-assembly --prefix="$PREFIX" CFLAGS="-O3"

emmake make -j 8

emmake make install
