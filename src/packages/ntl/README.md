# NTL: A Library for doing Number Theory

https://libntl.org/

## Quickstart

Install the package

```sh
$ npm i @sagemath/ntl
```

There's one included example of computing `(a+1)*(b+1)`:
```sh
$ cd node_modules/@sagemath/ntl/src/examples/example1
$ wasmer example.wasm
Enter two numbers: 
9
10
110
```

## TODO

This does not build yet. It's going to be VERY challenging, since NTL's build
scripts are nonstandard *perl*, and very much assume that it's not being cross
compiled.