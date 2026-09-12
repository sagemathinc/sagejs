# Bounded unit-coordinate maps

`result.unit_coordinate_map()` uses an existing complete
`ClassUnitComputation`. It does not start a second class/unit computation.
This first correctness slice is not full M1 qualification or detached replay.

```python
result = K.class_unit_group(proof=False, algorithm="buchmann-hecke")
M = result.unit_coordinate_map()
u = M.factored_exp((1, 2, -3))  # a rank-two example
assert M.log(u) == (1, 2, -3)
```

Coordinates are exact integers, ordered as the torsion exponent followed by
the free exponents. The torsion coordinate is reduced modulo its certified
order. `M.gens()` returns compact generators in that order. The computation's
existing `UnitGroupComputation.gens()` remains free-only. `M.exp(coords)` is
the explicitly expanded operation; `M.factored_exp(coords)` never expands
field-element powers. Compact-by-default generators are deliberate and are
not a claim that the computation object implements Sage's full unit group API.

## Authority and exactness

The generic engine authenticates the complete index-one saturation result
against its original sealed context. Both conditional-GRH and unconditional
results preserve their existing proof status. Contexts with interposed
callbacks/checkpoints or missing live authority may decline; they are not
silently replayed or rediscovered. Terminal snapshots are captured before
publication, including for unconditional results.
This adds eager snapshot work to unconditional terminal publication even if
no map is requested; qualification must account for that construction cost.

The map checks that authority on every operation, including compact cache
hits. Its additional snapshot binds the defining polynomial, maximal-order
basis, actual factor coefficients, torsion elements and certificate. A cache
entry is only a coordinate hint: the exact formal factored product is rebuilt
and compared against freshly read factor coefficients. No cached hash, caller
coordinate claim, or mutable completion flag grants authority.

For ordinary elements of the exact same field instance, bounded coefficient
sizes are checked first. Exact membership in the maximal order together with
exact norm `+1` or `-1` proves that the input is a unit. Norm alone would not.
Weighted logarithms and determinant ratios enclose the true free coordinates.
Membership and completeness imply those coordinates are integers; precision
is increased until each enclosure contains exactly one integer. In fields
with a real embedding, factorwise signs identify the remaining torsion `+1`
or `-1`. This does not expand the residual product.

Rank-zero specialized results are admitted only through the exact standard
rank-zero completion certificate, exact signature and verified complete
torsion. Ordinary rank-zero coordinates use exact torsion-element equality.
No field or proof authority is inferred from an empty generator list.

## Explicit first-slice limits

- Supported generic ranks: zero through three; ordinary positive-rank logs
  currently require a real embedding and torsion order two.
- `log()` accepts exact formal matches to its certified generators, the bounded
  cache of this map's directly constructed compact outputs, and the empty
  product. Other nonempty factored inputs, including products formed outside
  the map or detached reconstructed products, currently
  raise `UnitCoordinateCapabilityError`. They are never expanded or reported
  as nonunits merely because membership is unsupported.
- Other specialized completion authorities currently decline explicitly.
- Default limits are 4,096 bits for input coefficients, coordinates and log
  precision, and `max_expansion_weight=1000000`, a weighted expansion-size
  policy proxy (not a proved work or memory bound). The
  compact cache holds 32 results. Limits are caller-configurable within fixed
  finite ranges. These arithmetic size limits are not a hard wall-clock or RSS
  guarantee. Precision exhaustion raises `UnitCoordinateResourceError`.
- Explicit `exp()` preflights exponent-weighted coefficient/field height
  before evaluating powers. It can decline even mathematically small products
  whose cancellation is not evident in their factor representation.
- Detached map receipts/replay, bounded arbitrary factored membership,
  complex positive-rank torsion reduction and broader specialized authorities
  remain required later work. Successful round trips do not satisfy those
  obligations.

The dedicated regression uses previously exposed cubic/quartic and rank-zero
fixtures, not campaign holdouts. CPython exercises the same interval-coordinate
helper with an independent rational interval/determinant oracle; Sage.js
exercises the public map and actual rigorous logarithm implementation. No
performance improvement or optimization campaign is claimed.
