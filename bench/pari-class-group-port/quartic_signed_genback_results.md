# Quartic signed `genback` result

This lane extends the source-transparent PARI 2.17.4 port to the first frozen
mixed quartic whose active Smith column is not a single inverse prime.

## Authentic fixture

- field: `x^4 - 200000002*x - 200000002`
- class group: `[24, 8]` in PARI's generator order
- exercised Smith column: `(-2, -1, -1)` on factor-base primes
  `5099, 5659, 5939`
- schedule: square the first prime ideal, invert it, invert the second prime,
  multiply and reduce, invert the third prime, multiply and reduce

The implementation computes every T2/LLL candidate from the rounded trace
form and the current ideal. It does not consume an oracle candidate tape. The
seven candidates, intermediate ideals, final two generator ideals, and all
seven principal factors in source order agree with a pristine PARI 2.17.4
trace. The last product crosses the machine-word boundary: its HNF modulus is
`167617610254588861937`.

The focused checker passed with the same ordinary Python source under CPython,
JavaScript exact integers, GMP buffers, and tagged integers. The pristine PARI
archive is pinned by SHA-256 before its oracle is compiled.

## Boundary reached

This closes the exact degree-four signed ideal arithmetic needed by this
generator: multiplication, scaled inversion, signed power scheduling,
multiword composite HNF, non-scalar T2/LLL reduction, and ordered factor
publication. The output is the authentic `G/Ge` input needed by the existing
class-group assembly.

The next connected primitive is mixed-signature `nf_cxlog` for the seven
non-scalar quartic basis elements. The earlier quartic assembly fixture only
needed scalar inverse-prime logarithms, so it cannot discharge this boundary.
No claim is made here about final `Ga/GD/ga` until those complex logarithms are
computed and independently replayed.

## Validation

Run:

```bash
node bench/pari-class-group-port/check_quartic_signed_genback.cjs
```

The focused run reports `qualifiedTiming: false`: this is a correctness and
connectedness result, not a performance measurement.
