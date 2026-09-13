# Extension-field oracle provenance

`extension-fields-sage-oracles-v1.json` contains 108 independently computed
SageMath results. It covers six explicit fields, all three supported global
orders, and zero/unit, positive-dimensional, order-sensitive, homogeneous,
and nonradical ideals. The fixture includes reduced bases, Krull dimensions,
and zero-dimensional standard-monomial data.

The zero ideal is normalized from Sage's `[0]` to the storage-neutral empty
basis. All other coefficients and exponents are exact data, not parsed output.
Field coefficients are canonical decimal power-basis coordinates.

The oracle is SageMath 10.9, upstream tag commit
`686dc1a8d420c2e0aabadd4f602d9a0aa4690c50`, installed from conda-forge's
`sagelib-10.9-np2py314h48e75e5_0` package. Its SHA-256 is
`c49e91e87c1726e32974122a269ff48e84917ccbc629ba5cdb49ac1491f59791`.
The upstream revision and downstream package digest are both recorded because
a distribution package may contain downstream changes.

Reproduction in an isolated conda-forge Sage environment:

```sh
python test/fixtures/generate-extension-fields-sage.py \
  --upstream-commit 686dc1a8d420c2e0aabadd4f602d9a0aa4690c50 \
  --package conda-forge/sagelib-10.9-np2py314h48e75e5_0 \
  --package-sha256 c49e91e87c1726e32974122a269ff48e84917ccbc629ba5cdb49ac1491f59791
```

For a conventional Sage installation, use `sage -python` instead of `python`,
and record the actual installation's provenance. The generator imports
`sage.all`; it cannot run through Sage.js or manufacture expected answers
from the implementation under test.

Default production Wasm tests use six representative cases spanning the six
fields and three orders. Full production qualification explicitly selects all
108 cases, in six field-sized batches with progress and a timeout per batch:

```sh
SAGEJS_EXTENSION_FIELDS_FULL=1 node --test --test-concurrency=2 \
  packages/flint-wasm/test/generic-groebner.test.mjs \
  packages/flint-wasm/test/extension-fields-browser.mjs
```

This corpus also performs repeated certificate checks and reparenting, beyond
just computing a basis. It is an exhaustive integration check, not a routine
latency benchmark. The initial single-evaluation Wasm runs exceeded their
120/150-second budgets. Batching makes progress visible and stops qualification
at the first failed batch; the default smoke set keeps routine testing bounded.

Routine verification needs only CPython. The checker uses independently
written modular polynomial coefficient arithmetic and compares the generic
Buchberger engine with the frozen Sage answers. It also checks complete
transformation certificates and their encoded round trips. The public-runtime
fixture instead uses Sage.js's real field elements and checks reparenting of
decoded certificates after a cosmetic generator rename.

SageMath (and its Singular implementation used by these oracle computations)
are validation tools only, never production dependencies of Sage.js. No
upstream implementation source was copied into these fixtures or the engine.

The current corpus is the E0 Gröbner/quotient foundation. It does **not** yet
qualify public geometry, extension-field primary decomposition, or number
fields; later phases must add their own independent fixtures and target runs.
