# Packed prime-field polynomial SagePack

Univariate polynomials over word-sized prime fields canonically own a
normalized low-to-high `UInt64Buffer`. SagePack writes that storage as
little-endian one-, two-, four-, or eight-byte residues instead of first
expanding it into Python field-element objects. One-, two-, and four-byte
widths are used for moduli at most `2^8`, `2^16`, and `2^32`; every larger
unsigned-word modulus uses eight bytes. The polynomial parent in the packet
continues to carry the field order, variable name, and sparse flag. The element
payload uses the versioned `prime-field-poly-le-v1` encoding tag, canonical
residue width, and coefficient count.

The decoder validates the exact byte length, canonical width for the exact
modulus, every residue, and the absence of a trailing zero coefficient. In
particular, eight-byte values and moduli are never converted through a lossy
JavaScript `Number`. The empty byte stream is the unique zero polynomial.
Existing SagePack v1 payloads whose coefficients are generic object arrays
remain readable.

## Performance witness

The original small-prime witness is

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

The word-prime witness uses `p = 2^61 - 1` with the same 20,000-coefficient
shape. Before the eight-byte path, its generic object encoding occupied about
4.18 MB and measured 78 ms to dump and 139 ms to load. On the same development
Linux x64 class of host after this migration, the canonical packet is 160,816
bytes; nine warm samples measured a 2.99 ms median dump and a 0.79 ms median
load. The correctness suite also exercises the prime
`18446744073709551557` immediately below `2^64`, including byte-level
little-endian vectors and rejection of out-of-field residues.
