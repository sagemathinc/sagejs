# Certified real and complex interval arithmetic

Sage.js provides Sage-compatible MPFR rounding and certified Arb/Acb ball
arithmetic on Node.js and in the browser. The public parents are
`RealIntervalField(precision)` and `ComplexIntervalField(precision)`; their
default 53-bit instances are `RIF` and `CIF`.

```py
R = RealIntervalField(80)
x = R(1/3)
assert 1/3 in x
print(x.str(style="brackets"))

C = ComplexIntervalField(80)
z = C(x, x)
assert C(1/3, 1/3) in z
print(z.exp())
```

## Guarantees

- Integer and rational construction starts from exact values.
- Decimal and endpoint construction rounds the lower endpoint downward and
  the upper endpoint upward.
- Arithmetic, integer powers, elementary functions, and extracted endpoints
  are enclosures produced by Arb or Acb, not midpoint approximations.
- Native Linux, macOS, and Windows builds use the FLINT addon. Browser builds
  use the same FLINT/Arb implementation compiled to WebAssembly.
- If the active backend cannot provide certified intervals, construction
  raises an explicit capability error. Sage.js does not fall back to
  JavaScript binary64 or claim that an uncertified result is an interval.

The supported real operations are `+`, `-`, `*`, `/`, integer powers,
containment, `overlaps`, `intersection`, connected `union`, `lower`, `upper`,
`center`, `radius`, `absolute_diameter`, `relative_diameter`, `sqrt`, `exp`,
`log`, `sin`, `cos`, and `tan`. Complex intervals support arithmetic, integer
powers, containment, overlap, real and imaginary parts, and the same
elementary functions.

Question-mark formatting is the default and bracket formatting exposes the
outward endpoints:

```py
R = RealIntervalField(10)
a = R(1/9)
assert repr(a) == "0.112?"
assert a.str(style="brackets") == "[0.11108 .. 0.11121]"
```

`RealField(precision, rnd=...)` accepts `RNDN`, `RNDU`, `RNDD`, `RNDZ`, and
`RNDA`. Its elements provide `nextabove()`, `nextbelow()`,
`exact_rational()`, `sign_mantissa_exponent()`, `frac()`, and
`str(base=2)`. These operations use MPFR directly; JavaScript numbers are not
used as their rounding oracle.

## Resource and startup behavior

Arb and Acb values are owned resources. Native values are finalized by the
Node addon. The WebAssembly backend maintains a bounded live-handle cache and
stores exact binary snapshots, so an evicted value can be restored without
rounding through decimal text. Explicit close operations and garbage
collection both release resources.

The field-parent facades are part of the small bootstrap namespace so `RIF`,
`CIF`, and tab completion are immediately available. The element classes and
operations live in the lazy `sagejs.intervals` module and load only when an
interval is first constructed.
