# SAGEJS -- Bringing value from SageMath to the Javascript Ecosystem

## Building everything from source

On a Linux system with dependencies installed, you can do
```sh
cd src
make
```
to build all of the WASM libraries for all packages.

You can see what the dependencies are and how to install them on Ubuntu Linux
by looking at `src/docker/Dockerfile`.  Alternatively, if you have Docker, you
can type `./build.sh` in that directory to create a minimal Docker image and
build everything inside of it.

## What do you get

A bunch of statically linked WASM libraries and a few WASM binaries that you can run using node.js for some simple tests at least.   The main point of this right now is figuring out to what extent it is possible to build the dependencies of SageMath using emscripten.  It's likely some things, e.g., Maxima, are nearly impossible... but we'll see.  However, with enough work, others might be pretty easy.