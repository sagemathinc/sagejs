#!/usr/bin/env bash
set -ev
cd $BUILD

### Now build ECLIB

git clone https://github.com/JohnCremona/eclib.git
cd eclib

./autogen.sh

export CXXFLAGS=-I"$PACKAGES"/gmp/dist/local/include"  "-I"$PACKAGES"/mpfr/dist/local/include
emconfigure ./configure \
    --with-pari="$PACKAGES"/pari/dist/local/  \
    --with-ntl="$PACKAGES"/ntl/dist/local/    \
    --with-flint="$PACKAGES"/flint/dist/local/    \
    --prefix=$PREFIX \
    --enable-shared=no \
    --enable-static=yes

emmake make -j4

emmake make install

