---
title: "Packed ABI and Wasm32 rules"
---

# Packed ABI and Wasm32 rules

The Sage.js compiled boundary is a data protocol, not a foreign object model.
JavaScript, Node-API, and WebAssembly adapters exchange fixed-width scalars,
checked spans, canonical copied bytes, or opaque handles. Public FLINT/GMP/Arb
objects and raw pointers never cross it.

## Wasm32 types

External fields use `uint8_t`, `int32_t`, `uint32_t`, `int64_t`, or
`uint64_t` with an explicit range. Do not expose C `long`, `unsigned long`,
`size_t`, a pointer, or FLINT `slong`/`ulong`: their width is a property of the
compiled target.

Offsets and lengths in Wasm linear memory are unsigned 32-bit values. Validate
without wrapping:

```c
static int range_is_valid(uint32_t offset, uint32_t count,
                          uint32_t width, uint32_t memory_bytes)
{
    if (count != 0 && width > UINT32_MAX / count)
        return 0;
    const uint32_t length = count * width;
    return offset <= memory_bytes && length <= memory_bytes - offset;
}
```

Also validate alignment, element count, dimensions, output capacity, and every
conversion to the library's internal word type. Never validate only the start
address. A zero-length span is valid only under the operation's documented
null/empty rule.

The current target is `wasm32-wasip1` with little-endian typed storage. Formats
that must survive outside a live module carry their own magic/version and
define byte order explicitly.

## Packed exact values

Use the representation declared for the operation:

- `UInt64Buffer` is a row-major or coefficient-major typed buffer of exact
  unsigned words with a separately validated modulus or shape.
- `IntegerBuffer` uses a signed limb count plus fixed-capacity little-endian
  64-bit limbs for each value. Zero has count zero; unused limbs are zero.
- copied exact integers may use a canonical sign-and-magnitude byte record or
  decimal text when the schema declares it.
- rational records carry canonical numerator and positive denominator values;
  normalize above or inside the shared core exactly once.
- approximate arbitrary-precision complex values use exact decimal transport
  plus accuracy/enclosure flags. A packed binary64 plot buffer is a distinct,
  explicitly non-rigorous display protocol.

There is intentionally no permission to reinterpret an `fmpz`, `mpz_t`,
`arb_t`, or `acb_t` memory layout. Those layouts depend on the library build
and allocator.

Canonical serializers reject negative zero, leading zero magnitude bytes,
impossible limb counts, a zero denominator, trailing data when forbidden, and
non-normal forms. Compute all aggregate sizes with checked addition and
multiplication before allocating.

## One transaction per batch

For a batch operation:

1. Validate public values and compute bounded dimensions in the host.
2. Reserve one staging region.
3. Copy all packed inputs.
4. Call one exported core operation.
5. Read the bounded status and output size.
6. Validate the complete output range against the current memory.
7. Copy into host-owned storage.
8. Materialize public Sage objects above the ABI.

Do not cross once per coefficient, matrix entry, prime, or sample. If the
result may be too large, return a required size or bounded resource and retry
through a documented protocol. Partial writes must not become public state.

Memory growth detaches or replaces JavaScript views. Create a fresh view from
the current `memory.buffer` for every transaction and do not retain it across a
call that can allocate. A copied-byte result must be copied before its owner is
mutated or closed.

## Resource ownership

Variable-size library objects remain inside the module that allocated them.
A handle is an opaque unsigned 64-bit `(generation, slot + 1)` token, not a
pointer. The adapter validates its module, type, live bit, slot, and generation
on every call.

Owned resources have deterministic idempotent `close()` plus a finalizer safety
net. Borrowed views retain their owned root and become invalid immediately
when that root closes. No allocator-owned pointer crosses between the FLINT
and M4RI modules; cross-module transfer uses canonical copied bytes.

## Status and failure

Compiled functions do not throw across the C ABI. Return a small documented
status domain, for example success, invalid argument, invalid handle, range,
allocation, or library failure. The host maps it to the public exception only
after native execution returns and cleanup completes.

“Accelerator unavailable” is dispatch metadata, not an ABI failure. An exact
portable fallback may be selected before the call. Conversely, allocation
failure or an invalid mathematical input must not be disguised as missing
capability.

## Review checklist

- Are all external integer widths and byte orders explicit?
- Are multiplication, addition, pointer conversion, and library-word
  conversions checked?
- Is input immutable unless mutation is declared?
- Is output transactional and bounded?
- Are current memory views reacquired after possible growth?
- Is every resource closed in its allocating module?
- Does the public layer materialize objects identically on Node and Wasm?
- Are malformed, overflow, stale-handle, growth, and zero-length cases tested?
- Is the boundary represented in the capability and native-code inventories?

The generated implementation lives in
[`tools/ffi/wasm-adapters.cjs`](../tools/ffi/wasm-adapters.cjs); the general
ownership model is specified in [FFI.md](../FFI.md) and
[ARCHITECTURE.md](../ARCHITECTURE.md).
