# Extension-geometry oracle provenance

`extension-geometry-sage-oracles-v1.json` records independent SageMath 10.9
results over explicit presentations of GF(4) and GF(9). It includes radicals
of repeated Frobenius powers with non-prime coefficients, primary components
of two fat points, nonsplit residue factors, rational points, and affine and
projective ambient point counts. Polynomial coefficients are exact padded
power-basis coordinates; exponents are integer tuples.

The Sage installation is the same isolated conda-forge SageMath 10.9 package
identified in [the Gröbner oracle provenance](extension-fields-sage-oracles.md).
The generator imports `sage.all`, not Sage.js. Reproduce with:

```sh
sage -python test/fixtures/generate-extension-geometry-sage.py
```

The public-runtime consumer `test/extension-geometry-oracles.py` compares
ideals independently of component ordering, checks exact recomposition, and
compares rational points separately from nonsplit components. SageMath and
its Singular backend are test oracles only, not production dependencies.

These fixtures are small mathematical witnesses, not performance claims or
a substitute for source-current native and production-Wasm qualification.
