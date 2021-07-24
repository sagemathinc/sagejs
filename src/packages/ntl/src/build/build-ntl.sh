#!/usr/bin/env bash
set -ev

cd $BUILD

### Download and build NTL
curl https://libntl.org/ntl-$VERSION.tar.gz -o ntl-$VERSION.tar.gz
tar xvf ntl-$VERSION.tar.gz
rm ntl-$VERSION.tar.gz
cd ntl-$VERSION/src

./configure AR=emar RANLIB=emranlib PREFIX="$PREFIX" CXX=sage++ NATIVE=off TUNE=generic NTL_THREADS=off GMP_PREFIX="$PACKAGES"/gmp/dist/local/ GF2X_PREFIX="$PACKAGES"/gf2x/dist/local/

make -j 8

make install

