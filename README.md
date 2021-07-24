# SAGEJS -- Bringing value from SageMath to the Javascript Ecosystem

## Building everything from source

On a Linux system with a lot of dependencies installed, you can do
```sh
cd src
make
```
to build all of the WASM libraries for all packages.

The dependencies are extensive, since it's what's required by the build systems of all of these packages.

- autoconf toolchain, so `./autogen.sh` works.
- emscripten SDK and whatever it requires
- perl

## What do you get

A bunch of statically linked libraries and a few WASM binaries that you can run from node.js.   The main point of this right now is figuring out to what extent it is possible to build the dependencies of SageMath using emscripten.  It's likely some things, e.g., Maxima, are nearly impossible.  However, with enough work, others might be pretty easy.