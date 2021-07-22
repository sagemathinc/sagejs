#!/usr/bin/env bash
set -ev

cd $BUILD

### Download and build MPIR
git clone git://github.com/wbhart/mpir.git mpir
cd mpir

# Checkout a specific commit we have tested with...
git checkout $COMMIT

# Create autoconf files
./autogen.sh

time CC_FOR_BUILD=gcc ABI=long emconfigure ./configure \
  --build i686-pc-linux-gnu \
  --host=none \
  --disable-assembly \
  --prefix="$PREFIX" \
  CFLAGS="-O3 -Wall"

time emmake make -j 4

emmake make install