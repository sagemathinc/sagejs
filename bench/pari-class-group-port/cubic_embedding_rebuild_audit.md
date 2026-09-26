# Authentic p2,240-capacity cubic embedding rebuild

## Closed dependency

`pari_cubic_embedding_rebuild` closes the remaining floating oracle input in
the successful h1 cubic retry for

```text
x^3 - 20018*x + 20034.
```

It consumes only the neutral monic polynomial and the exact integral basis

```text
[1, x, x^2 + 2*x - 13345].
```

No resident root, refined root, embedding value, logarithm, unit, relation, or
class-group answer is supplied. The ordinary Python source:

1. isolates three ordered real roots by exact integer sign changes;
2. refines each root with exact fixed-point Newton arithmetic at 2,496 bits;
3. rounds the roots to PARI's 2,176-bit packed representation; and
4. evaluates the integral basis using `make_M`'s direct/inverse Horner choice.

The final step intentionally preserves value-dependent precision. All roots
have 2,176-bit mantissas, while cancellation in the middle root's third basis
value grows that entry to 2,240 bits, exactly as in PARI.

## Differential result

`check_cubic_embedding_rebuild.cjs` creates a neutral 192-bit BNF with pristine
PARI 2.17.4 and independently calls `bnfnewprec(..., 2048)`. The oracle trace
has SHA-256

```text
bddd020a4cbdf5e19568110b5a1262f10ed93d4fffa13dfbd808ff60ea8c30ff.
```

CPython, generated JavaScript, native GMP storage, and tagged native storage
reproduce all three ordered root triples and all nine embedding triples
exactly. A cubic with an exact integral root exercises transactional failure:
all root, embedding, and state buffers retain their held values.

Run:

```bash
node bench/pari-class-group-port/check_cubic_embedding_rebuild.cjs \
  /home/user/upstream/pari-2.17.4
```

## Scope

This is deliberately the all-real monic cubic corridor required by h1. It is
not a replacement for PARI's generic `ZX_Uspensky` isolation, mixed-signature
complex roots, or higher-degree `get_roots`. The integer isolation bound is
capped, integral roots fail explicitly, and the accepted root precision is
fixed at the authenticated 2,176-bit request plus the reviewed 320-bit Newton
guard. Those restrictions keep the new leaf source-transparent and make every
unsupported case use the ordinary dynamic fallback rather than silently
claiming generic `nfnewprec` coverage.
