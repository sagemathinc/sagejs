#!/usr/bin/env bash
set -ev

cd $BUILD

### Download and build GF2X.
curl $GF2X -o gf2x-$VERSION.tar.gz
tar xvf gf2x-$VERSION.tar.gz
rm gf2x-$VERSION.tar.gz
cd gf2x-$VERSION

time CC_FOR_BUILD=gcc emconfigure ./configure --disable-hardware-specific-code --build i686-pc-linux-gnu --host=none --prefix=$PREFIX CFLAGS="-O3 -Wall"

time emmake make -j 4

emmake make install

