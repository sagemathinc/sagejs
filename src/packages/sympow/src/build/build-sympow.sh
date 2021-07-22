#!/usr/bin/env bash
set -ev

cd $BUILD

### Download and build Sympow
git clone https://gitlab.com/rezozer/forks/sympow.git
cd sympow

# Put in a fake help2man so that Configure works.
# TODO: we make fork upstream and get rid of this dep...?
echo "" > ./help2man
chmod +x help2man
export PATH=`pwd`:$PATH
touch sympow.1 # what would be output by help2man

time emconfigure ./Configure

time emmake make -j4

emmake make install

# Of course sympow doesn't know about our wasm file.
cp sympow.wasm $PREFIX/bin/

