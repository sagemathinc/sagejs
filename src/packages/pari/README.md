# Pari without GMP

DEPRECATED: See the @sagemath/pari-gmp package instead, which is only slightly larger and significantly faster. Future development work will go there.

## Quickstart

Install the package

```sh
npm i @sagemath/pari
```

Then use it from node.js as follows:

```js
> (async ()=>global.gp = await require('@sagemath/pari')())()
Promise { <pending> }
> gp('factor(2^128 + 1)')
'%1 = 5\n'
> gp('\\p100')
   realprecision = 105 significant digits (100 digits displayed)
'\n'
> gp('contfrac(Pi)')
'%4 = [3, 7, 15, 1, 292, 1, 1, 1, 2, 1, 3, 1, 14, 2, 1, 1, 2, 2, 2, 2, 1, 84, 2, 1, 1, 15, 3, 13, 1, 4, 2, 6, 6, 99, 1, 2, 2, 6, 3, 5, 1, 1, 6, 8, 1, 7, 1, 2, 3, 7, 1, 2, 1, 1, 12, 1, 1, 1, 3, 1, 1, 8, 1, 1, 2, 1, 6, 1, 1, 5, 2, 2, 3, 1, 2, 4, 4, 16, 1, 161, 45, 1, 22, 1, 2, 2, 1, 4, 1, 2, 24, 1, 2, 1, 3, 1, 2, 1, 1, 10, 2, 5]\n'
```

## Build from source

You need to install [emscripten](https://emscripten.org/docs/getting_started/downloads.html). Then do

```
npm run build
```

## Problems/TODO

### Interrupting running code

Try `gp(factor(2^2001+1))` and hit control+c to try to interrupt the running computation. It terminates the Node.js interpreter as well, and there is no way to catch this.

### Using with webpack5 in your browser

Make it easy to use this in frontend browser code bundled up using webpack.
