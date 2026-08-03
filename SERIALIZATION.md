# Sage.js serialization v1

Sage.js serialization is a safe mathematical data format designed for worker
threads, machines, checkpoints, caches, and durable research results. It is
not Python pickle: packets contain no executable code, module imports, or
constructor names to evaluate.

The stable schema identifier is:

```text
https://sagejs.org/serialization/v1
```

## Three representations, one object graph

`encode(value)` returns structured-clone-compatible records and out-of-band
`ArrayBuffer` blocks. Worker threads transfer those buffers without base64
expansion. `pack(value)` puts the identical graph into the binary SagePack v1
container for durable files. `dumps(value)` remains deterministic UTF-8 JSON,
with buffers encoded as base64, for interoperability and readable fixtures.

```js
const { encode, decode, pack, unpack, dumps, loads } =
  require("@sagemath/sagejs/serialization");

const packet = encode(value);
worker.postMessage(packet, packet.buffers); // zero-copy buffer ownership move

const bytesForStorage = pack(value);
const restored = unpack(bytesForStorage);

const portableJson = dumps(value); // backward-compatible JSON API
const restoredFromJson = loads(portableJson);
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

The Python-facing `dump/dumps` APIs write binary SagePack v1. `load/loads`
auto-detect and continue to read the earlier serialization-v1 JSON form.

## Binary SagePack v1 envelope

All integers are unsigned little-endian. The durable container is:

```text
8 bytes   magic: "SAGEPK1\0"
u32       envelope version (1)
u32       UTF-8 metadata byte length
u32       binary buffer count
u32       flags (0)
u64[]     byte length of each binary buffer
bytes     deterministic JSON metadata (schema, version, root, objects)
bytes[]   raw binary buffers in table order
```

V1 is limited to 4 GiB. Readers reject an unknown version or flags, malformed
UTF-8/JSON, invalid references, impossible lengths, truncation, and trailing
bytes before constructing mathematical values. A checked SHA-256 golden vector
in `test/serialization.cjs` fixes the byte-level format across platforms.

## V1 guarantees

- Exact integers, non-finite floating-point values, binary data, nested
  containers, recursive lists, and shared references round trip exactly.
- Mathematical parents are explicit records and are interned on loading.
- Mathematical codecs cover `ZZ`, `QQ`, prime finite fields, `Zmod(n)`, their
  scalar elements, univariate polynomials, vectors, and dense matrices.
- Research-object codecs cover extension number fields, quadratic and
  cyclotomic fields and their elements; elliptic curves and points; congruence
  subgroups; Dirichlet groups and characters; and ambient or coordinate
  subspace modular-symbol spaces and elements. Shared parents remain shared
  after loading.
- Dense matrices over prime fields and residue rings of order at most
  `2^32` use packed little-endian transferable buffers instead of one object
  per entry.
- Dense `ZZ` matrices use one packed signed-magnitude buffer. Zero and small
  entries require only a four-byte length/sign header plus their significant
  bytes; arbitrary-size entries remain exact.
- Dense `QQ` matrices use a native FLINT export/import path containing packed
  canonical numerator/denominator magnitudes. Rational vectors use the same
  portable entry format. Neither representation creates one JSON object per
  coefficient.
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

On the reference Linux builder, a random 100-by-100 `ZZ` matrix packs/unpacks
in roughly 6/3 ms, while SageMath 10.9 `save/load` takes roughly 2.2/1.5 ms.
A random 1000-by-1000 `QQ` matrix packs/unpacks in roughly 51/47 ms, versus
roughly 189/172 ms for SageMath. These are directional measurements, not test
thresholds. Reproduce the cross-runtime comparison with:

```sh
pnpm bench:serialization
```

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
owns and lazily registers the codecs for its mathematical objects;
serialization does not load those codec modules during startup. The package
graph checker mechanically verifies ownership of codec registration files.
Decoders may call trusted local
constructors registered in code, but serialized input cannot select or supply
code to execute.

## Compatibility policy

V1 readers will continue to read valid v1 records. Changing the meaning of an
existing `(type, version)` pair is forbidden. Incompatible payload changes use
a new codec version; incompatible envelope changes use a new schema version.
Golden fixtures should accompany every long-lived mathematical codec.

The next additions should prioritize ideals, Hecke operators and eigenvalue
data, decomposition certificates, and explicit proof certificates.
