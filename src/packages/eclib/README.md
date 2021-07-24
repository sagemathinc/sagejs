# FLINT: fast library for number theory

This is a cross-platform wasm build that make the functionality of FLINT available to web assembly. Currently you might use this by writing a C/C++ program that relies on FLINT, and links in the libraries built using the recipe here, then building that for deployment on the web using [emscripten](https://emscripten.org/).

## Test a program using FLINT

There are examples in `flint-*/examples`, and we copy some of them here in src/examples. For example, to build `primegen`, do as in src/examples:

```sh
~/sagejs/src/packages/flint/src/examples$ make run-primegen
emcc primegen.c -o primegen.js ... -lflint -lmpfr -lgmp
node ./primegen.js 20
2
3
5
7
11
13
17
19
```

There's also a C++ example:

```sh
$ ~/sagejs/src/packages/flint/src/examples$ make run-partitions
em++ partitions.cpp -o partitions.js ... -lflint -lmpfr -lgmp
node ./partitions.js 2021
p(2021) =
8518741657943308344041302580996941768179250799
```

