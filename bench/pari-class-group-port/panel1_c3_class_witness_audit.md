# Panel-row-1 C3 class witness

This leaf consumes the immutable `c5442d0848ec…` presentation owner produced
from the authenticated panel-row-1 W0 trace. It does not accept the terminal
class-number tuple as an order certificate.

The first terminal `Vbase` descriptor is source descriptor 5. Replaying
`prime_ideal_hnf` from that descriptor computes

```text
P = [11,8,6; 0,1,0; 0,0,1].
```

The witness row-reduces the transpose of the complete 51-by-51 presentation
modulo 3. Its one-dimensional nullspace gives a quotient map to `F_3`; after
normalization, the source coordinate of `P` is 1. Every presentation column
maps to zero, so `P` is not principal.

The first computed presentation column is `3 e_5`. The retained identity
`R*V = presentation` transports it to 58 raw relation coefficients. The
witness exponentiates and multiplies the corresponding authenticated
principal generators in the cubic integral basis, including exact inverses
for negative coefficients. This computes an integral `alpha`; no coordinate
of `alpha` is stored in source as an expected fixture.

Finally, exact cubic ideal arithmetic independently computes `P^2`, `P^3`,
and the HNF of `(alpha)`. Only after `P^3 = (alpha)` succeeds is its HNF
compared with the frozen control

```text
[1331,437,831; 0,1,0; 0,0,1].
```

The coordinator authenticates the upstream owner, binds both source digests,
and publishes an atomic, idempotent, mode-0444 JSON owner. The focused checker
runs cold replay under a 600-second timeout and 4-GiB address-space limit,
checks the Smith and raw-relation identities independently, and rejects
mutations of provenance, descriptor, quotient coordinate, relation map,
principal generator, and both ideal-power outputs.

Run:

```bash
node bench/pari-class-group-port/check_panel1_c3_class_witness.cjs
```
