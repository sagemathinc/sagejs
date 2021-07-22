#!/usr/bin/env bash
set -ev

export VERSION=2.13.2

rm -rf build dist
mkdir build dist
cd build
wget https://pari.math.u-bordeaux.fr/pub/pari/unix/pari-$VERSION.tar.gz
tar xvf pari-$VERSION.tar.gz
cd pari-$VERSION

# --graphic=none since we obviously can't build X11 support.
emconfigure ./Configure --host=wasm-emscripten --graphic=none

# We have to undefine UNIX because otherwise es.c tries to call getpwuid.
# This is because they don't detect that in Configure.  There is even
# a comment in es.c about this: "/* FIXME: HAS_GETPWUID */"
echo "#undef UNIX" >> Oemscripten-wasm/paricfg.h

cd Oemscripten-wasm

# Explanation of each of these:
#  - ERROR_ON_UNDEFINED_SYMBOLS=0  -- entirely because we do not have popen (no filesystem integration yet)
#  - the exported function and methods because those are what we use.
#  - initial memory: I just set the max value
#  - MODULARIZE=1: so we build a normal npm module that we can require in node.

emmake make "CC_FLAVOR=-s ERROR_ON_UNDEFINED_SYMBOLS=0 -s EXPORTED_FUNCTIONS=[\'_gp_embedded\',\'_gp_embedded_init\',\'_pari_emscripten_plot_init\'] -s EXPORTED_RUNTIME_METHODS=[\'ccall\',\'cwrap\'] -s INITIAL_MEMORY=2146435072 -s MODULARIZE=1"

cp gp-sta* ../../../dist/
cd ../../..
