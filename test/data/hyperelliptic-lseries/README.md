# Hyperelliptic L-series oracles

`oracles.json` records exact conductor/sign data and independent numerical
values used by `test/hyperelliptic-global-lseries.cjs`.

The genus-2 rows are reproduced with PARI/GP by `oracle.gp`. The genus-3 curve

```text
y^2 + (x^4+x^2+1)y = x^7+x^6+x^5+x^3+x^2+x
```

is [Sutherland's smallest-conductor hyperelliptic genus-3
example](https://math.mit.edu/~drew/genus3curves.html) and has Jacobian
isogenous to `J_0(33)`. Since
`J_0(33) ~ E_11^2 x E_33`, its oracle values are the product of the two
independently evaluated elliptic L-functions. This avoids using Sage.js's own
genus-3 coefficient stream as the numerical oracle.

Run:

```bash
/path/to/gp -q test/data/hyperelliptic-lseries/oracle.gp
```
