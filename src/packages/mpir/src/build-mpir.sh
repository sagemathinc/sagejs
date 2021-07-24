#!/usr/bin/env bash
set -ev

cd $BUILD

### Download and build MPIR
git clone https://github.com/sagemathinc/mpir.git
cd mpir

CC_FOR_BUILD=gcc ABI=long emconfigure ./configure \
  --build i686-pc-linux-gnu \
  --host=none \
  --disable-assembly \
  --prefix="$PREFIX" \
  CFLAGS="-O3 -Wall"

emmake make -j 4

emmake make install