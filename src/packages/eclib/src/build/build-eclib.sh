#!/usr/bin/env bash
set -ev
cd $BUILD

### Now build ECLIB

git clone https://github.com/JohnCremona/eclib.git
cd eclib

./autogen.sh

export CXXFLAGS=-I"$PACKAGES"/gmp/dist/local/include"  "-I"$PACKAGES"/mpfr/dist/local/include
export LDFLAGS=-L"$PACKAGES"/gmp/dist/local/lib"  "-L"$PACKAGES"/mpfr/dist/local/lib
export LIBS="-lgmp -lmpfr"
emconfigure ./configure \
    --with-pari="$PACKAGES"/pari/dist/local/  \
    --with-ntl="$PACKAGES"/ntl/dist/local/    \
    --with-flint="$PACKAGES"/flint/dist/local/    \
    --prefix=$PREFIX \
    --enable-shared=no \
    --enable-static=yes \
    --with-boost=no

# We change PTHREAD_CFLAGS, which would be -pthread, which would break linking with all
# our other libraries.  We actually change it to allow for memory growth.
# We also change the empty BOOST_LIBS to let us link in gmp, which seems missing but needed.

emmake make PTHREAD_CFLAGS="-s ALLOW_MEMORY_GROWTH=1" BOOST_LIBS=-lgmp  -j4

emmake make PTHREAD_CFLAGS="-s ALLOW_MEMORY_GROWTH=1" BOOST_LIBS=-lgmp  install

cp progs/*.wasm "$DIST"/local/bin