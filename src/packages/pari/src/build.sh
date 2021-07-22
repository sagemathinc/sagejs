#!/usr/bin/env bash
set -ev

. "$INIT_CWD"/src/build-env.sh

rm -rf "$BUILD" "$DIST"
mkdir "$BUILD" "$DIST"
cd "$BUILD"

curl https://pari.math.u-bordeaux.fr/pub/pari/unix/pari-$VERSION.tar.gz -o pari-$VERSION.tar.gz
tar xvf pari-$VERSION.tar.gz
rm -rf pari-$VERSION.tar.gz
cd pari-$VERSION

# --graphic=none since we obviously can't build X11 support.
emconfigure ./Configure --host=wasm-emscripten --graphic=none --prefix=$PREFIX

# We have to undefine UNIX because otherwise es.c tries to call getpwuid.
# This is because they don't detect that in Configure.  There is even
# a comment in es.c about this: "/* FIXME: HAS_GETPWUID */"
echo "#undef UNIX" >> Oemscripten-wasm/paricfg.h

cd Oemscripten-wasm

# We then remove gp-sta.js and build it with the extra options.
# CC_FLAVOR emscript settings below.
# Explanation of each of these:
#  - ERROR_ON_UNDEFINED_SYMBOLS=0  -- entirely because we do not have popen yet; need to sort that out (TODO)
#  - the exported function and methods because those are what we use.
#  - initial memory: I just set the max value. TODO: Probably NOT good!
#  - MODULARIZE=1: so we build a normal npm module that we can require in node.

export CC_FLAVOR="\
  -s ERROR_ON_UNDEFINED_SYMBOLS=0 \
  -s EXPORTED_FUNCTIONS=[\'_gp_embedded\',\'_gp_embedded_init\',\'_pari_emscripten_plot_init\',\'_main\'] \
  -s EXPORTED_RUNTIME_METHODS=[\'ccall\',\'cwrap\'] \
  -s INITIAL_MEMORY=2146435072 \
  -s MODULARIZE=1"
emmake make "CC_FLAVOR=$CC_FLAVOR" -j4

emmake make install

cp gp-sta* "$DIST"/
