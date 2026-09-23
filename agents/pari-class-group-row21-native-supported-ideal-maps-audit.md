# Row-21 native arbitrary supported-ideal maps

`row21_native_supported_ideal_maps.py` closes the row-21 lazy map gap on a
precise mathematical domain: every integral or fractional quintic ideal HNF
whose complete prime-ideal support is contained in the authenticated 24-ideal
factor base. Inputs are arbitrary HNFs; callers do not provide or authenticate
a factor tape.

The source-transparent native boundary computes the exact degree-five
determinant with fraction-free Bareiss elimination. For every rational prime
dividing that norm it invokes the existing native translation of PARI 2.17.4's
prepared `idealval` algorithm, using the retained descriptor's `tau`,
ramification index, residue degree, and inert flag. It accepts only if:

1. every rational norm factor belongs to a retained prime group;
2. residue-degree-weighted prime-ideal valuations exhaust that norm valuation;
3. the reconstructed prime-ideal norm equals the original determinant.

A positive denominator contributes the negative ramification indices of its
principal rational ideal, but only when the complete decomposition of that
rational prime is retained. Everything else fails closed.

Since this row has class number one, the retained relation right inverse
reduces the resulting signed exponent tape to the empty class coordinate.
The result includes an exact signed combination of the 32 retained principal
relations; replay against the 32-by-24 relation matrix proves that combination
equals the input factor tape. Combine adds signed tapes and reruns the same
exact reduction.

## External owner and native claim

The previously committed `row21_arbitrary_ideal_map_owner.cjs` was used as the
API/oracle specification. The focused checker differentially submits a prime
ideal and a freshly multiplied supported HNF to PARI 2.17.4 and checks the
normalized ideals and trivial class coordinates. PARI is **not** linked,
spawned, or called by the native factor/reduce/combine path. The claimed map
therefore has no external PARI dependency. Ideals outside the retained support
require factor-base extension and are rejected, not silently delegated.

Validated coverage is:

```text
native factor-base prime HNF round trips       24
native arbitrary two-prime HNF round trips      1
fractional principal-denominator checks         1
out-of-support rejections                        2
maps ready                         factor/reduce/combine
```

This is correctness evidence, not qualified timing and not a general
unbounded `SPLIT`/`idealred` implementation. It is the supported-input branch
of the same job: direct native ideal valuation replaces `SPLIT` search whenever
the complete input support is already in the retained factor base.

Reproduce on Linux with:

```bash
SAGEJS_NATIVE_CACHE_DIR=/scratch/sagejs-row21-native-map-cache \
node bench/pari-class-group-port/check_row21_native_supported_ideal_maps.cjs
```
