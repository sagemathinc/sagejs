# Mixed-signature `cleanarch` and `cleanarchunit`

This lane ports the degree-four signature `(2, 1)` specialization of pristine
PARI 2.17.4 `src/basemath/buch2.c:899-973`, SHA-256
`904ced8034732c7fcfe1da393e23950aac0862b085150fdc24ce1e31beb7d1ac`.
The target is legacy field3,
`x^4 - 2000022*x - 2000042`; it does not publish a class or unit result.

`mixed_signature_cleanarch.py` is ordinary CPython-parseable source compiled
unchanged by `@native`. Its packed row-major boundary has two real
archimedean slots and one complex slot. In source order it:

- sums PARI's three already-weighted real logarithm components;
- adds `-sum/4` at each real place and `-2*sum/4` at the complex place;
- reduces real-place arguments modulo `2*pi` and the complex-place argument
  modulo `4*pi`, using the positive `modRr_i` representative;
- checks the post-clean product-formula residual; and
- publishes only after every column succeeds.

The unit leaf preserves `cleanarchunit`'s `gexpo(sum) <= -10` condition as the
binary64 threshold `abs(sum) < 2^-10`. It additionally performs the existing
rank-two downstream regulator gate. Product, argument-reduction, and
regulator failures leave the caller's output sentinel unchanged.

`check_mixed_signature_cleanarch.cjs` constructs neutral inputs in code. It
extracts and hashes pristine `buch2.c`, compiles an oracle exposing the actual
static `cleanarch` and `cleanarchunit`, and differentially checks CPython,
JavaScript, GMP, and tagged native execution. No PARI answer, class invariant,
unit, or regulator fixture is stored.

Run:

```bash
node bench/pari-class-group-port/check_mixed_signature_cleanarch.cjs \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4 \
  /scratch/pari-class-group-port-C7hzCV2b/pari-2.17.4.tar.gz
```
