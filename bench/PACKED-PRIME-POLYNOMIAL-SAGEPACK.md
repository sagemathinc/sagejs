# Packed prime-field polynomial SagePack

Univariate polynomials over small prime fields canonically own a normalized
low-to-high `UInt64Buffer`. SagePack writes that storage as little-endian
one-, two-, or four-byte residues instead of first expanding it into Python
field-element objects. The polynomial parent in the packet continues to carry
the field order, variable name, and sparse flag. The element payload adds the
versioned `prime-field-poly-le-v1` encoding tag, canonical residue width, and
coefficient count.

The decoder validates the exact byte length, canonical width for the modulus,
every residue, and the absence of a trailing zero coefficient. The empty byte
stream is the unique zero polynomial. Existing SagePack v1 payloads whose
coefficients are generic object arrays remain readable.

## Performance witness

The ratcheted workload is

```python
R.<x> = GF(65521)[]
f = R([(index*37 + 11) % 65521 for index in range(20000)])
data = dumps(f)
assert loads(data) == f
```

On the development Linux x64 host with Node.js 26.7.0, the old generic codec
needed about 11.19 seconds to dump a 4,006,000-byte payload and 109 ms to load
it. The compact codec produces 40,802 bytes. Seven warm samples measured a
6.87 ms median dump and a 3.19 ms median load. The production polynomial
budget independently limits both operations to 100 ms for this degree-19,999
case.

The format and algorithm are host-independent: fixed-width residues are
written explicitly in little-endian order, never by exposing the machine byte
order of the underlying `BigUint64Array`.
