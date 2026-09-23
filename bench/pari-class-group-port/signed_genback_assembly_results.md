# Signed `genback` to class-group assembly

This narrow connected experiment uses the authentic totally real cubic

```text
x^3 - 200*x + 7
```

from pristine PARI 2.17.4. Its accepted relation HNF is
`[[12,7],[0,2]]`, its Smith invariants are `[24,1]`, and the first real
`Uir` column is `[-3,-1]`. The connected native function derives that column
from the HNF; neither the signed relation nor any factor of `Ge` is supplied as
an answer-derived runtime input.

## Exact connected path

The source-order prime ideals are

```text
[[2,1,0],[0,1,0],[0,0,1]]
[[5,3,4],[0,1,0],[0,0,1]]
```

and pristine PARI selects the five T2/LLL candidates

```text
[4,0,0], [8,0,0], [8,0,0], [5,0,0], [-17,1,0].
```

The existing signed cubic `genback` translation consumes the internally
derived exponents `[-3,-1]` and produces

```text
G = [[38,21,34],[0,1,0],[0,0,1]]
Ge = [1/8,1; 1/5,1; [-17,1,0]^T,-1; 40,1].
```

The new adapter preserves this exact factor order and passes the generated
scalar/basis factors directly to `pari_class_group_assembly`, including its
prepared `nf_cxlog` stage. It also checks the independent Smith order identity

```text
[-3,-1]^T * 24 = [[12,7],[0,2]] * [1,-12]^T.
```

The pristine PARI replay independently verifies

```text
G * principal(Ge) = Vbase[1]^(-3) * Vbase[2]^(-1)
```

after ideal-HNF normalization. The dynamic CPython source path reproduces the
generator, factor provenance, Smith outputs, `Ga`, `GD`, and `ga` exactly.

## Scope

Candidate selection remains an explicit frozen source-order tape, as in the
underlying signed-genback experiment. This result connects the real Smith
column through ideal reconstruction, generated principal provenance, logarithm
evaluation, and final class-group assembly; it does not claim a generic
T2/LLL candidate selector or generic-degree ideal arithmetic.

The focused compiler run passed for the JavaScript, GMP, and tagged integer
backends, in addition to the dynamic CPython and pristine PARI controls. The
generated private native core was 18,672,685 bytes and contained no Python,
N-API, or V8 callback. A truncated candidate tape was rejected before the
final generator ideal was published.

The recorded oracle trace SHA-256 is
`271e77a9fee251cce497c25da0a3def0d1af827b86af82b2c1c9819ff86d7575`.
The checked composition-source SHA-256 is
`c7e4c880ec0e2abf8ba4a7032e4f1ebd4605a20c9e59d1ed34497c5b9ac4089f`.
