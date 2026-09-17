# Prepared exponential 153152-bit entry audit

## Scope

The authentic field-3 C6 input contains four nonzero real logarithms at
153152 bits, one guard limb above the nominal 153088-bit result precision.
Their exponents are 12, 14, 16, and 17.  The prepared exponential entry used
to reject all four before doing arithmetic because its input guard ended at
153088 bits.

This change admits exactly that additional 64-bit input limb.  It does not
change range reduction, transcendental arithmetic, storage representation, or
the public C6 protocol.  Inputs above 153152 bits continue to fail before
mutating the logarithm cache.

## Downstream capacity

For a 153152-bit input, `pari_modlog2` works at 153216 bits and requests the
logarithm-of-two constant at that precision.  The constant implementation's
own guard precision is 153280 bits.  Both are below the independently reviewed
154112-bit limit of real conversion, resize, short-product, reciprocal,
binary-splitting, and exponential primitives.

The centered range-reduction remainder is smaller than `log(2)/2`, so its
exponent is at most -2.  At 153216 bits the `exp1r_abs` schedule adds 256 bits,
reaching 153472 bits, still below 154112.  The existing authentic runner's
16385 coefficient cells and 105 traversal cells cover the unchanged
binary-splitting schedule.

## Differential evidence

`check_compiled_exponential_entry.cjs` keeps its existing 661 PARI 2.17.4
cases and adds dense, normalized positive and negative 153152-bit mantissas
with exponents 16 and 17.  These match the precision, density, sign, and upper
exponent range of the authentic C5 owner without embedding that answer
artifact.  The checker compares each complete packed output triple exactly
across pristine PARI, CPython, and generated GMP.  Generated JavaScript
exercises the new 153152-bit range-reduction entry bound on a dense value with
zero reduction shift; its arbitrary-precision transcendental path is not a
153k-bit performance target.  A 153216-bit mutation must reject and leave the
caller-owned cache unchanged on both compiled backends.

The focused checker is deliberately not the authentic C6 attempt.  It
qualifies only the leaf that rejected that attempt and can be rerun without
consuming the campaign's one-attempt budget.
