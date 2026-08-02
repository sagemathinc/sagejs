# Sage.js serialization v1

Sage.js serialization is a safe mathematical data format designed for worker
threads, machines, checkpoints, caches, and durable research results. It is
not Python pickle: packets contain no executable code, module imports, or
constructor names to evaluate.

The stable schema identifier is:

```text
https://sagejs.org/serialization/v1
```

## Two representations, one object graph

`encode(value)` returns structured-clone-compatible records and out-of-band
`ArrayBuffer` blocks. Worker threads transfer those buffers without base64
expansion. `dumps(value)` writes the identical records as deterministic UTF-8
JSON, with buffers encoded as base64 for files and databases.

```js
const { encode, decode, dumps, loads } =
  require("@sagemath/sagejs/serialization");

const packet = encode(value);
worker.postMessage(packet, packet.buffers); // zero-copy buffer ownership move

const bytesForStorage = dumps(value);
const restored = loads(bytesForStorage);
```

From Sage/Python source:

```python
from sagejs_serialization import dump, dumps, load, loads

data = dumps(matrix(GF(7), 100))
A = loads(data)

with open('result.sagepack', 'wb') as output:
    dump(A, output)
```

`multiprocessing.Pool` uses structured-clone packets automatically. Users do
not need to call the serializer around pool arguments or results.

## V1 guarantees

- Exact integers, non-finite floating-point values, binary data, nested
  containers, recursive lists, and shared references round trip exactly.
- Mathematical parents are explicit records and are interned on loading.
- Initial mathematical codecs cover `ZZ`, `QQ`, prime finite fields,
  `Zmod(n)`, their scalar elements, univariate polynomials, vectors, and dense
  matrices.
- Dense matrices over prime fields and residue rings of order at most
  `2^32` use packed little-endian transferable buffers instead of one object
  per entry.
- Dense `ZZ` matrices use one packed signed-magnitude buffer. Zero and small
  entries require only a four-byte length/sign header plus their significant
  bytes; arbitrary-size entries remain exact.
- Plain-object keys are sorted so repeated dumps of the same object graph are
  byte-for-byte deterministic. Mapping insertion order remains semantically
  significant and is preserved.
- Loading validates the schema, versions, references, buffer types, object
  count, and the v1 four-GiB packet limit.
- Unknown record types or codec versions fail closed.
- Functions and symbols are rejected. Loading never evaluates source.

The portable JSON representation is intended for interoperability and stable
fixtures, not hand editing. Code should use the public API rather than depend
on record layout details beyond the schema identifier.

The durable representation currently pays JSON framing and base64 expansion;
worker-thread packets do not. On the reference Linux builder, a random
100-by-100 `ZZ` matrix encodes/decodes in roughly 8/2 ms, while SageMath
10.9 `save/load` takes roughly 2.4/2.0 ms for the same shape. A million-entry
`GF(7)` matrix encodes/decodes in roughly 60/12 ms. These figures are
directional, not test thresholds, but establish the baseline for a future
binary durable container which can remove the JSON/base64 cost without
changing the v1 object graph.

## Codec registry

Mathematical packages add types through `registerCodec`:

```js
const unregister = registerCodec({
  type: "example.package/type-name",
  version: 1,
  test(value) { /* return true only for owned values */ },
  encode(value, context) {
    return context.encode({ parent: value.parent, payload: value.data });
  },
  decode(payload, context) {
    const data = context.decode(payload);
    return reconstruct(data.parent, data.payload);
  },
});
```

Type names and payload versions are permanent public data contracts. A package
owns the codecs for its mathematical objects. Decoders may call trusted local
constructors registered in code, but serialized input cannot select or supply
code to execute.

## Compatibility policy

V1 readers will continue to read valid v1 records. Changing the meaning of an
existing `(type, version)` pair is forbidden. Incompatible payload changes use
a new codec version; incompatible envelope changes use a new schema version.
Golden fixtures should accompany every long-lived mathematical codec.

The next additions should prioritize research result types: extension and
number fields, ideals, elliptic curves and points, modular-symbol subspaces,
Hecke data, decompositions, and proof certificates.
